"""Build the OFL-derived ISITUSA Field Display and matching outline artwork.

Input: official Google Fonts Fraunces variable TTF (see font README).
Requires fonttools and brotli. No runtime font service or proprietary font input.
"""
from pathlib import Path
import sys, json, html
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.svgLib.path import parse_path
from fontTools import subset

ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1])
out=ROOT/'public/brand/v7'
fonts=ROOT/'public/fonts/isitusa-display'
out.mkdir(parents=True,exist_ok=True)
fonts.mkdir(parents=True,exist_ok=True)
font=instantiateVariableFont(TTFont(source),{'opsz':72,'wght':800,'SOFT':25,'WONK':0},inplace=False)
cmap=font.getBestCmap()
# Original flared capitals use the same cap height as the licensed base.
# I's concave shoulders echo leaf tips; T keeps a broad, crisp canopy.
custom={
 'I':(350,'M18 0 C64 20 86 49 86 106 L86 594 C86 651 64 680 18 700 L332 700 C286 680 264 651 264 594 L264 106 C264 49 286 20 332 0 Z'),
 'T':(690,'M15 700 L675 700 L689 501 C638 585 605 609 548 609 L434 609 L434 111 C434 51 461 20 506 0 L184 0 C229 20 256 51 256 111 L256 609 L142 609 C85 609 52 585 1 501 Z')
}
for char,(width,path) in custom.items():
 name=cmap[ord(char)]
 pen=TTGlyphPen(font.getGlyphSet())
 parse_path(path,TransformPen(Cu2QuPen(pen,max_err=0.8,reverse_direction=False),(2,0,0,2,0,0)))
 font['glyf'][name]=pen.glyph()
 font['hmtx'][name]=(width*2,round(font['glyf'][name].xMin) if hasattr(font['glyf'][name],'xMin') else 0)
 font['glyf'][name].recalcBounds(font['glyf'])
 font['hmtx'][name]=(width*2,font['glyf'][name].xMin)
# Retain the upstream authors/license; name the derivative distinctly.
for rec in font['name'].names:
 if rec.nameID in (1,2,3,4,6,16,17):
  value={1:'ISITUSA Field Display',2:'Regular',3:'ISITUSA Field Display 1.0',4:'ISITUSA Field Display',6:'ISITUSAFieldDisplay-Regular',16:'ISITUSA Field Display',17:'Regular'}[rec.nameID]
  rec.string=value.encode(rec.getEncoding(),errors='replace')
font['OS/2'].usWeightClass=800
font['OS/2'].fsSelection=(font['OS/2'].fsSelection & ~33)|64
font['head'].macStyle=0
font['post'].italicAngle=0
options=subset.Options()
options.name_IDs=['*']; options.name_legacy=True; options.name_languages=['*']
ss=subset.Subsetter(options=options)
ss.populate(unicodes=list(range(32,383))+list(range(0x2000,0x2070))+[0x20ac,0x2122,0x2212])
ss.subset(font)
font.save(fonts/'ISITUSAFieldDisplay-Regular.ttf')
font.flavor='woff2'; font.save(fonts/'isitusa-field-display.woff2'); font.flavor=None
gs=font.getGlyphSet(); cmap=font.getBestCmap()

def outline(text,tracking=0,logo=False):
 x=0; paths=[]
 pairs={'IS':-20,'SI':-12,'IT':-18,'TU':-35,'US':-10,'SA':-25}
 for index,c in enumerate(text):
  if index and logo:x+=pairs.get(text[index-1]+c,0)
  name=cmap[ord(c)]; pen=SVGPathPen(gs);gs[name].draw(pen)
  paths.append(f'<path transform="translate({x} 0)" d="{pen.getCommands()}"/>')
  x+=font['hmtx'][name][0]+tracking
 return ''.join(paths),x-tracking

letters,width=outline('ISITUSA',24,True)
for color,value in {'green':'#00583B','white':'#FFFFFF','black':'#111111'}.items():
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width+40} 1520" fill="{value}" role="img" aria-label="ISITUSA"><title>ISITUSA</title><g transform="translate(20 1450) scale(1 -1)">{letters}</g></svg>\n'
 (out/f'wordmark-{color}.svg').write_text(svg,encoding='utf8')

lines=['Invasive Species In The','United States of America']
parts=[outline(line,0) for line in lines]
fullwidth=max(w for _,w in parts)+60
full=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fullwidth} 3820" fill="#00583B" role="img" aria-label="Invasive Species In The United States of America"><title>Invasive Species In The United States of America</title>'
for i,(paths,_) in enumerate(parts):full+=f'<g transform="translate(30 {1450+i*1850}) scale(1 -1)">{paths}</g>'
full+='</svg>\n'
(out/'full-name.svg').write_text(full,encoding='utf8')
previous=(ROOT/'public/brand/v5/symbol-name.svg').read_text(encoding='utf8')
marker='<g transform="translate(10 890)';cut=previous.index(marker)
scale=820/(width+40)
symbol=previous[:cut]+f'<g transform="translate(10 {900+1450*scale}) scale({scale} {-scale})">{letters}</g></svg>\n'
(out/'symbol-name.svg').write_text(symbol,encoding='utf8')
(out/'site.webmanifest').write_bytes((ROOT/'public/brand/v6/site.webmanifest').read_bytes())
(out/'manifest.json').write_text(json.dumps({'version':7,'name':'ISITUSA Field Display','base':'Fraunces, OFL 1.1','axes':{'opsz':72,'wght':800,'SOFT':25,'WONK':0},'customGlyphs':['I','T'],'wordmarkWidth':width+40,'wordmarkHeight':1520,'fullNameWidth':fullwidth,'fullNameHeight':3820,'emblem':'approved v3 contours preserved'},indent=2)+'\n')
print(json.dumps({'wordmarkWidth':width+40,'wordmarkHeight':1520,'fullNameWidth':fullwidth,'fullNameHeight':3820,'woff2Bytes':(fonts/'isitusa-field-display.woff2').stat().st_size}))
