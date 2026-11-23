// Worker tests with a fake Anthropic API (no key or network needed). Run: node test.mjs
import worker from './src/index.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? ' -> ' + extra : ''}`); };

class FakeKV { constructor() { this.m = new Map(); } async get(k) { return this.m.get(k) ?? null; } async put(k, v) { this.m.set(k, v); } }
const env = (over) => Object.assign({ APP_PASSCODE: 'pw', ANTHROPIC_API_KEY: 'sk-test', ALLOWED_ORIGINS: 'https://sathoak-art.github.io', DAILY_LIMIT: '3', USAGE: new FakeKV() }, over);
const req = (path, body, headers) => new Request('https://w.example' + path, {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'x-app-passcode': 'pw', Origin: 'https://sathoak-art.github.io' }, headers), body: JSON.stringify(body ?? {}),
});

// Fake Messages API: record the request, answer with a canned JSON draft.
let lastCall = null, nextReply = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith('https://api.anthropic.com')) return realFetch(url, init);
  lastCall = { url: u, headers: Object.fromEntries(new Headers(init.headers)), body: JSON.parse(init.body) };
  const r = nextReply || { stop_reason: 'end_turn', text: JSON.stringify({ label: 'Test', source: 'estimate', confidence: 'Uncertain', range_pct: 30, items: [], assumptions: [], questions: [], not_logged: [] }) };
  if (r.status) return new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }), { status: r.status, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: lastCall.body.model, content: [{ type: 'text', text: r.text }],
    stop_reason: r.stop_reason, usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const call = async (r, e) => { const res = await worker.fetch(r, e); return { status: res.status, headers: res.headers, body: res.status === 204 ? null : await res.json() }; };
const IMG = { media_type: 'image/jpeg', data: 'data:image/jpeg;base64,/9j/AAAA' };

// CORS preflight
let r = await call(new Request('https://w.example/estimate', { method: 'OPTIONS', headers: { Origin: 'https://sathoak-art.github.io' } }), env());
ok('preflight 204 with origin echoed', r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://sathoak-art.github.io');
r = await call(new Request('https://w.example/estimate', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env());
ok('unknown origin not echoed', r.headers.get('access-control-allow-origin') !== 'https://evil.example');

// Passcode
r = await call(req('/ping', {}, { 'x-app-passcode': 'nope' }), env());
ok('wrong passcode is 401', r.status === 401);
r = await call(req('/ping'), env({ APP_PASSCODE: '' }));
ok('no passcode configured is 401', r.status === 401);
r = await call(req('/ping'), env());
ok('ping ok', r.status === 200 && r.body.ok && r.body.used_today === 0, JSON.stringify(r.body));

// Text-only draft goes to Haiku, no fallback beta, low effort, schema set, context cached
let e = env();
lastCall = null;
r = await call(req('/estimate', { text: 'half a beef donair', mode: 'log', context: { saved_foods: ['rice | Cooked white rice | | per 100g | cooked | 130 | 2.8 | 0.3 | 28 | 0.4 | 1'] } }), e);
ok('text draft 200', r.status === 200 && r.body.draft && r.body.draft.label === 'Test', JSON.stringify(r.body));
ok('text uses Haiku 5.5', lastCall && lastCall.body.model === 'claude-haiku-5-5', lastCall && lastCall.body.model);
ok('text has no fallbacks', lastCall && lastCall.body.fallbacks === undefined);
ok('text effort low + json_schema', lastCall.body.output_config.effort === 'low' && lastCall.body.output_config.format.type === 'json_schema');
ok('context block cached and includes saved food', lastCall.body.system[1].cache_control.type === 'ephemeral' && lastCall.body.system[1].text.includes('Cooked white rice'));

// Photo draft goes to Sonnet with fallback beta
r = await call(req('/estimate', { images: [IMG], text: '', mode: 'plan' }), e);
ok('photo draft 200', r.status === 200, JSON.stringify(r.body));
ok('photo uses Sonnet 5.5', lastCall.body.model === 'claude-sonnet-5-5');
ok('photo sends fallbacks default + beta header', lastCall.body.fallbacks === 'default' && String(lastCall.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'), JSON.stringify(lastCall.headers));
ok('photo strips data: prefix', lastCall.body.messages[0].content[0].source.data === '/9j/AAAA');
ok('photo effort medium', lastCall.body.output_config.effort === 'medium');
ok('mode plan reaches the prompt', lastCall.body.messages[0].content.at(-1).text.includes('Mode: plan'));

// Daily limit (3): two used above, one more allowed, then 429
r = await call(req('/estimate', { text: 'apple' }), e);
ok('third request allowed', r.status === 200);
r = await call(req('/estimate', { text: 'apple' }), e);
ok('fourth request hits daily limit 429', r.status === 429, JSON.stringify(r.body));

// Validation and failures
r = await call(req('/estimate', { text: '' }), env());
ok('empty request is 400', r.status === 400);
r = await call(req('/estimate', { images: [IMG, IMG, IMG, IMG] }), env());
ok('more than 3 photos is 400', r.status === 400);
nextReply = { stop_reason: 'refusal', text: '' };
r = await call(req('/estimate', { text: 'x' }), env());
ok('refusal becomes a readable error', r.status === 400 && /declined/.test(r.body.error));
nextReply = { stop_reason: 'end_turn', text: 'not json' };
r = await call(req('/estimate', { text: 'x' }), env());
ok('bad JSON becomes a readable error', r.status === 400 && /could not be read/.test(r.body.error));
nextReply = { status: 401 };
r = await call(req('/estimate', { text: 'x' }), env());
ok('rejected API key maps to 502 with clear message', r.status === 502 && /API key was rejected/.test(r.body.error), JSON.stringify(r.body));
nextReply = null;
r = await call(req('/estimate', { text: 'x' }), env({ ANTHROPIC_API_KEY: '' }));
ok('missing API key secret is reported', r.status === 500 && /ANTHROPIC_API_KEY/.test(r.body.error));

// Label reader
nextReply = { stop_reason: 'end_turn', text: JSON.stringify({ product_name: 'Oats', brand: 'X', serving_g: 40, serving_label: '1/2 cup', kcal: 150, protein: 5, fat: 3, carbs: 27, fiber: 4, sodium_mg: 0, unreadable: [], notes: '' }) };
r = await call(req('/label', { images: [IMG] }), env());
ok('label read 200 on Sonnet', r.status === 200 && r.body.label.serving_g === 40 && lastCall.body.model === 'claude-sonnet-5-5', JSON.stringify(r.body));
r = await call(req('/label', {}), env());
ok('label without photo is 400', r.status === 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
