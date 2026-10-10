"""ISITUSA Canopy: original Latin display outlines; Outfit supplies ancillary glyphs.

Usage: python scripts/build-brand-v8.py path/to/Outfit-variable.ttf
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
OUT=ROOT/'public/brand/v8'; FONTS=ROOT/'public/fonts/isitusa-canopy'
OUT.mkdir(parents=True,exist_ok=True); FONTS.mkdir(parents=True,exist_ok=True)
font=instantiateVariableFont(TTFont(sys.argv[1]),{'wght':800},inplace=False)
cmap=font.getBestCmap(); glyphs={}
def put(c,w,d): glyphs[c]=(w,d)
def stem(x,y=0,h=700,w=168):
 return f'M{x-30} {y} Q{x} {y+22} {x} {y+65} L{x} {y+h-65} Q{x} {y+h-22} {x-30} {y+h} L{x+w+30} {y+h} Q{x+w} {y+h-22} {x+w} {y+h-65} L{x+w} {y+65} Q{x+w} {y+22} {x+w+30} {y} Z'
def rect(x,y,w,h): return f'M{x} {y}v{h}h{w}v{-h}Z'
put('I',300,stem(66))
put('T',640,'M15 700H625L641 516Q581 560 511 560H404V74Q404 22 436 0H204Q236 22 236 74V560H129Q59 560 -1 516Z')
put('S',630,'M566 661V475C504 543 443 575 359 575C284 575 240 553 240 512C240 470 284 451 382 419C527 371 605 307 605 199C605 62 492 -14 324 -14C211 -14 117 10 38 58V248C121 165 215 126 310 126C390 126 433 148 433 190C433 232 385 255 288 287C146 333 69 397 69 511C69 641 182 714 343 714C431 714 506 696 566 661Z')
put('U',700,'M26 700H258Q225 678 225 628V292C225 177 268 134 350 134C433 134 475 177 475 292V628Q475 678 442 700H674Q642 678 642 628V285C642 78 537 -14 350 -14C163 -14 58 78 58 285V628Q58 678 26 700Z')
put('A',730,'M16 0Q51 25 74 85L297 700H444L666 85Q689 25 724 0H476L425 163H266L214 0Z M308 292H382L345 443Z')
put('N',720,stem(62)+stem(490)+'M203 700C245 606 323 520 491 363V102C403 229 290 325 202 417Z')
put('H',720,stem(62)+stem(490)+rect(212,277,306,145))
put('E',600,stem(60)+rect(218,555,337,145)+rect(218,286,272,133)+rect(218,0,337,145))
put('F',580,stem(60)+rect(218,555,337,145)+rect(218,286,272,133))
put('L',590,stem(60)+'M218 0V148H459Q525 148 564 185L551 0Z')
put('O',760,'M380 -14C161 -14 32 137 32 350C32 563 161 714 380 714C599 714 728 563 728 350C728 137 599 -14 380 -14Z M380 143C485 143 551 223 551 350C551 477 485 557 380 557C275 557 209 477 209 350C209 223 275 143 380 143Z')
put('C',720,'M656 658V457C590 527 521 557 427 557C300 557 209 478 209 350C209 222 300 143 427 143C521 143 590 173 656 243V42C588 5 508 -14 420 -14C186 -14 32 135 32 350C32 565 186 714 420 714C508 714 588 695 656 658Z')
put('G',770,glyphs['C'][1]+'M436 390H722V42L565 42V244H500Q465 244 436 215Z')
put('D',730,'M31 0Q62 23 62 72V628Q62 677 31 700H342C559 700 700 563 700 350C700 137 559 0 342 0Z M230 151H330C451 151 523 223 523 350C523 477 451 549 330 549H230Z')
put('B',680,'M30 0Q62 23 62 72V628Q62 677 30 700H368C530 700 620 625 620 516C620 442 585 390 522 363C607 337 650 278 650 193C650 75 551 0 390 0Z M230 422H344C414 422 451 445 451 492C451 540 414 562 344 562H230Z M230 138H363C438 138 477 162 477 215C477 266 438 289 363 289H230Z')
put('P',650,'M30 0Q62 23 62 72V628Q62 677 30 700H342C529 700 626 604 626 455C626 306 529 209 342 209H230V72Q230 23 262 0Z M230 354H325C410 354 453 389 453 455C453 521 410 555 325 555H230Z')
put('R',720,glyphs['P'][1]+'M331 244L497 0H704L487 306Z')
put('J',550,'M269 700H500V226C500 70 414 -14 270 -14C174 -14 106 9 40 58V239C103 169 158 139 219 139C297 139 332 180 332 248V628Q332 677 269 700Z')
put('K',730,stem(62)+'M230 361L477 700H697L419 339L725 0H493L230 312Z')
put('M',890,stem(62)+stem(660)+'M219 700L445 345L671 700V400L445 50L219 400Z')
put('V',720,'M13 700H244L362 245L480 700H711Q680 674 660 618L445 0H280L63 618Q43 674 13 700Z')
put('W',1030,'M13 700H236L353 268L435 581L403 700H624L742 268L859 700H1017L816 0H646L532 399L423 0H251Z')
put('X',720,'M23 700H243L361 494L479 700H697L473 354L706 0H482L359 216L235 0H14L247 354Z')
put('Y',700,'M9 700H236L354 454L472 700H693L437 262V72Q437 23 469 0H237Q269 23 269 72V262Z')
put('Z',660,'M40 700H621V562L258 145H516Q583 145 623 180V0H33V138L396 555H146Q79 555 40 520Z')
put('Q',790,glyphs['O'][1]+'M431 200L734 -59H509L328 107Z')

# Lowercase uses the same round bodies and flared vertical stems, with wider
# counters than the discarded book-serif design. Ancillary Unicode is Outfit.
def lowerstem(x,h=530): return stem(x,0,h,145)
put('l',277,lowerstem(66,720))
put('i',277,lowerstem(66)+ 'M56 641C56 592 221 592 221 641C221 748 56 748 56 641Z')
put('j',290,'M66 530H211V-46C211 -159 145 -212 42 -212H-12V-69H12Q66 -69 66 -15Z M56 641C56 592 221 592 221 641C221 748 56 748 56 641Z')
put('n',605,lowerstem(56)+'M201 430C241 505 301 544 380 544C493 544 553 467 553 336V66Q553 22 583 0H378Q408 22 408 66V308C408 375 377 410 328 410C252 410 201 332 201 267Z')
put('h',605,glyphs['n'][1].replace(lowerstem(56),lowerstem(56,720)))
put('m',896,lowerstem(56)+'M201 430C241 505 289 544 366 544C444 544 493 505 516 441C558 509 611 544 685 544C798 544 844 467 844 336V66Q844 22 874 0H669Q699 22 699 66V308C699 375 675 410 630 410C568 410 529 345 529 267V66Q529 22 559 0H354Q384 22 384 66V308C384 375 360 410 315 410C253 410 201 332 201 267Z')
put('r',430,lowerstem(56)+'M201 399C246 505 300 544 402 544V366C351 393 314 398 278 375C239 350 201 304 201 232Z')
put('o',625,'M312 -14C140 -14 26 98 26 265C26 432 140 544 312 544C485 544 599 432 599 265C599 98 485 -14 312 -14Z M312 118C392 118 447 176 447 265C447 354 392 412 312 412C233 412 178 354 178 265C178 176 233 118 312 118Z')
put('c',570,'M529 497V335C471 390 420 412 359 412C249 412 178 353 178 265C178 177 249 118 359 118C420 118 471 140 529 195V33C474 3 413 -14 345 -14C147 -14 26 98 26 265C26 432 147 544 345 544C413 544 474 527 529 497Z')
put('e',608,'M176 225C192 150 243 116 331 116C411 116 479 144 536 186V48C480 8 406 -14 319 -14C139 -14 26 98 26 265C26 432 139 544 311 544C485 544 584 429 584 265V225Z M179 334H429C419 392 378 423 309 423C243 423 198 393 179 334Z')
put('a',625,'M423 530H568V66Q568 22 598 0H423V61C381 11 330 -14 263 -14C124 -14 26 98 26 265C26 432 124 544 263 544C330 544 381 519 423 469Z M299 118C374 118 423 176 423 265C423 354 374 412 299 412C225 412 178 354 178 265C178 176 225 118 299 118Z')
put('b',625,lowerstem(56,720)+'M201 469C243 519 294 544 361 544C500 544 598 432 598 265C598 98 500 -14 361 -14C294 -14 243 11 201 61Z M325 118C399 118 446 176 446 265C446 354 399 412 325 412C250 412 201 354 201 265C201 176 250 118 325 118Z')
put('d',625,glyphs['a'][1]+rect(423,480,145,240))
put('p',625,glyphs['b'][1].replace(lowerstem(56,720),stem(56,-200,730,145)))
put('q',625,glyphs['a'][1]+rect(423,-200,145,250))
put('g',625,glyphs['a'][1]+'M423 70H568V-11C568 -151 466 -220 309 -220C220 -220 145 -202 81 -165V-25C148 -64 218 -87 288 -87C379 -87 423 -60 423 3Z')
put('s',514,'M463 501V342C411 392 355 418 288 418C235 418 205 403 205 378C205 349 243 338 312 317C428 283 486 237 486 155C486 47 399 -14 263 -14C174 -14 99 6 40 42V207C105 144 173 114 251 114C305 114 335 129 335 156C335 183 300 197 232 218C116 252 56 299 56 381C56 484 144 544 277 544C352 544 414 529 463 501Z')
put('u',605,'M26 530H231Q201 508 201 464V222C201 155 232 120 281 120C357 120 408 198 408 263V464Q408 508 378 530H583Q553 508 553 464V66Q553 22 583 0H408V100C368 25 308 -14 229 -14C116 -14 56 63 56 194V464Q56 508 26 530Z')
put('t',404,'M91 663L236 706V530H380V398H236V193C236 143 259 119 302 119C332 119 357 127 383 145V12C346 -5 302 -14 259 -14C148 -14 91 49 91 163V398H16V530H91Z')
put('f',412,'M91 0V398H16V530H91V571C91 683 160 740 276 740C322 740 361 732 397 716V580C368 600 342 608 313 608C260 608 236 586 236 536V530H380V398H236V66Q236 22 266 0Z')
put('k',591,lowerstem(56,720)+'M201 282L383 530H570L358 260L590 0H389L201 234Z')
put('v',571,'M10 530H208L288 203L369 530H563L377 0H199Z')
put('w',818,'M10 530H196L278 225L346 458L325 530H509L591 225L673 530H810L643 0H480L407 263L334 0H171Z')
put('x',566,'M15 530H205L286 380L367 530H553L383 267L557 0H364L283 153L202 0H9L183 267Z')
put('y',571,glyphs['v'][1]+'M198 0H377L302 -200H107Z')
put('z',514,'M40 530H476V409L226 125H390Q445 125 476 150V0H32V121L282 405H124Q69 405 40 380Z')

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
  value={1:'ISITUSA Canopy',2:'Regular',3:'ISITUSA Canopy 1.0',4:'ISITUSA Canopy',6:'ISITUSACanopy-Regular',16:'ISITUSA Canopy',17:'Regular'}[rec.nameID]
  rec.string=value.encode(rec.getEncoding(),errors='replace')
font['OS/2'].usWeightClass=800;font['OS/2'].sCapHeight=700;font['OS/2'].sxHeight=530
font['OS/2'].fsSelection=(font['OS/2'].fsSelection & ~33)|64;font['head'].macStyle=0
ss=subset.Subsetter(options=subset.Options());ss.populate(unicodes=list(range(32,383))+list(range(0x2000,0x2070))+[0x20ac,0x2122]);ss.subset(font)
font.save(FONTS/'ISITUSACanopy-Regular.ttf');font.flavor='woff2';font.save(FONTS/'isitusa-canopy.woff2');font.flavor=None
gs=font.getGlyphSet();cmap=font.getBestCmap()
def outline(text,tracking=0,logo=False):
 x=0;paths=[]
 pairs={'IS':-5,'SI':-4,'IT':-12,'TU':-3,'US':-6,'SA':-8}
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
(OUT/'full-name.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fullwidth} 1820" fill="#00583B"><title>Invasive Species In The United States of America</title>'+''.join(f'<g transform="translate(20 {720+900*i}) scale(1 -1)">{p}</g>' for i,(p,w) in enumerate(parts))+'</svg>')
emblem=(ROOT/'public/brand/v3/isitusa-symbol.svg').read_text()
body=re.search(r'<path.*</svg>',emblem,re.S).group(0).removesuffix('</svg>')
scale=800/(width+40)
(OUT/'symbol-name.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 1080" fill="#00583B"><title>ISITUSA</title><g fill-rule="evenodd" transform="translate(-110 -90)">{body}</g><g id="wordmark" transform="translate(20 {884+720*scale}) scale({scale} {-scale})">{letters}</g></svg>')
# Dedicated email-avatar artwork: plain, solid background, no external content.
(OUT/'email-avatar.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny-ps" viewBox="0 0 1000 1000"><title>ISITUSA</title><rect width="1000" height="1000" fill="#FFFFFF"/><g fill="#00583B" fill-rule="evenodd" transform="translate(-30 -10)">{body}</g></svg>')
(OUT/'site.webmanifest').write_bytes((ROOT/'public/brand/v7/site.webmanifest').read_bytes())
manifest={'version':8,'family':'ISITUSA Canopy','base':'Outfit 800, OFL 1.1, ancillary glyphs only','customGlyphs':list(glyphs),'wordmarkWidth':width+40,'wordmarkHeight':760,'fullNameWidth':fullwidth,'fullNameHeight':1820,'masterSha256':hashlib.sha256(letters.encode()).hexdigest(),'emblem':'approved v3 contours'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
