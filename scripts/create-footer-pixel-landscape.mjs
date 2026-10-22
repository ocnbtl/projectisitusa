import sharp from "sharp";
import { mkdir } from "node:fs/promises";

// Original seeded pixel engraving, exported once rather than drawn in the browser.
// White + binary alpha is a color-independent plate; CSS supplies exact brand ink.
const clamp = (n, a=0, b=1) => Math.max(a, Math.min(b, n));
const smooth = n => { n=clamp(n); return n*n*(3-2*n); };
function rng(seed) { return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; }
function hash(x,y,seed=0) { let n=Math.imul(x+seed,374761393)^Math.imul(y,668265263); n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967296; }
function noise(x, seed) {
  const i=Math.floor(x), t=smooth(x-i);
  return hash(i,1,seed)*(1-t)+hash(i+1,1,seed)*t;
}
function screen(size=8) {
  let m=[[0]];
  while(m.length<size) { const n=m.length; m=Array.from({length:n*2},(_,y)=>Array.from({length:n*2},(_,x)=>4*m[y%n][x%n]+[[0,2],[3,1]][Math.floor(y/n)][Math.floor(x/n)])); }
  return m;
}
const bayer=screen();

async function landscape(width,height,name,mobile=false) {
  const random=rng(22102026+(mobile?7:0));
  const field=new Float32Array(width*height);
  const unit=height/450;
  const peaks=mobile
    ? [[0,.43],[.19,.29],[.38,.4],[.65,.16],[.81,.31],[1,.39]]
    : [[0,.43],[.08,.34],[.18,.22],[.29,.39],[.39,.31],[.5,.43],[.62,.32],[.73,.16],[.83,.34],[.93,.26],[1,.35]];
  const middle=mobile
    ? [[0,.62],[.25,.48],[.48,.61],[.77,.46],[1,.57]]
    : [[0,.63],[.13,.49],[.24,.6],[.37,.43],[.48,.57],[.61,.47],[.76,.61],[.89,.45],[1,.56]];
  const near=mobile
    ? [[0,.79],[.3,.7],[.57,.82],[.86,.69],[1,.76]]
    : [[0,.78],[.12,.7],[.28,.81],[.42,.69],[.61,.83],[.76,.71],[.9,.77],[1,.68]];
  function ridge(x,knots,seed) {
    const t=clamp(x/width); let i=0;
    while(i<knots.length-2&&t>knots[i+1][0])i++;
    const [a,b]=[knots[i],knots[i+1]];
    const p=(t-a[0])/(b[0]-a[0]);
    const rough=(noise(t*31,seed)-.5)*.025+(noise(t*103,seed+1)-.5)*.012+(noise(t*251,seed+2)-.5)*.005;
    return height*(a[1]+(b[1]-a[1])*p+rough);
  }
  const distant=Array.from({length:width},(_,x)=>ridge(x,peaks,13));
  const foothill=Array.from({length:width},(_,x)=>ridge(x,middle,29));
  const meadow=Array.from({length:width},(_,x)=>ridge(x,near,71));
  // Rugged skyline, alternating rock faces, striations, and a winding pale valley.
  for(let x=0;x<width;x++)for(let y=0;y<height;y++) {
    let tone=0;
    const depth=(y-distant[x])/height;
    if(depth>=0) {
      const slope=(distant[Math.min(width-1,x+3)]-distant[Math.max(0,x-3)])/6;
      const facet=noise(x/(height*.075)+depth*3,36);
      tone=.15+clamp(depth/.35)*.11+(slope>0?.055:0)+facet*.05;
      const contour=(y-distant[x]+x*.13)/unit;
      if(contour%8<1.2)tone-=.07;
      if(depth<.07&&(x+y*2)%37<4)tone-=.09;
    }
    if(y>=foothill[x]) {
      const d=(y-foothill[x])/height;
      tone=.32+clamp(d/.32)*.13+noise(x/(height*.035)+d*5,55)*.07;
      const fold=noise(x/(height*.12)+d*2.5,9);
      if(fold<.28&&d<.26)tone-=.12*smooth((.28-fold)/.17);
    }
    if(y>=meadow[x])tone=.57+clamp((y-meadow[x])/(height*.3))*.18;
    field[y*width+x]=tone;
  }
  function pixel(x,y,tone,opacity=1) {
    x=Math.round(x);y=Math.round(y);
    if(x<0||y<0||x>=width||y>=height)return;
    const p=y*width+x;
    field[p]=field[p]*(1-opacity)+tone*opacity;
  }
  function line(x0,y0,x1,y1,thickness,tone) {
    const steps=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)*1.3));
    const r=Math.max(.45,thickness/2);
    for(let s=0;s<=steps;s++) {
      const t=s/steps,cx=x0+(x1-x0)*t,cy=y0+(y1-y0)*t;
      for(let yy=Math.floor(cy-r);yy<=cy+r;yy++)for(let xx=Math.floor(cx-r);xx<=cx+r;xx++)if((xx-cx)**2+(yy-cy)**2<r*r+.5)pixel(xx,yy,tone);
    }
  }
  function leafCloud(cx,cy,rx,ry,tone,seed) {
    for(let y=Math.floor(cy-ry*1.15);y<=cy+ry*1.15;y++)for(let x=Math.floor(cx-rx*1.15);x<=cx+rx*1.15;x++) {
      const dx=(x-cx)/rx,dy=(y-cy)/ry;
      const angle=Math.atan2(dy,dx);
      const boundary=1+.12*Math.sin(angle*7+seed)+.065*Math.sin(angle*13-seed);
      if(dx*dx+dy*dy<boundary) {
        const grain=hash(Math.floor(x/2),Math.floor(y/2),seed);
        const light=clamp(-dx*.5-dy*.7,-.7,.7);
        pixel(x,y,clamp(tone-light*.10+(grain-.5)*.14));
      }
    }
  }
  function conifer(cx,base,h,tone,kind=0) {
    const lean=(random()-.5)*h*.08;
    const top=base-h;
    const tierCount=Math.max(5,Math.floor(h/(unit*8)));
    line(cx,base,cx+lean,top,Math.max(unit,h*.027),tone);
    for(let tier=1;tier<=tierCount;tier++) {
      const t=tier/tierCount;
      const y=top+h*(.08+t*.82);
      const center=cx+lean*(1-t);
      const spread=h*(kind===1?.27:.20)*Math.sin(t*Math.PI*.72)*(.82+random()*.35);
      for(const side of [-1,1]) {
        const reach=spread*(.75+random()*.35);
        const tipY=y+h*(kind===1?-.025:.05)*(.7+random()*.6);
        const tipX=center+side*reach;
        line(center,y,tipX,tipY,Math.max(unit*.6,h*.018),tone);
        const sprays=Math.max(3,Math.floor(reach/(unit*3)));
        for(let j=0;j<sprays;j++) {
          const p=(j+.4)/sprays;
          const sx=center+(tipX-center)*p,sy=y+(tipY-y)*p;
          const len=h*(.045+random()*.04)*(1-p*.45);
          const ang=-Math.PI/2+side*(.35+random()*.55);
          const ex=sx+Math.cos(ang)*len,ey=sy+Math.sin(ang)*len;
          line(sx,sy,ex,ey,Math.max(unit*.7,h*.018),tone-.025);
          for(let k=0;k<3;k++) {
            const a=ang+(k-1)*.6;
            line(ex,ey,ex+Math.cos(a)*len*.45,ey+Math.sin(a)*len*.45,Math.max(.55,unit*.65),tone-.08);
          }
        }
      }
    }
    line(cx-unit*.6,base,cx+lean-unit*.4,top+h*.2,Math.max(.55,unit*.7),tone-.22);
  }
  function broadleaf(cx,base,h,tone,kind=0) {
    const lean=(random()-.5)*h*.15;
    const branchSegments=[];
    const leaves=[];
    function branch(x,y,length,angle,depth,thickness) {
      const endX=x+Math.cos(angle)*length,endY=y+Math.sin(angle)*length;
      branchSegments.push([x,y,endX,endY,thickness]);
      if(depth<=0) {
        const size=h*(kind===1?.08:.105)*(.7+random()*.6);
        leaves.push([endX,endY,size,size*(.72+random()*.35),Math.floor(random()*10000)]);
        return;
      }
      if(depth<=2) {
        const size=h*(kind===1?.085:.12)*(.75+random()*.55);
        const along=.45+random()*.4;
        leaves.push([x+(endX-x)*along,y+(endY-y)*along,size,size*(kind===1?1.15:.92),Math.floor(random()*10000)]);
      }
      const spread=.26+random()*.48;
      branch(endX,endY,length*(.62+random()*.13),angle-spread,depth-1,thickness*.66);
      branch(endX,endY,length*(.62+random()*.14),angle+spread,depth-1,thickness*.66);
      if(depth===2&&random()>.4)branch(endX,endY,length*.6,angle+(random()-.5)*.3,depth-1,thickness*.5);
    }
    branch(cx,base,h*.32,-Math.PI/2+lean/h,4,h*.045);
    // Unequal secondary limbs give mature trees a crown below the highest twigs.
    branch(cx+lean*.25,base-h*.34,h*.23,-Math.PI*.72,3,h*.026);
    branch(cx+lean*.25,base-h*.40,h*.21,-Math.PI*.29,3,h*.025);
    for(const [x,y,rx,ry,seed] of leaves)leafCloud(x,y,rx*(kind===1?.65:1.05),ry,tone,seed);
    for(const [x,y,ex,ey,w] of branchSegments) {
      line(x,y,ex,ey,w,tone+.09);
      if(w>unit*1.7)line(x-unit*.65,y,ex-unit*.4,ey,Math.max(.6,w*.2),tone-.30);
    }
    for(let i=0;i<7;i++) {
      const yy=base-h*(.05+i*.035);
      line(cx-h*.012,yy,cx+h*.015,yy-unit,unit*.6,tone-.25);
    }
  }
  // Distant stands belong to the slopes, with clearings and irregular clusters.
  for(let layer=0;layer<2;layer++) {
    let x=-10;
    while(x<width+10) {
      const cluster=noise(x/(height*.28),layer+80);
      const h=height*(layer===0?.05:.095)*(.6+random()*.7);
      const base=(layer===0?foothill:meadow)[Math.floor(clamp(x,0,width-1))]+h*.20;
      if(cluster>.28)conifer(x,base,h,layer===0?.49:.69,random()>.6?1:0);
      x+=h*(.24+random()*.3);
    }
  }
  // Asymmetrical groves frame a view through the central valley.
  const groves=mobile
    ? [[-.03,.37,0],[.06,.32,2],[.17,.49,1],[.29,.30,0],[.38,.22,2],[.67,.34,0],[.80,.48,2],[.94,.35,1],[1.03,.46,0]]
    : [[-.02,.44,0],[.025,.33,2],[.065,.30,0],[.115,.54,1],[.17,.35,2],[.215,.32,0],[.255,.40,2],[.31,.29,0],[.355,.25,1],[.405,.27,0],[.60,.26,2],[.66,.32,0],[.705,.38,2],[.77,.51,1],[.82,.31,0],[.875,.37,2],[.93,.43,0],[1.015,.55,1]];
  for(const [fraction,scale,kind] of groves) {
    const x=width*fraction,base=height*(.97+(random()-.5)*.04),h=height*scale;
    if(kind===0)conifer(x,base,h,.91,random()>.45?1:0);
    else broadleaf(x,base,h,kind===1?.83:.88,kind===2?1:0);
  }
  // Low scrub, fern fronds and grasses anchor the lower edge.
  for(let x=-5;x<width+5;x+=unit*(7+random()*10)) {
    const base=height*(.98+random()*.02),h=unit*(7+random()*16);
    if(random()>.58)leafCloud(x,base-h*.3,h*.6,h*.5,.92,Math.floor(random()*1000));
    for(let k=0;k<3;k++) {
      const tipX=x+(k-1)*h*.3,tipY=base-h*(.6+random()*.4);
      line(x,base,tipX,tipY,unit*.7,.97);
      for(let n=1;n<5;n++) {
        const p=n/5,bx=x+(tipX-x)*p,by=base+(tipY-base)*p;
        line(bx,by,bx-h*.16*(1-p),by-h*.1,unit*.55,.96);
        line(bx,by,bx+h*.16*(1-p),by-h*.12,unit*.55,.96);
      }
    }
  }
  const pixels=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const tone=Math.max(field[y*width+x],smooth((y/height-.96)/.04));
    const threshold=(bayer[y%8][x%8]+.5)/64;
    const p=(y*width+x)*4;
    pixels[p]=pixels[p+1]=pixels[p+2]=255;
    pixels[p+3]=tone>threshold?255:0;
  }
  const info=await sharp(pixels,{raw:{width,height,channels:4}}).png({palette:true,compressionLevel:9}).toFile(`public/artwork/${name}.png`);
  console.log(JSON.stringify({name,...info}));
}
await mkdir("public/artwork",{recursive:true});
await landscape(1800,500,"pixel-woodland-r2-20261022");
await landscape(640,420,"pixel-woodland-r2-20261022-mobile",true);
