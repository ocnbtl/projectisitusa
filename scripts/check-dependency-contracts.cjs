const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { parse: sync } = require('csv-parse/sync');
const { parse: stream } = require('csv-parse');
(async () => {
  // These options underpin research row provenance: quoted newlines, raw bytes,
  // parser line counters, empty lines, BOM, and sync/stream parity.
  const csv = '\uFEFFid,note\r\n1,"a\r\nb"\r\n\r\n2,café';
  const options = { bom: true, columns: true, skip_empty_lines: true, raw: true, info: true };
  const rows = sync(csv, options);
  assert.deepEqual(rows.map(r => ({...r.record})), [{ id: '1', note: 'a\r\nb' }, { id: '2', note: 'café' }]);
  assert.deepEqual(rows.map(r => r.info.lines), [4, 6]);
  const streamed = [];
  for await (const row of Readable.from([csv]).pipe(stream(options))) streamed.push(row);
  assert.deepEqual(streamed.map(r => [r.record, r.raw, r.info.lines]), rows.map(r => [r.record, r.raw, r.info.lines]));
  assert.equal(rows[0].raw, '1,"a\r\nb"\r');
  const dangerous = sync('__proto__,safe\nvalue,ok', { columns: true })[0];
  assert.equal(Object.getPrototypeOf(dangerous), Object.prototype);
  assert.equal(dangerous.safe, 'ok');
  assert.equal(Object.prototype.value, undefined);
  const result = await require('postcss')([]).process('a { color: red }', { from: undefined });
  assert.equal(result.css, 'a { color: red }');
  console.log('Dependency contracts passed: CSV provenance, streaming, prototype safety, and CSS processing.');
})().catch(error => { console.error(error); process.exitCode = 1; });
