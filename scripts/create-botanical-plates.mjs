import sharp from "sharp";

// Small original print plates. Their alpha channel is colored by the site theme.
function plate(width,height,seed) {
  const ink=new Float32Array(width*height);
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const dot=(x,y,r,t=1)=>{for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++)
    if(xx>=0&&yy>=0&&xx<width&&yy<height&&(xx-x)**2+(yy-y)**2<=r*r+.3)ink[yy*width+xx]=t;};
  function line(x,y,ex,ey,w=1,t=1){const n=Math.max(1,Math.ceil(Math.hypot(ex-x,ey-y)*1.5));for(let i=0;i<=n;i++)dot(x+(ex-x)*i/n,y+(ey-y)*i/n,w/2,t);}
  function curve(points,w=1,t=1){let [x,y]=points[0];for(let i=1;i<=90;i++){const v=i/90,u=1-v;const nx=u*u*u*points[0][0]+3*u*u*v*points[1][0]+3*u*v*v*points[2][0]+v*v*v*points[3][0];const ny=u*u*u*points[0][1]+3*u*u*v*points[1][1]+3*u*v*v*points[2][1]+v*v*v*points[3][1];line(x,y,nx,ny,w,t);x=nx;y=ny;}}
  function leaf(x,y,angle,length,spread) {
    const dx=Math.cos(angle),dy=Math.sin(angle);
    for(let i=0;i<length;i++) {
      const p=i/length,r=Math.sin(Math.PI*p)**.85*spread*(1+.1*Math.sin(p*65));
      for(let j=-r;j<=r;j++)dot(x+dx*i-dy*j,y+dy*i+dx*j,.5,.57+random()*.3);
    }
    line(x,y,x+dx*length,y+dy*length,1,.95);
    for(let n=1;n<8;n++){const p=n/9,r=Math.sin(Math.PI*p)*spread;
      for(const side of [-1,1])line(x+dx*length*p,y+dy*length*p,x+dx*length*(p+.13)-dy*r*side,y+dy*length*(p+.13)+dx*r*side,.8,.28);}
  }
  async function save(name) {
    const data=Buffer.alloc(width*height*4);
    const bayer=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*width+x;data[p*4]=data[p*4+1]=data[p*4+2]=255;data[p*4+3]=ink[p]>(bayer[y%4][x%4]+.5)/16?255:0;}
    console.log(await sharp(data,{raw:{width,height,channels:4}}).png({palette:true}).toFile("public/artwork/"+name+".png"));
  }
  return {ink,random,dot,line,curve,leaf,save};
}

const roots=plate(1800,340,23019);
function root(x,y,len,angle,w,depth) {
  const endX=x+Math.cos(angle)*len,endY=y+Math.sin(angle)*len;
  roots.curve([[x,y],[x+len*Math.cos(angle-.22)*.35,y+len*Math.sin(angle-.22)*.35],[endX-len*Math.cos(angle+.2)*.3,endY-len*Math.sin(angle+.2)*.3],[endX,endY]],w,.86);
  if(depth<1)return;
  root(endX,endY,len*(.52+roots.random()*.22),angle+(roots.random()-.5)*.8,w*.57,depth-1);
  const side=roots.random()>.5?1:-1;
  root(x+(endX-x)*.65,y+(endY-y)*.65,len*.57,angle+side*(.5+roots.random()*.55),w*.4,depth-1);
}
for(let x=-40;x<1880;x+=160+roots.random()*170) {
  for(let k=0;k<5;k++)root(x,0,75+roots.random()*70,.25+k*.64,5+roots.random()*4,5);
}
for(let n=0;n<7000;n++)roots.dot(roots.random()*1800,roots.random()*340,roots.random()>.98?1.4:.55,.17+roots.random()*.16);
await roots.save("woodland-roots-r3");

const specimen=plate(420,330,771);
specimen.curve([[115,310],[170,220],[218,137],[300,24]],3);
for(let n=0;n<7;n++){
  const x=150+n*19,y=263-n*32;
  specimen.leaf(x,y,-2.55+n*.035,80-n*5,16-n*.8);
  specimen.leaf(x+6,y-6,-.66+n*.015,72-n*5,13-n*.5);
}
await specimen.save("about-specimen-r3");

const records=plate(420,330,881);
for(let k=2;k>=0;k--) {
  const x=63+k*16,y=38+k*16,w=260,h=205;
  records.line(x,y,x+w,y,1.5);records.line(x+w,y,x+w,y+h,1.5);records.line(x+w,y+h,x,y+h,1.5);records.line(x,y+h,x,y,1.5);
}
for(let n=0;n<8;n++)records.curve([[70,84+n*18],[142,30+n*22],[191,150+n*10],[316,80+n*20]],1,.35+n*.04);
records.curve([[98,232],[245,204],[138,130],[282,59]],2,.9);
for(let n=0;n<3;n++){const x=136+n*55,y=190-n*48;records.dot(x,y,7,.95);records.dot(x,y,3,0);records.line(x,y+9,x-8,y+24,1.4);}
records.line(86,272,185,272,2);records.line(86,284,147,284,1,.55);
await records.save("about-records-r3");

const growth=plate(420,330,919);
for(let n=0;n<3;n++){
  const x=80+n*125,base=286,h=65+n*58;
  growth.curve([[x,base],[x-12,base-h*.4],[x+18,base-h*.7],[x+8,base-h]],2.5);
  growth.leaf(x,base-h*.6,-2.45,38+n*16,9+n*2);
  growth.leaf(x+4,base-h*.8,-.6,42+n*17,10+n*2);
  for(let j=0;j<3;j++)growth.curve([[x,base],[x-10+j*10,base+7],[x-28+j*24,base+17],[x-38+j*32,base+28]],1,.7);
}
for(let n=0;n<800;n++)growth.dot(25+growth.random()*370,286+growth.random()*33,.6,.35);
await growth.save("about-growth-r3");
