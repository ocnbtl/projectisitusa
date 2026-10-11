import json
from pathlib import Path
p = Path(__file__).resolve().parent / 'parent-581-600-results.json'
rows = json.loads(p.read_text(encoding='utf-8-sig'))
by_id = {r['speciesId']: r for r in rows}
r = by_id['erythrina-crista-galli']
r['proposedDescription'] = r['proposedDescription'].split(' A planted specimen')[0]
r = by_id['agrostis-capillaris']
r['proposedDescription'] = r['proposedDescription'].replace('the small collar where a leaf meets its sheath', 'the small membranous flap where a leaf blade meets its sheath')
r['identification'] = 'Look for narrow leaves and a loose, branching flower cluster. The short membranous flap (ligule) at the blade-sheath junction helps distinguish it from creeping bentgrass and redtop.'
r = by_id['combretum-indicum']
r['proposedDescription'] = 'Rangoon creeper is a woody climber best known for fragrant flowers that change from white through pink to red as they age. Hooks formed from leaf stalks help it climb over supports, and its broad leaves grow in opposite pairs. Its native range includes Tanzania and tropical and subtropical Asia through northern Australia. Widely cultivated in tropical gardens, it has also been introduced elsewhere. The mix of flower colors on a single vine makes it especially distinctive when in bloom.'
r = by_id['bambusa-vulgaris']
r['proposedDescription'] = r['proposedDescription'].replace("Florida's assessment does not currently document a problem in its completed southern assessment, rather than supporting a blanket invasive label.", "Florida's completed assessment for its southern region does not document an invasive problem there; other regions need their own assessment.")
p.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print('Applied four editorial refinements.')
