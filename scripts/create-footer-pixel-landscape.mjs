import sharp from "sharp";
import { mkdir } from "node:fs/promises";

// Original, reproducible pixel artwork. No photographs or generative image inputs.
// The alpha-only plate is tinted by CSS, so every opaque pixel uses a brand token.
const bayer = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3-2*x); };
function rng(seed) { return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }; }
async function plate(width, height, name) {
  const random = rng(15112026);
  const field = new Float32Array(width*height);
  const ridge = (x, layer) => height*(.34 + layer*.14 + .07*Math.sin(x/width*12+layer*2.3) + .04*Math.cos(x/width*27-layer));
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    let value = 0;
    for (let l=0;l<3;l++) if (y>ridge(x,l)) value = [.18,.36,.57][l];
    field[y*width+x] = value;
  }
  // Stepped branch tiers and asymmetrical crowns stay abstract at every scale.
  function crown(cx, base, h, breadth, density, broadleaf) {
    for (let y=Math.max(0,Math.floor(base-h));y<Math.min(height,base+2);y++) {
      const t=(y-(base-h))/h;
      const half = broadleaf
        ? breadth*Math.sqrt(Math.max(0,1-((t-.48)/.55)**2))*(.82+.12*Math.sin(t*24))
        : breadth*(.13+.87*t)*(1-((t*5)%1)*.35);
      for (let x=Math.max(0,Math.floor(cx-half));x<Math.min(width,cx+half);x++) {
        const p=y*width+x;
        field[p]=Math.max(field[p], density);
      }
    }
  }
  for (let l=0;l<3;l++) {
    const step = height*[.075,.10,.145][l];
    for(let x=-step;x<width+step;x+=step*(.7+random()*.55)) {
      const base=Math.min(height-8,ridge(x,l)+height*(.15+l*.04));
      const h=height*(.09+l*.045)*( .65+random()*.65);
      crown(x,base,h,h*(.23+random()*.1),[.34,.62,.88][l],random()>.7);
    }
  }
  const pixels=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    // A deliberate ordered square-dot screen; solid ink anchors the bottom edge.
    const tone=Math.max(field[y*width+x],smooth((y/height-.73)/.27));
    const ink=tone>(bayer[y%4][x%4]+.5)/16;
    const p=(y*width+x)*4;
    pixels[p]=pixels[p+1]=pixels[p+2]=255;
    pixels[p+3]=ink?255:0;
  }
  const result=await sharp(pixels,{raw:{width,height,channels:4}}).png({palette:true,compressionLevel:9}).toFile(`public/artwork/${name}.png`);
  console.log(JSON.stringify({name,...result}));
}
await mkdir("public/artwork",{recursive:true});
await plate(1280,320,"pixel-woodland-20261022");
await plate(480,240,"pixel-woodland-20261022-mobile");
