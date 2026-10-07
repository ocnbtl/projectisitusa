"""Build font-independent brand lettering from original v3 outlines and new glyphs."""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'public/brand/full-name-v1'
OUT.mkdir(parents=True, exist_ok=True)
source = ET.parse(ROOT / 'public/brand/v3/isitusa-symbol-name.svg')
paths = [p.attrib['d'] for p in source.getroot().findall('{http://www.w3.org/2000/svg}path')]
glyphs = {}

def original(char, indices, left, width, transform=''):
    content = ''.join(f'<path d="{paths[i]}"/>' for i in indices)
    glyphs[char] = (width, f'<g transform="{transform}"><g transform="scale(0.666666667) translate({-left} -1028)">{content}</g></g>')

# Reuse the actual i, s, t, u and a contours, not a substitute font.
original('i', [8, 14], 139, 40)
original('s', [11], 202, 86)
original('t', [10], 399, 77)
original('u', [16], 509, 97)
original('a', [13], 780, 100)

def drawn(char, width, path):
    glyphs[char] = (width, f'<path d="{path}"/>')

# The extension follows the source's heavy stems, small counters, round shoulders,
# angled terminals, circular dots, and deliberately compact spacing.
drawn('n', 96, 'M2 100 L2 1 L35 1 L35 12 C43 2 54 -3 65 -3 C87 -3 95 12 95 38 L95 100 L59 100 L59 42 C59 31 57 25 50 25 C42 25 38 32 38 44 L38 100 Z')
drawn('h', 96, 'M2 100 L2 -31 L38 -39 L38 10 C45 1 55 -3 66 -3 C87 -3 95 12 95 38 L95 100 L59 100 L59 42 C59 31 57 25 50 25 C42 25 38 32 38 44 L38 100 Z')
drawn('v', 99, 'M0 1 L37 1 L51 61 L65 1 L101 1 L71 100 L31 100 Z')
drawn('o', 102, 'M51 -3 C84 -3 103 15 103 49 C103 84 85 103 51 103 C17 103 -1 83 -1 49 C-1 16 17 -3 51 -3 Z M51 25 C39 25 35 33 35 49 C35 67 39 75 51 75 C63 75 67 67 67 49 C67 33 63 25 51 25 Z')
drawn('c', 91, 'M91 11 L76 37 C68 29 62 26 54 26 C40 26 35 36 35 50 C35 65 41 75 54 75 C63 75 70 70 77 64 L93 89 C82 99 69 103 52 103 C18 103 -1 83 -1 50 C-1 16 19 -3 52 -3 C69 -3 82 2 91 11 Z')
drawn('e', 102, 'M100 60 L35 60 C38 73 45 77 57 77 C70 77 79 73 86 67 L101 89 C90 98 76 103 54 103 C18 103 -1 83 -1 49 C-1 17 20 -3 51 -3 C87 -3 102 18 102 49 Z M35 39 L68 39 C66 28 62 23 52 23 C43 23 37 28 35 39 Z')
drawn('p', 103, 'M2 137 L2 1 L35 1 L35 12 C44 2 55 -3 67 -3 C93 -3 105 17 105 50 C105 85 91 103 66 103 C55 103 45 98 38 91 L38 137 Z M38 49 C38 66 43 75 53 75 C64 75 68 66 68 50 C68 34 64 25 54 25 C43 25 38 33 38 49 Z')
drawn('d', 103, 'M103 100 L70 100 L70 90 C62 99 51 103 40 103 C13 103 0 83 0 50 C0 17 14 -3 40 -3 C50 -3 60 1 67 8 L67 -31 L103 -39 Z M67 50 C67 34 62 25 51 25 C40 25 36 34 36 50 C36 67 40 75 51 75 C62 75 67 67 67 50 Z')
drawn('r', 70, 'M2 100 L2 1 L35 1 L35 15 C42 2 53 -3 70 -2 L68 33 C48 29 38 37 38 55 L38 100 Z')
drawn('m', 143, 'M2 100 L2 1 L35 1 L35 12 C42 2 52 -3 63 -3 C76 -3 84 2 89 12 C98 2 108 -3 119 -3 C138 -3 145 11 145 37 L145 100 L110 100 L110 42 C110 31 108 25 102 25 C94 25 91 32 91 43 L91 100 L56 100 L56 42 C56 31 54 25 48 25 C41 25 37 32 37 44 L37 100 Z')
drawn('f', 75, 'M14 100 L14 29 L0 29 L0 1 L14 1 L14 -5 C14 -31 27 -43 52 -43 C64 -43 73 -41 82 -37 L74 -10 C69 -12 65 -13 61 -13 C53 -13 49 -9 49 -2 L49 1 L72 1 L72 29 L49 29 L49 100 Z')
drawn('I', 40, 'M2 -39 L38 -39 L38 100 L2 100 Z')
drawn('A', 121, 'M0 100 L39 -39 L84 -39 L125 100 L84 100 L79 77 L43 77 L38 100 Z M50 46 L72 46 L61 -2 Z')
# Capital S and U directly extend the matching source outlines.
glyphs['S'] = (glyphs['s'][0] * 1.28, '<g transform="translate(0 -34) scale(1.28 1.34)">' + glyphs['s'][1] + '</g>')
glyphs['U'] = (glyphs['u'][0] * 1.12, '<g transform="translate(0 -36) scale(1.12 1.36)">' + glyphs['u'][1] + '</g>')

LINES = ['Invasive Species in the', 'United States of America']
NAME = ' '.join(LINES)
assert NAME == 'Invasive Species in the United States of America'
assert all(c == ' ' or c in glyphs for c in NAME)

def line(text, y):
    x = 0
    items = []
    for char in text:
        if char == ' ':
            x += 38
            continue
        width, content = glyphs[char]
        items.append(f'<g data-letter="{escape(char)}" transform="translate({x:.3f} {y})">{content}</g>')
        x += width + 4
    return x - 4, ''.join(items)

def make(lines, color, label):
    rows = [line(text, 48 + i * 190) for i, text in enumerate(lines)]
    width = round(max(w for w, _ in rows) + 16, 3)
    height = 206 if len(lines) == 1 else 356
    body = ''.join(f'<g aria-label="{escape(text)}">{art}</g>' for text, (_, art) in zip(lines, rows))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 0 {width} {height}" width="{width}" height="{height}" fill="{color}" fill-rule="evenodd" role="img" aria-label="{NAME}"><title>{NAME}</title>{body}</svg>\n'
    (OUT / f'isitusa-full-name-{label}.svg').write_text(svg, encoding='utf-8', newline='\n')
    return width, height

dimensions = {}
for color, label in [('#00583B','green'),('#FFFFFF','white'),('#000000','black')]:
    dimensions[label] = make(LINES, color, label)
    make([NAME], color, 'single-line-' + label)
(OUT / 'lettering-manifest.json').write_text(json.dumps({'name':NAME, 'lines':LINES, 'letterCount':sum(c!=' ' for c in NAME), 'source':'../v3/isitusa-symbol-name.svg', 'reusedOutlines':['i','s','t','u','a'], 'derivedCapitals':['S','U'], 'newOutlines':sorted(set(NAME.replace(' ',''))-set('istuaSU')), 'dimensions':dimensions, 'fontDependency':False}, indent=2)+'\n',encoding='utf-8', newline='\n')
print(json.dumps(dimensions))
