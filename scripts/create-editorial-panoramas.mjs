import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Original raster engravings. No repeated tiles: every branch and soil pixel is seeded.
const out = 'public/artwork';
await mkdir(out, { recursive: true });
const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
const hash = (x,y,s=0) => { let n=Math.imul(x+s,374761393)^Math.imul(y,668265263); n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967296; };
const smooth = t => t*t*(3-2*t);
function noise(x,y,s) { const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j); return (hash(i,j,s)*(1-u)+hash(i+1,j,s)*u)*(1-v)+(hash(i,j+1,s)*(1-u)+hash(i+1,j+1,s)*u)*v; }
const matrix = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
function canvas(w,h,seed) {
  const field=new Float32Array(w*h);
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296;};
  function pixel(x,y,v) { x=Math.round(x);y=Math.round(y);if(x>=0&&x<w&&y>=0&&y<h)field[y*w+x]=clamp(v); }
  function dot(x,y,r,v=1) { for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)if((xx-x)**2+(yy-y)**2<=r*r+.2)pixel(xx,yy,v); }
  function line(x,y,ex,ey,width=1,tone=1) {const n=Math.ceil(Math.hypot(ex-x,ey-y)*1.5);for(let k=0;k<=n;k++)dot(x+(ex-x)*k/n,y+(ey-y)*k/n,width*.5,tone);}
  function curve(p,width=1,tone=1) {let [x,y]=p[0];for(let k=1;k<=100;k++){let t=k/100,u=1-t;let nx=u**3*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t**3*p[3][0];let ny=u**3*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t**3*p[3][1];line(x,y,nx,ny,width,tone);x=nx;y=ny;}}
  function leaf(x,y,angle,length,spread,lobes=0,tone=.8) {
    const dx=Math.cos(angle),dy=Math.sin(angle);
    for(let i=0;i<length;i++){const t=i/length;let r=Math.sin(Math.PI*t)**.8*spread*(lobes ? .72+.28*Math.cos(t*Math.PI*lobes*2):1);for(let j=-r;j<=r;j++)pixel(x+dx*i-dy*j,y+dy*i+dx*j,tone-.22*Math.abs(j)/(r||1)+rand()*.15);}
    line(x,y,x+dx*length,y+dy*length,1,.17);
    for(let i=1;i<9;i++){const t=i/10,r=Math.sin(Math.PI*t)*spread*.8;for(const sign of [-1,1])line(x+dx*length*t,y+dy*length*t,x+dx*length*(t+.12)-dy*r*sign,y+dy*length*(t+.12)+dx*r*sign,.7,.22);}
  }
  function fern(x,y,height,lean,tone=.8) {
    const tip=[x+lean,y-height];curve([[x,y],[x+lean*.1,y-height*.45],[tip[0]-lean*.2,tip[1]+height*.2],tip],1.4,tone);
    for(let n=1;n<=18;n++){const t=n/20,px=x+lean*t*t,py=y-height*t,len=height*.25*Math.sin(Math.PI*t)**.7;
      for(const sign of [-1,1]){const ex=px+sign*len,ey=py-len*.45;curve([[px,py],[px+sign*len*.4,py-2],[ex,ey+5],[ex,ey]],1,tone);
        for(let j=1;j<10;j++){const u=j/11,xx=px+(ex-px)*u,yy=py+(ey-py)*u;const l=len*.16*(1-u)+2;leaf(xx,yy,-Math.PI*.5+(sign>0?.8:-.8),l,1.6,0,tone);leaf(xx,yy,sign>0?.35:Math.PI-.35,l*.7,1.3,0,tone);}
      }
    }
  }
  function bloom(x,y,r,petals=12,tone=.8) {for(let n=0;n<petals;n++)leaf(x,y,n*Math.PI*2/petals,r,Math.max(1.5,r*.13),0,tone);dot(x,y,r*.26,.95);for(let j=0;j<22;j++){let a=rand()*6.28,d=rand()*r*.24;dot(x+Math.cos(a)*d,y+Math.sin(a)*d,.6,.25);}}
  async function save(name,fade=true){const data=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=field[y*w+x];if(fade)v*=clamp(x/24)*clamp((w-1-x)/24)*clamp((h-1-y)/14);const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=v>(matrix[y%4][x%4]+.5)/16?255:0;}await sharp(data,{raw:{width:w,height:h,channels:4}}).png({palette:true}).toFile(`${out}/${name}.png`);}
  return {w,h,field,rand,pixel,dot,line,curve,leaf,fern,bloom,save};
}

