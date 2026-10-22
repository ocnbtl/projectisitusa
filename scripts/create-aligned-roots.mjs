import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
// Read the actual foreground tree coordinates, not a separately guessed layout.
const landscape = await readFile('scripts/create-footer-pixel-landscape.mjs','utf8');
const layout = landscape.match(/const groves=mobile\s*\?\s*(\[\[.*?\]\])\s*:\s*(\[\[.*?\]\]);/s);
if(!layout) throw new Error('Tree layout changed: review root anchors before exporting');
const parse = value => JSON.parse(value.replace(/(^|[\[,\s-])\./g,'$10.'));
const layouts = {mobile:parse(layout[1]),desktop:parse(layout[2])};
for(const [suffix,w,trees] of [['',1800,layouts.desktop],['-wide',3200,layouts.desktop],['-mobile',640,layouts.mobile]]) {
 const h=240, field=new Float32Array(w*h); let seed=89123;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const dot=(x,y,r,v)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(h,y+r+1);yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<Math.min(w,x+r+1);xx++)if((xx-x)**2+(yy-y)**2<r*r+.3)field[yy*w+xx]=Math.max(field[yy*w+xx],v);};
 const line=(x,y,ex,ey,r)=>{let n=Math.max(1,Math.ceil(Math.hypot(ex-x,ey-y)*1.4));for(let j=0;j<=n;j++)dot(x+(ex-x)*j/n,y+(ey-y)*j/n,r,.85);};
 function root(x,y,len,angle,thickness,depth) {
  const bend=(rand()-.5)*.9;let px=x,py=y;
  for(let j=1;j<=20;j++){let t=j/20,a=angle+bend*t;const nx=x+Math.cos(a)*len*t,ny=y+Math.sin(a)*len*t;line(px,py,nx,ny,thickness*(1-t*.38));px=nx;py=ny;}
  if(depth===0||py>=h-2)return;
  root(px,py,len*(.53+rand()*.2),Math.max(.12,Math.min(3.02,angle+bend)),thickness*.61,depth-1);
  if(rand()>.17)root(x+(px-x)*.5,y+(py-y)*.5,len*(.32+rand()*.4),Math.max(.08,Math.min(3.06,angle+(rand()>.5?1:-1)*(.45+rand()*.8))),thickness*.43,depth-1);
 }
 for(const [fraction,scale,kind]of trees){
  const x=fraction*w,weight=1.8+scale*3;
  // Every collar is centered on its corresponding trunk, at the shared ground line.
  line(x,0,x,7,weight);
  root(x,5,45+scale*130,1.35+rand()*.44,weight,6);
  for(const side of [-1,1])root(x,3,45+rand()*70,side<0?2.7:.42,weight*.7,5);
  if(kind===0)for(let k=0;k<3;k++)root(x,4,30+rand()*60,.4+rand()*2.3,1,4);
 }
 const data=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=rand()<field[y*w+x]?255:0;}
 await sharp(data,{raw:{width:w,height:h,channels:4}}).png({palette:true}).toFile(`public/artwork/woodland-roots-r5${suffix}.png`);
 console.log(JSON.stringify({suffix,width:w,anchors:trees.map(t=>t[0]),rootCount:trees.length}));
}
