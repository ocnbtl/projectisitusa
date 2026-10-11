"""ISITUSA Botanical: approved sculptural capitals with a readable OFL companion.

Usage: python scripts/build-brand-v8.py path/to/Chonburi-Regular.ttf
All logo placements and the webfont are exported from this one glyph master.
"""
from pathlib import Path
import sys, json, hashlib, re
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools import subset

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/brand/v9'; FONTS=ROOT/'public/fonts/isitusa-botanical'
OUT.mkdir(parents=True,exist_ok=True); FONTS.mkdir(parents=True,exist_ok=True)
font=TTFont(sys.argv[1])
cmap=font.getBestCmap(); glyphs={}
# The licensed Chonburi companion provides readable two-storey lowercase.
# Strengthen its finest strokes for small headings before installing the
# sculptural capitals shared by every logo and all heading text.
import pathops
source_set=font.getGlyphSet()
companions={}
for code,name in cmap.items():
 if 32 < code < 383:
  shape=pathops.Path();source_set[name].draw(shape.getPen(source_set))
  if not list(shape): continue
  stroke=pathops.Path(shape)
  stroke.stroke(16,pathops.LineCap.BUTT_CAP,pathops.LineJoin.MITER_JOIN,3)
  shape=pathops.op(shape,stroke,pathops.PathOp.UNION)
  pen=TTGlyphPen(None);shape.draw(Cu2QuPen(pen,max_err=.35,reverse_direction=False))
  companions[name]=pen.glyph()
for name,glyph in companions.items():
 font['glyf'][name]=glyph;glyph.recalcBounds(font['glyf'])
 width,_=font['hmtx'][name];font['hmtx'][name]=(width+14,glyph.xMin)
def put(c,w,d): glyphs[c]=(w,d)
# All three shoulders share the same 70-unit concave entrance and 120-unit
# vertical drop. T mirrors that curve on both outer ends of its canopy.
put('I',360,'M20 700H340C284 671 270 639 270 580V120C270 61 284 29 340 0H20C76 29 90 61 90 120V580C90 639 76 671 20 700Z')
put('T',720,'M20 700H700C644 671 630 639 630 580Q630 528 644 470C576 551 523 603 450 603V120C450 61 464 29 520 0H200C256 29 270 61 270 120V603C197 603 144 551 76 470Q90 528 90 580C90 639 76 671 20 700Z')
put('U',760,'M20 700H340C284 671 270 639 270 580V245C270 126 305 66 386 66C480 66 520 128 520 251V580C520 639 506 671 450 700H740C684 671 670 639 670 580V252C670 77 571 -14 387 -14C188 -14 90 70 90 252V580C90 639 76 671 20 700Z')
# S follows a continuous leaf-like diagonal, with broad bowls and sharp tips.
put('S',605,'M568 720L517 428C451 523 387 611 308 638C246 659 214 627 214 579C214 527 275 486 365 432C507 349 577 288 577 172C577 52 480 -14 321 -14C233 -14 139 27 84 27Q53 27 20 -13L58 336C115 214 205 78 304 64C366 55 407 83 407 130C407 187 345 232 256 283C111 366 47 433 47 543C47 653 139 712 294 712C389 712 450 683 503 683Q544 683 568 720Z')
# A has a pointed apex and a curved open lower counter; no alternate A is
# substituted in headings. This is the same outline used in the acronym.
put('A',790,'M18 0Q67 33 94 98L382 720L687 95Q716 30 772 0H431C501 18 517 61 487 113C449 180 332 191 219 111C260 184 314 219 389 239L309 434L172 112Q143 42 201 0Z')
for char,(width,path) in glyphs.items():
 name=cmap[ord(char)];pen=TTGlyphPen(font.getGlyphSet())
 parse_path(path,Cu2QuPen(pen,max_err=.35,reverse_direction=False))
 font['glyf'][name]=pen.glyph();font['glyf'][name].recalcBounds(font['glyf'])
 font['hmtx'][name]=(width,font['glyf'][name].xMin)
