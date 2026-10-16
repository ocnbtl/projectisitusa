"""Package Invasive Serif with the approved h, logo and States spacing refinements."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib.tables import otTables
from fontTools.ttLib.tables.otBase import ValueRecord

ROOT = Path(__file__).resolve().parents[1]
FONTDIR = ROOT / 'public/fonts/invasive-serif'
OUT = ROOT / 'public/brand/v10'
MASTER = FONTDIR / 'source/approved-master.ttf'
FONTDIR.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
if len(sys.argv) > 1:
    MASTER.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(sys.argv[1], MASTER)
font = TTFont(MASTER, recalcTimestamp=False)

def refine_spacing(candidate):
    # Preserve approved States spacing and unify uppercase US/SA spacing.
    # Logo artwork uses the same native pairs; glyph drawings stay untouched.
    cmap = candidate.getBestCmap()
    table = candidate['GPOS'].table.LookupList.Lookup[0].SubTable[0]
    assert table.Format == 1 and table.ValueFormat1 == 4 and table.ValueFormat2 == 0
    for first, second, before, after in [('t', 'a', -9, 1), ('a', 't', None, -40),
                                         ('U', 'S', -8, -40), ('S', 'A', -14, -36)]:
        pairset = table.PairSet[table.Coverage.glyphs.index(cmap[ord(first)])]
        name = cmap[ord(second)]
        matches = [pair for pair in pairset.PairValueRecord if pair.SecondGlyph == name]
        if before is None:
            assert not matches
            record = otTables.PairValueRecord()
            record.SecondGlyph = name
            record.Value1 = ValueRecord(table.ValueFormat1)
            record.Value2 = None
            pairset.PairValueRecord.append(record)
        else:
            assert len(matches) == 1 and matches[0].Value1.XAdvance == before
            record = matches[0]
        record.Value1.XAdvance = after
        pairset.PairValueRecord.sort(key=lambda pair: candidate.getGlyphID(pair.SecondGlyph))
        pairset.PairValueCount = len(pairset.PairValueRecord)

refine_spacing(font)
# Translate the complete top serif down 20 units, shortening only the straight
# ascender. Preserve its curves, width, shoulder, sidebearings and all kerning.
h_name = font.getBestCmap()[ord('h')]
h_glyph = font['glyf'][h_name]
assert h_glyph.yMax == 720
for point in range(31, 39):
    x, y = h_glyph.coordinates[point]
    assert y >= 610
    h_glyph.coordinates[point] = (x, y - 20)
h_glyph.recalcBounds(font['glyf'])
assert h_glyph.yMax == font['glyf'][font.getBestCmap()[ord('T')]].yMax == 700
names = {0: 'Copyright 2026 ISITUSA.', 1: 'Invasive Serif', 2: 'Bold',
         3: 'ISITUSA:InvasiveSerif-Bold:1.005', 4: 'Invasive Serif Bold',
         5: 'Version 1.005', 6: 'InvasiveSerif-Bold', 16: 'Invasive Serif',
         17: 'Bold', 10: 'ISITUSA botanical display lettering. Grove XXIII with approved h ascender and ta/at and uppercase US/SA spacing refinements.'}
for record in font['name'].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
for key, value in names.items():
    font['name'].setName(value, key, 3, 1, 0x409)
font['OS/2'].usWeightClass = 700
font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~65) | 32
font['head'].macStyle = (font['head'].macStyle & ~2) | 1
font['head'].fontRevision = 1.005
ttf = FONTDIR / 'InvasiveSerif-Bold.ttf'
font.save(ttf)
font.flavor = 'woff2'
font.save(FONTDIR / 'invasive-serif.woff2')
font.flavor = None

def shape(path, text):
    f = hb.Font(hb.Face(path.read_bytes()))
    f.scale = (1000, 1000)
    b = hb.Buffer()
    b.add_str(text)
    b.guess_segment_properties()
    hb.shape(f, b, {'kern': True})
    return [(i.codepoint, p.x_advance, p.x_offset, p.y_offset)
            for i, p in zip(b.glyph_infos, b.glyph_positions)]

gs = font.getGlyphSet()
order = font.getGlyphOrder()
def outline(text):
    x = 0
    paths = []
    bounds = []
    for index, (gid, advance, dx, dy) in enumerate(shape(ttf, text)):
        name = order[gid]
        pen = SVGPathPen(gs)
        gs[name].draw(pen)
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        if bp.bounds:
            a, b, c, d = bp.bounds
            bounds.append((a+x+dx, b+dy, c+x+dx, d+dy))
        paths.append(f'<path transform="translate({x+dx} {dy})" d="{pen.getCommands()}"/>')
        x += advance
    return ''.join(paths), (min(b[0] for b in bounds), min(b[1] for b in bounds),
                            max(b[2] for b in bounds), max(b[3] for b in bounds))

letters, (left, bottom, right, top) = outline('ISITUSA')
width, height = right-left+40, top-bottom+40
for name, color in {'green':'#00583B', 'white':'#FFFFFF', 'black':'#111111'}.items():
    (OUT / f'wordmark-{name}.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" fill="{color}"><title>ISITUSA</title><g transform="translate({20-left} {20+top}) scale(1 -1)">{letters}</g></svg>', encoding='utf8')
parts = [outline(t) for t in ['Invasive Species In The', 'United States of America']]
fullwidth = max(b[2]-b[0] for _, b in parts)+40
fullheight = sum(b[3]-b[1] for _, b in parts)+190
y = 20
groups = []
for paths, (l, b, r, t) in parts:
    groups.append(f'<g transform="translate({20-l} {y+t}) scale(1 -1)">{paths}</g>')
    y += t-b+150
(OUT / 'full-name.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fullwidth} {fullheight}" fill="#00583B"><title>Invasive Species In The United States of America</title>{"".join(groups)}</svg>', encoding='utf8')
emblem = (ROOT / 'public/brand/v3/isitusa-symbol.svg').read_text()
body = re.search(r'<path.*</svg>', emblem, re.S).group(0).removesuffix('</svg>')
scale = 800/width
(OUT / 'symbol-name.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 1080" fill="#00583B"><title>ISITUSA</title><g fill-rule="evenodd" transform="translate(-110 -90)">{body}</g><g transform="translate({20+(20-left)*scale} {884+(20+top)*scale}) scale({scale} {-scale})">{letters}</g></svg>', encoding='utf8')
shutil.copyfile(ROOT / 'public/brand/v9/site.webmanifest', OUT / 'site.webmanifest')
manifest = {'version':10, 'fontRevision':'1.005', 'logoOpticalAdjustments':{}, 'logoSpacing':'Native font kerning; no duplicate optical offsets', 'kerningAdjustments':{'ta':{'before':-9,'after':1},'at':{'before':0,'after':-40},'US':{'before':-8,'after':-40},'SA':{'before':-14,'after':-36}}, 'family':'Invasive Serif', 'weight':700,
            'wordmarkWidth':width, 'wordmarkHeight':height,
            'fullNameWidth':fullwidth, 'fullNameHeight':fullheight,
            'masterSha256':hashlib.sha256(MASTER.read_bytes()).hexdigest(),
            'fontSha256':hashlib.sha256(ttf.read_bytes()).hexdigest(),
            'encodedCharacters':len(font.getBestCmap()),
            'emblem':'Preserved v3 contours', 'shaping':'HarfBuzz OpenType kerning'}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', newline='\n')
original = TTFont(MASTER)
expected_spacing = TTFont(MASTER)
refine_spacing(expected_spacing)
packaged = TTFont(ttf)
web = TTFont(FONTDIR / 'invasive-serif.woff2')
for candidate in [packaged, web]:
    for name in original.getGlyphOrder():
        if name != h_name:
            assert candidate['glyf'][name].compile(candidate['glyf']) == original['glyf'][name].compile(original['glyf']), name
    old_points = original['glyf'][h_name].coordinates
    new_points = candidate['glyf'][h_name].coordinates
    for index, ((ox, oy), (nx, ny)) in enumerate(zip(old_points, new_points)):
        assert nx == ox and ny == oy - (20 if 31 <= index <= 38 else 0)
    assert candidate['glyf'][h_name].flags == original['glyf'][h_name].flags
    assert candidate['hmtx'].metrics == original['hmtx'].metrics
    assert candidate.getBestCmap() == original.getBestCmap()
    assert candidate['GPOS'].compile(candidate) == expected_spacing['GPOS'].compile(expected_spacing)
    for table in ['hhea', 'prep']:
        assert candidate[table].compile(candidate) == original[table].compile(original)
samples = ['Your', 'October', 'Yule', 'Yvette', 'Yggdrasil',
           'Accessible invasive species research to protect the places you love.']
for text in samples:
    assert shape(MASTER, text) == shape(ttf, text)
assert sum(p[1] for p in shape(MASTER, 'ISITUSA')) - sum(p[1] for p in shape(ttf, 'ISITUSA')) == 54
for text in ['States', 'state', 'status', 'United States of America']:
    before, after = shape(MASTER, text), shape(ttf, text)
    assert sum(p[1] for p in before) - sum(p[1] for p in after) == 30, text
print(json.dumps({**manifest, 'onlyHAscenderChanged':True, 'onlyTaAtUsSaKerningChanged':True, 'otherOutlinesMetricsKerningCoveragePreserved':True}))
