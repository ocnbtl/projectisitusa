const fs=require('node:fs'),path=require('node:path');
const sharp=require('C:/Code/project-isitusa/node_modules/sharp');
(async()=>{
 const assets=[['symbol','public/brand/v3/isitusa-symbol.svg',840],['symbol-name','public/brand/v10/symbol-name.svg',840],['full-name','public/brand/v10/full-name.svg',1800]];
 const report=[];
 for(const [id,file,width] of assets){
  const source=fs.readFileSync(file,'utf8');
  for(const [color,hex] of [['black','#111111'],['white','#FFFFFF'],...(id==='symbol'?[['green','#00583B']]:[])]){
   const svg=source.replaceAll('#00583B',hex),stem=`public/brand/v10/${id}-${color}`;
   if(color!=='green')fs.writeFileSync(stem+'.svg',svg);
   await sharp(Buffer.from(svg)).resize({width}).png({compressionLevel:9}).toFile(stem+'.png');
   report.push({asset:id,color,svgBytes:color==='green'?0:Buffer.byteLength(svg),pngBytes:fs.statSync(stem+'.png').size,geometryUnchanged:svg.replaceAll(hex,'#00583B')===source});
  }
 }
 const totalBytes=report.reduce((n,r)=>n+r.svgBytes+r.pngBytes,0);
 if(totalBytes>2e6)throw Error('Scoped export limit exceeded');
 fs.writeFileSync(path.join(__dirname,'asset-verification.json'),JSON.stringify({brandGreen:'#00583B',totalBytes,variants:report},null,2)+'\n');
 console.log(JSON.stringify({totalBytes,variants:report}));
})();