from fontTools.ttLib.removeOverlaps import removeOverlaps
removeOverlaps(font, glyphNames=[cmap[ord(c)] for c in glyphs])
# The native base has GPOS offsets designed for different outlines.
# Explicit logo spacing and the new sidebearings take precedence.
for table in ['GPOS','kern','GSUB']:
 if table in font: del font[table]
for rec in font['name'].names:
 if rec.nameID in (1,2,3,4,6,16,17):
  value={1:'ISITUSA Botanical',2:'Regular',3:'ISITUSA Botanical 2.0',4:'ISITUSA Botanical',6:'ISITUSABotanical-Regular',16:'ISITUSA Botanical',17:'Regular'}[rec.nameID]
  rec.string=value.encode(rec.getEncoding(),errors='replace')
font['OS/2'].usWeightClass=800;font['OS/2'].sCapHeight=700;font['OS/2'].sxHeight=544
font['OS/2'].fsSelection=(font['OS/2'].fsSelection & ~33)|64;font['head'].macStyle=0
ss=subset.Subsetter(options=subset.Options());ss.populate(unicodes=list(range(32,383))+list(range(0x2000,0x2070))+[0x20ac,0x2122]);ss.subset(font)
font.save(FONTS/'ISITUSABotanical-Regular.ttf');font.flavor='woff2';font.save(FONTS/'isitusa-botanical.woff2');font.flavor=None
gs=font.getGlyphSet();cmap=font.getBestCmap()
def outline(text,tracking=0,logo=False):
 x=0;paths=[]
 pairs={'IS':-5,'SI':-3,'IT':-10,'TU':-10,'US':-5,'SA':-8}
 for i,c in enumerate(text):
  if i and logo:x+=pairs.get(text[i-1]+c,0)
  name=cmap[ord(c)];pen=SVGPathPen(gs);gs[name].draw(pen)
  paths.append(f'<path transform="translate({x} 0)" d="{pen.getCommands()}"/>');x+=font['hmtx'][name][0]+tracking
 return ''.join(paths),x-tracking
letters,width=outline('ISITUSA',12,True)
for name,color in {'green':'#00583B','white':'#FFFFFF','black':'#111111'}.items():
 (OUT/f'wordmark-{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width+40} 760" fill="{color}"><title>ISITUSA</title><g id="wordmark" transform="translate(20 720) scale(1 -1)">{letters}</g></svg>')
parts=[outline(x,5) for x in ['Invasive Species In The','United States of America']]
fullwidth=max(w for _,w in parts)+40
(OUT/'full-name.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fullwidth} 2020" fill="#00583B"><title>Invasive Species In The United States of America</title>'+''.join(f'<g transform="translate(20 {720+1000*i}) scale(1 -1)">{p}</g>' for i,(p,w) in enumerate(parts))+'</svg>')
emblem=(ROOT/'public/brand/v3/isitusa-symbol.svg').read_text()
body=re.search(r'<path.*</svg>',emblem,re.S).group(0).removesuffix('</svg>')
scale=800/(width+40)
(OUT/'symbol-name.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 1080" fill="#00583B"><title>ISITUSA</title><g fill-rule="evenodd" transform="translate(-110 -90)">{body}</g><g id="wordmark" transform="translate(20 {884+720*scale}) scale({scale} {-scale})">{letters}</g></svg>')
# Dedicated email-avatar artwork: plain, solid background, no external content.
(OUT/'email-avatar.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 1000 1000"><title>ISITUSA</title><rect width="1000" height="1000" fill="#FFFFFF"/><g fill="#00583B" fill-rule="evenodd" transform="translate(-30 -10)">{body}</g></svg>')
(OUT/'site.webmanifest').write_bytes((ROOT/'public/brand/v7/site.webmanifest').read_bytes())
manifest={'version':9,'family':'ISITUSA Botanical','base':'Chonburi by Cadson Demak, OFL 1.1; strengthened companion outlines with original ISITUSA capitals','customGlyphs':list(glyphs),'wordmarkWidth':width+40,'wordmarkHeight':760,'fullNameWidth':fullwidth,'fullNameHeight':2020,'masterSha256':hashlib.sha256(letters.encode()).hexdigest(),'emblem':'approved v3 contours'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
