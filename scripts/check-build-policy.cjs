const fs = require('node:fs');
const assert = require('node:assert/strict');
function validate(pkg, lock) {
  assert.equal(pkg.engines.node, '24.x', 'Node major must be explicit');
  assert.equal(pkg.packageManager, 'npm@11.16.0', 'Review npm changes before release');
  assert.equal(pkg.engines.npm, '11.16.0');
  const policy = pkg.allowScripts ?? {};
  const used = new Set();
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!entry.hasInstallScript) continue;
    const name = location.split('node_modules/').pop();
    const key = `${name}@${entry.version}`;
    assert.equal(policy[key], false, `Unreviewed installation script: ${key}`);
    used.add(key);
  }
  assert.deepEqual(Object.keys(policy).sort(), [...used].sort(), 'No broad or stale script decisions');
}
module.exports = { validate };
if (require.main === module) {
  validate(JSON.parse(fs.readFileSync('package.json')), JSON.parse(fs.readFileSync('package-lock.json')));
  console.log('Build policy passed: every dependency installation script is explicitly denied at its reviewed version.');
}
