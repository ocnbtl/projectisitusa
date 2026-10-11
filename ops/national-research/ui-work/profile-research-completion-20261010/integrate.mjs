import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const dir = 'ops/national-research/ui-work/profile-research-completion-20261010';
const target = 'src/content/species-editorial-revisions.json';
const base = JSON.parse(execFileSync('git', ['show', `4862d3967f:${target}`], { encoding: 'utf8' }));
const packets = [1, 2, 3, 4].map(n => JSON.parse(fs.readFileSync(`${dir}/batch-${n}-results.json`, 'utf8').replace(/^\uFEFF/, '')));
const updates = packets.flat();
assert.equal(updates.length, 86);
const byId = new Map(updates.map(row => [row.speciesId, row]));
assert.equal(byId.size, 86);
assert.deepEqual([...byId.keys()].sort(), base.filter(row => row.status === 'research_gap').map(row => row.speciesId).sort());
for (const row of updates) {
  assert.equal(row.status, 'ready_for_review', row.speciesId);
  assert.ok(row.proposedDescription.trim().split(/\s+/).length >= 50, row.speciesId);
  assert.ok(row.sources.length >= 2, row.speciesId);
  assert.ok(new Set(row.evidence.map(item => item.independentSourceGroup)).size >= 2, row.speciesId);
  assert.ok(row.evidence.every(item => row.sources.some(source => source.url === item.url)), row.speciesId);
  assert.ok(row.evidence.every(item => item.supportedClaims.length > 0), row.speciesId);
  assert.ok(!row.remainingGap, row.speciesId);
  for (const source of row.sources) assert.ok(/^https?:\/\//.test(source.url));
}
const result = base.map(row => {
  const update = byId.get(row.speciesId);
  return update ? { ...row, previousDescription: row.proposedDescription, ...update, revisionNumber: 3, revisedAt: '2026-10-10' } : row;
});
assert.equal(result.length, 200);
assert.equal(result.filter(row => row.status === 'ready_for_review').length, 200);
assert.equal(result.filter(row => row.revisionNumber === 3).length, 86);
for (const row of result) if (!byId.has(row.speciesId)) assert.deepEqual(row, base.find(old => old.speciesId === row.speciesId));
fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
const report = {
  updated: 86, totalCandidates: 200, readyForEditorialReview: 200, descriptionResearchGaps: 0,
  batchUpdates: packets.map((rows, i) => ({ batch: i + 1, updated: rows.length })),
  unchangedCandidates: 114, savedFeedbackWrites: 0, publicProfileWrites: 0,
  scope: 'Description readiness only. Taxonomic and historical occurrence caveats remain in relevant descriptions and research notes. No occurrence records have been reconciled by this update.',
  evidenceEntries: updates.reduce((n, row) => n + row.evidence.length, 0),
};
fs.writeFileSync(`${dir}/validation.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
