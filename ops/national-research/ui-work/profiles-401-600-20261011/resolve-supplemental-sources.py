import json
from pathlib import Path

task = Path(__file__).resolve().parent
path = task / 'batch-11-results.json'
rows = json.loads(path.read_text(encoding='utf-8-sig'))
by_id = {r['speciesId']: r for r in rows}

def add(species, title, url, claims, note, access='full_text'):
    row = by_id[species]
    row['sources'].append(dict(title=title, url=url, accessedAt='2026-10-11'))
    row['evidence'].append(dict(url=url, independentSourceGroup=title, claims=claims, accessLevel=access, accessNote=note))
    row['status'] = 'ready_for_review'

add('sphenoclea-zeylanica', 'IRRI RiceIPM rice-weed account', 'https://keyserver.lucidcentral.org/key-server/data/08050103-0a0e-4e01-8a03-040d0c020e0a/media/Html/Sphenoclea_zeylanica.htm', ['Seed-reproducing annual, hollow spongy stems, densely packed white to greenish flowers and preference for wet ground or stagnant water'], 'Full RiceIPM account retrieved; historical chemical recommendations and unspecific yield-loss figures excluded.')
by_id['sphenoclea-zeylanica']['researchNotes'] = 'Independent IRRI RiceIPM account corroborates the flora description and wet-ground ecology. Historical pesticide lists and unspecific crop-loss figures are not carried into this draft. No nationwide impact claim.'

add('eragrostis-unioloides', 'Flora of China editorial account', 'https://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id=200025359', ['Annual or perennial habit, open seed heads, many-flowered flattened spikelets, purplish-red mature spikelets and grassland/roadside habitat'], 'Complete species account read from the indexed page text; direct page requests failed. Ligule descriptions differ between floras, so a single definitive ligule character is not used.')
by_id['eragrostis-unioloides']['proposedDescription'] = 'Chinese lovegrass is a small tuft-forming grass whose open seed heads carry flattened clusters of tiny flowers. These spikelets can turn purplish red as they mature, giving the airy heads a subtle wash of color. Its stems may rise from a leaning base, and plants grow as annuals or short-lived perennials. Native across tropical and subtropical Asia into parts of Queensland, it occurs in grasslands and along roadsides. Similar lovegrasses are difficult to separate, so close views of mature spikelets are more useful than a distant photograph.'
by_id['eragrostis-unioloides']['identification'] = 'Open branched seed heads and flattened, many-flowered spikelets that may mature purplish red. A grass specialist should compare the spikelets and leaf joints.'
by_id['eragrostis-unioloides']['researchNotes'] = 'Flora of China independently corroborates habit, mature spikelets and habitat. Its ligule wording differs from Kew GrassBase, so the draft avoids a definitive ligule diagnosis. No unsupported local harm or control claim is added.'

add('parlatoreopsis-chinensis', 'Korean Journal of Applied Entomology import-interception study', 'https://www.entomology2.or.kr/journal/article.php?code=11396', ['Primary observation of interception on a Styphnolobium plant imported from China'], 'Species-specific section read in indexed article text; direct retrieval timed out. Only the reported interception is used as independent evidence, not the paper\'s repeated historical citations.', 'indexed_excerpt')
by_id['parlatoreopsis-chinensis']['proposedDescription'] = 'Chinese obscure scale is a tiny armored insect found on woody plants, including crabapple. Females live beneath protective covers, and their identity usually depends on microscopic examination. Historical observations in Missouri describe overlapping generations and fertilized females surviving winter. A Korean import study also found the species on a tree brought from China, showing why nursery inspections matter. Older accounts sometimes confused it with a related scale, so an extension diagnosis is a better starting point than treating every crust-like patch on a branch as this species.'
by_id['parlatoreopsis-chinensis']['researchNotes'] = 'Independent primary interception observation supplements ScaleNet biology. The species-specific article section was available as indexed text, not a successful direct full-paper fetch. Historical synonym confusion remains explicit; no nationwide damage or current treatment claim.'
path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print('Added independently sourced evidence to three batch-11 profiles.')
