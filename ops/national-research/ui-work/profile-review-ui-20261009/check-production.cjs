const fs = require('node:fs');
const published = JSON.parse(fs.readFileSync('src/content/editorial-published.json', 'utf8'));
const drafts = Object.assign({}, ...[1, 2, 3, 4].map(n => JSON.parse(fs.readFileSync(`src/content/editorial-batch-0${n}-completion.json`, 'utf8'))));
const decode = text => text.replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
(async () => {
  const checks = await Promise.all([
    ['/admin', 200], ['/admin/preview', 404], ['/species/artemisia-absinthium', 200],
  ].map(async ([path, expected]) => {
    const response = await fetch(`https://isitusa.com${path}`, { signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const result = { path, status: response.status, expected, pass: response.status === expected };
    if (path.includes('/species/')) {
      const text = decode(html);
      result.publishedDescriptionRetained = text.includes(published['artemisia-absinthium'].summary);
      result.unreviewedDraftAbsent = !text.includes(drafts['artemisia-absinthium'].summary);
      result.pass &&= result.publishedDescriptionRetained && result.unreviewedDraftAbsent;
    }
    return result;
  }));
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
  if (checks.some(check => !check.pass)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
