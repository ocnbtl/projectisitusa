import json
from pathlib import Path
t = Path(__file__).resolve().parent
for batch, tail in [(10, '481-500'), (12, '581-600')]:
    p = t / f'batch-{batch}-results.json'
    rows = json.loads(p.read_text(encoding='utf-8-sig'))
    assert len(rows) == 30, 'Merge once, after worker completion.'
    rows += json.loads((t / f'parent-{tail}-results.json').read_text(encoding='utf-8-sig'))
    expected = json.loads((t / f'batch-{batch}-input.json').read_text(encoding='utf-8-sig'))
    assert [r['speciesId'] for r in rows] == [r['id'] for r in expected]
    p.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(f'Batch {batch}: merged 30 + 20 = {len(rows)} in exact queue order.')
