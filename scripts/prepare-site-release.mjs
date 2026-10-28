import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Ship an in-app release notice with the built artifact. Never expose commit
// messages, private research notes, or a visitor's current date as an update.
export function createSiteRelease({ timestamp, revision, paths, notes }) {
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid release timestamp');
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
  if (notes.date === date) return { ...notes, revision };
  const areas = [];
  if (paths.some(p => /map|atlas/.test(p))) areas.push('map exploration');
  if (paths.some(p => /species|editorial/.test(p) && !p.includes('/admin/'))) areas.push('species information');
  if (paths.some(p => /research|data-sources|approach/.test(p))) areas.push('research pages');
  if (paths.some(p => /support|contribution/.test(p))) areas.push('support options');
  const detail = areas.length
    ? `This release includes updates to ${areas.join(', ')}. Explore the latest version of ISITUSA.`
    : 'We’ve published an updated version of ISITUSA, with refinements to how the site works.';
  return { date, revision, title: 'The latest site improvements', detail, href: '/' };
}

export function prepareSiteRelease() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim();
  const revision = git('rev-parse', 'HEAD');
  const timestamp = git('show', '-s', '--format=%cI', revision);
  const paths = git('diff-tree', '--root', '--no-commit-id', '--name-only', '-r', revision).split('\n');
  const notes = JSON.parse(fs.readFileSync('src/content/site-release-notes.json', 'utf8'));
  const release = createSiteRelease({ timestamp, revision, paths, notes });
  fs.writeFileSync('src/content/site-release.generated.json', JSON.stringify(release, null, 2) + '\n');
  console.log(`Prepared site update: ${release.date}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) prepareSiteRelease();
