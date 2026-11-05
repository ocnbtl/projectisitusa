import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSiteRelease } from './prepare-site-release.mjs';
const notes = [
  { id: 'one', date: '2026-11-05', title: 'First', detail: 'One improvement', href: '/' },
  { id: 'two', date: '2026-11-05', title: 'Second', detail: 'Another improvement', href: '/species' },
  { id: 'old', date: '2026-10-28', title: 'Earlier', detail: 'Retained', href: '/' },
];
const input = { timestamp: '2026-11-05T12:00:00Z', revision: 'build-a', notes };
const first = createSiteRelease(input);
assert.equal(first.updates.length, 3);
assert.deepEqual(first.updates.map(n => n.id), ['one', 'two', 'old']);
const rebuild = createSiteRelease({ ...input, timestamp: '2026-11-06T12:00:00Z', revision: 'build-b' });
assert.equal(rebuild.revision, first.revision, 'Rebuilds must not create unread notifications');
assert.equal(rebuild.date, first.date, 'Rebuilds must not claim a new update');
const added = createSiteRelease({ ...input, notes: [{ ...notes[0], id: 'new' }, ...notes] });
assert.notEqual(added.revision, first.revision);
assert.throws(() => createSiteRelease({ ...input, notes: [notes[0], notes[0]] }));
assert.throws(() => createSiteRelease({ ...input, timestamp: 'invalid' }));
assert.throws(() => createSiteRelease({ ...input, notes: [{ ...notes[0], date: '2099-01-01' }] }));
assert.throws(() => createSiteRelease({ ...input, notes: [{ ...notes[0], href: '//outside.example' }] }));
const history = JSON.parse(fs.readFileSync(new URL('../src/content/site-release-notes.json', import.meta.url)));
const release = createSiteRelease({ ...input, notes: history });
assert.ok(release.updates.length >= 16);
console.log('PASS: retained history, same-day updates, stable read state, validation and generated entries');
