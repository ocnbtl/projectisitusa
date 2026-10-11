"""Validate and integrate the next 200 private review candidates only."""
import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[4]
TASK = Path(__file__).resolve().parent
BASE = "ad515a0550"

def baseline(path):
    return json.loads(subprocess.check_output(["git", "show", f"{BASE}:{path}"], cwd=ROOT))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")

queue = json.loads((ROOT / "src/content/editorial-queue.json").read_text(encoding='utf-8'))
old = baseline("src/content/species-editorial-revisions.json")
assert len(old) == 400
assert json.loads((ROOT / "src/content/editorial-queue.json").read_text(encoding='utf-8')) == baseline("src/content/editorial-queue.json")
new = []
counts = []
for batch in range(9, 13):
    expected = [row for row in queue if row["batch"] == batch]
    rows = json.loads((TASK / f"batch-{batch}-results.json").read_text(encoding="utf-8-sig"))
    assert isinstance(rows, list) and len(rows) == 50, f"Batch {batch} must have 50 rows"
    by_id = {row["speciesId"]: row for row in rows}
    assert len(by_id) == 50 and set(by_id) == {r["id"] for r in expected}
    drafts = {}
    for expected_row in expected:
        row = by_id[expected_row["id"]]
        assert row["status"] in ("ready_for_review", "research_gap")
        assert 40 <= len(row["proposedDescription"].split()) <= 145, row["speciesId"]
        assert row["researchNotes"].strip() and row.get("identification", "").strip()
        urls = [source["url"] for source in row["sources"]]
        assert len(set(urls)) == len(urls) and urls
        assert all(urlparse(url).scheme in ("https", "http") and urlparse(url).netloc for url in urls)
        assert all(source.get("title") and source.get("accessedAt") == "2026-10-11" for source in row["sources"])
        evidence = row.get("evidence", [])
        assert evidence and all(e["url"] in urls for e in evidence), row["speciesId"]
        groups = {e["independentSourceGroup"] for e in evidence}
        assert all(e.get("claims", e.get("supportedClaims")) for e in evidence)
        if row["status"] == "ready_for_review":
            assert len(groups) >= 2 and len(urls) >= 2, row["speciesId"]
        normalized = dict(row, revisionNumber=1, revisedAt="2026-10-11")
        new.append(normalized)
        drafts[row["speciesId"]] = {
            "summary": row["proposedDescription"],
            "reviewedAt": "2026-10-11",
            "sources": [{"label": s["title"], "url": s["url"]} for s in row["sources"]],
        }
    write(ROOT / f"src/content/editorial-batch-{batch:02d}-completion.json", drafts)
    counts.append({"batch": batch, "count": len(rows), "ready": sum(r["status"] == "ready_for_review" for r in rows), "gaps": sum(r["status"] == "research_gap" for r in rows)})

assert len(new) == 200 and len({row["speciesId"] for row in old + new}) == 600
write(ROOT / "src/content/species-editorial-revisions.json", old + new)
for number in range(1, 9):
    path = f"src/content/editorial-batch-{number:02d}-completion.json"
    assert json.loads((ROOT / path).read_text(encoding='utf-8')) == baseline(path)
assert json.loads((ROOT / "src/content/species-editorial-revisions.json").read_text(encoding='utf-8'))[:400] == old
result = {"baseline": 400, "new": 200, "total": 600, "batches": counts, "sourceClaimMappings": sum(len(r["evidence"]) for r in new), "first400Unchanged": True, "privateDatabaseWrites": 0}
write(TASK / "validation.json", result)
print(json.dumps(result, indent=2))
