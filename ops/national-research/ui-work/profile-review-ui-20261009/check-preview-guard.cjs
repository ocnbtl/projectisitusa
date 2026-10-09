const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('C:/Code/project-isitusa/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync('middleware.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
for (const environment of ['production', 'development', undefined, 'preview']) {
  const context = { exports: {}, process: { env: { VERCEL_ENV: environment } }, Response };
  vm.runInNewContext(code, context);
  assert.equal(JSON.stringify(context.exports.config.matcher), JSON.stringify(['/admin/preview/:path*']));
  const response = context.exports.middleware();
  if (environment === 'preview') assert.equal(response, undefined);
  else {
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
}
console.log('Preview-only route guard passed in four environments.');
