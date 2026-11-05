import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// A committed, append-only list keeps multiple changes on the same day.
// Builds never invent release claims from paths or expose raw commit messages.
export function createSiteRelease({ timestamp, revision, notes }) {
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid release timestamp');
  if (!Array.isArray(notes) || notes.length === 0) throw new Error('Release notes must be a nonempty history');
  const ids = new Set();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
  for (const note of notes) {
    if (!note.id || ids.has(note.id)) throw new Error('Each update needs a unique stable id');
    ids.add(note.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date) || !Number.isFinite(Date.parse(note.date)) || note.date > day) throw new Error('Invalid or future release date');
    if (!note.title?.trim() || !note.detail?.trim() || !/^\/(?!\/)[a-z0-9/-]*$/.test(note.href)) throw new Error('Update requires public copy and a local link');
  }
  const updates = [...notes].sort((a, b) => b.date.localeCompare(a.date));
  const contentId = createHash('sha256').update(JSON.stringify(updates)).digest('hex').slice(0, 16);
  return { ...updates[0], revision: contentId, sourceRevision: revision, updates };
}

export function prepareSiteRelease() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim();
  const revision = git('rev-parse', 'HEAD');
  const timestamp = git('show', '-s', '--format=%cI', revision);
  const notes = JSON.parse(fs.readFileSync('src/content/site-release-notes.json', 'utf8'));
  const release = createSiteRelease({ timestamp, revision, notes });
  fs.writeFileSync('src/content/site-release.generated.json', JSON.stringify(release, null, 2) + '\n');
  console.log(`Prepared ${release.updates.length} individual site updates through ${release.date}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) prepareSiteRelease();
