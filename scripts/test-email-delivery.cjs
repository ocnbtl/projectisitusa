// Network-free behavior checks for the actual Edge Function source.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/participation-delivery/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
async function run({ authorization = 'Bearer test-job-secret', item, failure, suppression } = {}) {
  let handler, sends = 0, claims = 0;
  const updates = [];
  const db = {
    rpc: async () => { claims++; return { data: item ? [item] : [] }; },
    from: table => ({
      update: values => {
        const update = { table, values, filters: [] };
        updates.push(update);
        const query = { eq: (key, value) => { update.filters.push([key, value]); return query; }, then: resolve => resolve({ data: null }) };
        return query;
      },
      select: () => ({ eq: () => ({ single: async () => ({ data: { suppression_reason: suppression } }) }) })
    })
  };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const runtime = {
    Deno: { serve: fn => { handler = fn; } }, Request, Response, console,
    STREAMS: [{ id: 'species-stories', title: 'Species stories' }],
    HttpError, responseError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
    env: name => name === 'DELIVERY_JOB_SECRET' ? 'test-job-secret' : 'fixture', enabled: () => true,
    checked: result => { if (result.error) throw Error('db failure'); return result.data; },
    requiredData: result => result.data, service: () => db,
    Resend: class { emails = { send: async (message, options) => {
      sends++; assert.equal(options.idempotencyKey, item.id);
      assert.equal(message.to, 'fixture@example.invalid');
      if (failure === 'network') throw Error('network failure');
      return failure === 'provider' ? { error: { message: 'rejected' } } : { data: { id: 'fixture-message' } };
    } }; }
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, runtime);
  const result = await handler(new Request('https://fixture.invalid', { method: 'POST', headers: authorization ? { Authorization: authorization } : {} }));
  return { status: result.status, payload: await result.json(), sends, claims, updates };
}
const item = attempts => ({ id: 'fixture-outbox', attempts, kind: 'confirmation', subscriber_id: 'fixture-subscriber', recipient: 'fixture@example.invalid', payload: { preferences: { streams: ['species-stories'] }, url: 'https://fixture.invalid/preferences' } });
(async () => {
  for (const authorization of ['', 'Bearer wrong']) { const r = await run({ authorization }); assert.equal(r.status, 401); assert.equal(r.claims, 0); }
  const empty = await run(); assert.equal(empty.payload.processed, 0); assert.equal(empty.sends, 0);
  for (const failure of ['network', 'provider']) {
    for (const attempt of [1, 3]) {
      const r = await run({ item: item(attempt), failure });
      assert.ok(r.status >= 500);
      assert.ok(r.updates.some(x => x.values.state === (attempt === 3 ? 'failed' : 'queued') && x.values.lease_until === null));
    }
  }
  const suppressed = await run({ item: item(1), suppression: 'complaint' }); assert.equal(suppressed.sends, 0); assert.equal(suppressed.updates[0].values.state, 'suppressed');
  const sent = await run({ item: item(1) }); assert.equal(sent.status, 200); assert.equal(sent.sends, 1); assert.equal(sent.updates[0].values.state, 'sent'); assert.equal(Object.keys(sent.updates[0].values.payload).length, 0);
  console.log('Email worker: 9 behavior cases passed; no real messages sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