// A field atlas: topographic folds, river, surveyed paths and location pins.
const atlas=canvas(1440,440,19231);
for(let y=38;y<420;y++)for(let x=12;x<1428;x++){
  const edge=Math.sin(Math.PI*x/1440)**.45;
  const center=215+42*Math.sin(x/210)+24*Math.sin(x/79);
  const z=(y-center)/90+noise(x/145,y/85,13)*1.2+noise(x/49,y/44,71)*.25;
  const iso=Math.abs((z*8)%1);
  const band=clamp((1-Math.abs(y-center)/190)*edge);
  if(iso<.11)atlas.pixel(x,y,.9*band);else if(iso<.22)atlas.pixel(x,y,.25*band);
  else if(noise(x/145,y/85,13)>.58)atlas.pixel(x,y,.16*band);
}
// The pale river opens into a broad winding estuary.
atlas.curve([[130,376],[720,330],[534,130],[1210,85]],22,0);
atlas.curve([[130,364],[720,318],[534,118],[1210,73]],1.5,.55);
atlas.curve([[130,388],[720,342],[534,142],[1210,97]],1.5,.55);
for(let i=0;i<6;i++)atlas.curve([[170+i*42,370],[390+i*43,335],[810-i*20,140],[1160+i*8,90]],.7,.14);
// A fine survey traverse, intentionally different from the river.
atlas.curve([[140,135],[460,74],[840,370],[1320,215]],1.4,.65);
for(const [x,y] of [[244,125],[643,209],[1020,260],[1246,234]]){atlas.dot(x,y,9,.9);atlas.dot(x,y,5,0);atlas.line(x,y+10,x-6,y+22,1.5,.9);}
for(let n=0;n<340;n++){let x=40+atlas.rand()*1360,y=65+atlas.rand()*330;const v=noise(x/110,y/85,24);if(v>.61){atlas.line(x,y,x,y-5,1,.5);atlas.line(x-3,y-1,x,y-6,.7,.45);atlas.line(x+3,y-1,x,y-6,.7,.45);}}
// Field-notebook botanical detail at the foreground edge.
atlas.fern(1240,405,155,-40,.86);
atlas.fern(1320,415,120,36,.65);
await atlas.save('about-atlas-r4');

// A botanical reference spread: oak, fern, grasses, flowers and seeds.
const herb=canvas(1440,440,4417);
herb.curve([[110,410],[190,272],[246,135],[340,42]],3,.85);
for(let i=0;i<7;i++){let x=150+i*25,y=365-i*39;herb.leaf(x,y,-2.65+i*.06,95-i*5,23-i,4,.88);herb.leaf(x+10,y-12,-.67,105-i*6,21-i,4,.72);}
herb.fern(600,410,310,-75,.83);herb.fern(590,410,235,86,.66);herb.fern(590,410,205,-145,.55);
for(let i=0;i<7;i++){const x=850+i*18,top=65+herb.rand()*100;herb.curve([[945,410],[x+25,300],[x-20,top+80],[x,top]],1.4,.7);for(let n=0;n<14;n++){const yy=top+n*4.3,xx=x+(n%2?4:-4);herb.leaf(xx,yy,n%2?-.65:-2.5,10,2,0,.78);}}
for(const [x,y,r] of [[1160,132,43],[1270,210,33],[1100,255,27]]){herb.curve([[1190,410],[1160,340],[x-22,y+80],[x,y]],2,.85);herb.bloom(x,y,r,14,.8);herb.leaf(x-7,y+85,-2.45,60,12,0,.72);herb.leaf(x+3,y+100,-.7,57,11,0,.8);}
// Seed pods with their own small-scale engraving.
for(let n=0;n<4;n++){const x=729+n*20,y=360+n%2*20;herb.leaf(x,y,-1.2,28,8,0,.88);herb.line(x,y,x-8,y+23,1,.7);}
await herb.save('about-herbarium-r4');

