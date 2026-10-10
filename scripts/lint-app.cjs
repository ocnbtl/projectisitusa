const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.cwd();
const dependencyRoot = path.resolve(process.argv[2] || root);
const load = createRequire(path.join(dependencyRoot, 'package.json'));
(async () => {
  const ESLint = await load('eslint').loadESLint({ useFlatConfig: false });
  const lint = new ESLint({ cwd: root, useEslintrc: false, overrideConfigFile: path.join(dependencyRoot, '.eslintrc.json'), resolvePluginsRelativeTo: dependencyRoot, extensions: ['.js', '.jsx', '.ts', '.tsx'], reportUnusedDisableDirectives: 'error' });
  const targets = ['app', 'pages', 'components', 'src'].filter(dir => fs.existsSync(path.join(root, dir)));
  if (!targets.length) throw new Error('No application directories found for linting');
  const results = await lint.lintFiles(targets);
  const output = (await lint.loadFormatter('stylish')).format(results);
  if (output) console.log(output);
  const problems = results.reduce((sum, result) => sum + result.errorCount + result.warningCount, 0);
  if (problems) process.exitCode = 1;
  else console.log(`Application lint passed: ${results.length} files, zero warnings or errors.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