// A shared habitat: an open meadow, winding trail, flowers and pollinators.
const meadow=canvas(1440,440,90713);
for(let x=0;x<1440;x++){const ridge=250+Math.sin(x/153)*26+noise(x/80,0,16)*30;for(let y=Math.floor(ridge);y<440;y++){const path=720+Math.sin((y-240)/65)*140;const distance=Math.abs(x-path);let tone=.12+(y-ridge)/400;if(distance<8+(y-230)*.22)tone*=.14;meadow.pixel(x,y,tone);}}
for(let i=0;i<230;i++){const x=meadow.rand()*1440,y=290+meadow.rand()*145,h=7+meadow.rand()*23;meadow.curve([[x,y],[x-3,y-h*.4],[x+6,y-h*.8],[x+3,y-h]],.8,.45);}
// Closer grasses have blade structure and varied seed heads, not a stamped border.
for(let i=0;i<58;i++){const x=meadow.rand()*1440,y=375+meadow.rand()*60;if(x>650&&x<860)continue;const h=18+meadow.rand()*57;for(let k=0;k<3;k++){let lean=(meadow.rand()-.5)*34;meadow.curve([[x,y],[x+lean*.2,y-h*.4],[x+lean*.8,y-h*.85],[x+lean,y-h]],.9,.7);if(k===0)for(let n=0;n<7;n++)meadow.leaf(x+lean+n%2*2,y-h+n*2.2,n%2?-.7:-2.4,4,1,0,.8);}}
for(let i=0;i<26;i++){const x=35+meadow.rand()*1320,y=305+meadow.rand()*117;if(x>650&&x<865)continue;const h=12+meadow.rand()*22;meadow.line(x,y,x-2,y-h,1,.7);meadow.bloom(x-2,y-h,4+meadow.rand()*5,5,.85);}
for(const [x,y,h,lean] of [[125,430,260,-35],[218,430,195,35],[1160,425,235,45],[1290,430,320,-45]]){meadow.curve([[x,y],[x-20,y-h*.45],[x+lean,y-h*.8],[x+lean,y-h]],2,.83);for(let n=1;n<5;n++){let yy=y-h*n/5;meadow.leaf(x+lean*n/5,yy,n%2?-.5:-2.6,42+n*7,8+n,0,.7);}meadow.bloom(x+lean,y-h,22+h/15,13,.83);}
// Detailed yarrow-like branching inflorescences, rather than identical round crowns.
for(let k=0;k<4;k++){let x=340+k*25,y=365+k%2*35,h=78+k*14;meadow.line(x,y,x-12,y-h,1.4,.8);for(let i=0;i<5;i++){let ex=x-48+i*20,ey=y-h-14+Math.abs(i-2)*5;meadow.line(x-7,y-h*.7,ex,ey,1,.7);for(let j=0;j<8;j++)meadow.bloom(ex+(meadow.rand()-.5)*17,ey+(meadow.rand()-.5)*8,3.5,5,.8);}}
function butterfly(p,x,y,s,a) {for(const side of [-1,1]){p.leaf(x,y,a+side*.6-1.57,32*s,13*s,0,.88);p.leaf(x,y,a+side*1.2+1.57,22*s,9*s,1,.76);}p.line(x-2*s,y+15*s,x+2*s,y-17*s,2*s,.95);p.curve([[x,y-15*s],[x-3*s,y-28*s],[x-12*s,y-25*s],[x-11*s,y-29*s]],.8,.85);p.curve([[x,y-15*s],[x+6*s,y-28*s],[x+12*s,y-20*s],[x+13*s,y-25*s]],.8,.85);}
butterfly(meadow,920,135,1.2,.2);butterfly(meadow,520,183,.6,-.35);
await meadow.save('about-meadow-r4');

// Root systems have distinct architectures: taproots, lateral roots, fibrous fans.
const roots=canvas(1200,240,730019);
function tendril(x,y,len,angle,width,depth,drift=0) {
  const bend=(roots.rand()-.5)*.65+drift;
  const ex=x+Math.cos(angle+bend)*len,ey=y+Math.sin(angle+bend)*len;
  roots.curve([[x,y],[x+Math.cos(angle)*len*.38,y+Math.sin(angle)*len*.38],[ex-Math.cos(angle+bend+.3)*len*.25,ey-Math.sin(angle+bend+.3)*len*.25],[ex,ey]],width,.8);
  if(depth<=0||ey>240)return;
  tendril(ex,ey,len*(.48+roots.rand()*.28),angle+bend+(roots.rand()-.5)*.55,width*.64,depth-1,drift);
  if(roots.rand()>.2){const t=.35+roots.rand()*.4;const side=roots.rand()>.5?1:-1;tendril(x+(ex-x)*t,y+(ey-y)*t,len*(.28+roots.rand()*.35),angle+side*(.65+roots.rand()*.5),width*.38,depth-1);}
}
for(const [x,kind,scale] of [[12,0,.7],[108,1,1.3],[337,2,1],[498,0,1.5],[786,1,.95],[960,2,.8],[1138,0,1.1]]){
  if(kind===0){tendril(x,0,85*scale,1.57,6*scale,6);for(const side of [-1,1])tendril(x,7,90*scale,side>0?.3:2.8,4,5,side*.1);}
  if(kind===1)for(let k=0;k<7;k++)tendril(x+(roots.rand()-.5)*18,0,(45+roots.rand()*68)*scale,.35+roots.rand()*2.4,1.3+roots.rand()*2,4);
  if(kind===2){tendril(x,0,145*scale,.22,5,6,.12);tendril(x,0,120*scale,2.8,4,5,-.15);tendril(x,0,100*scale,1.35,3.5,5);}
}
await roots.save('woodland-roots-r4',false);

// Pixel strata use a small fixed palette; every block is authored offline, no blur.
for(const dark of [false,true]){
  const palette=dark?[[150,213,181],[65,96,76],[64,51,39],[32,29,24],[111,93,68]]:[[0,88,59],[49,78,50],[89,65,43],[51,41,31],[132,103,68]];
  const w=1200,h=240,data=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const wave=noise(x/77,0,7)*18+noise(x/19,0,9)*6;
    const depth=y-wave;
    const patch=noise(x/15,y/8,51), grain=hash(x,y,8);
    let band=depth<8?0:depth<35?1:depth<150?2:3;
    if(depth>0&&depth<42&&grain>(depth/42))band=0;
    if(depth>45&&patch>.67)band=4;
    if(depth>40&&grain>.84)band=3;
    if(depth>75&&noise(x/5,y/3,12)>.77)band=4;
    const color=palette[band],i=(y*w+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
  }
  await sharp(data,{raw:{width:w,height:h,channels:4}}).png({palette:true}).toFile(`${out}/woodland-soil-r4${dark?'-dark':''}.png`);
}
console.log('Six original raster plates exported.');
