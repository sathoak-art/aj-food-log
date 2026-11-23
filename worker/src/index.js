// Cloudflare Worker for AJ Food Log AI drafts. Holds the Anthropic API key; the app never sees it.
// Endpoints (POST, JSON, header x-app-passcode): /ping, /estimate, /label
import Anthropic from '@anthropic-ai/sdk';
import { RULES, LABEL_RULES, ESTIMATE_SCHEMA, LABEL_SCHEMA, contextText } from './prompts.js';

const PHOTO_MODEL = 'claude-sonnet-5-5'; // photos and labels
const TEXT_MODEL = 'claude-haiku-5-5';   // text-only drafts
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_BODY = 8_000_000;
const MAX_IMAGES = 3;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);
    if (!env.APP_PASSCODE || !safeEqual(req.headers.get('x-app-passcode') || '', env.APP_PASSCODE)) return json({ error: 'Wrong passcode. Check Settings → AI.' }, 401);
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'Photo too large.' }, 413);

    const path = new URL(req.url).pathname;
    if (path === '/ping') return json({ ok: true, photo_model: PHOTO_MODEL, text_model: TEXT_MODEL, daily_limit: dailyLimit(env), used_today: await usedToday(env) });
    if (path !== '/estimate' && path !== '/label') return json({ error: 'Not found.' }, 404);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Bad request body.' }, 400); }
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'The Worker has no ANTHROPIC_API_KEY secret.' }, 500);

    const allowed = await countRequest(env);
    if (!allowed) return json({ error: `Daily AI limit (${dailyLimit(env)}) reached. Log manually or raise DAILY_LIMIT.` }, 429);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      return json(path === '/estimate' ? await estimate(client, body) : await readLabel(client, body));
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, 400);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'The AI service is busy. Try again in a minute.' }, 429);
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The Anthropic API key was rejected. Check the Worker secret.' }, 502);
      // APIConnectionError is a subclass of APIError in the TypeScript SDK, so check it first.
      if (e instanceof Anthropic.APIConnectionError) return json({ error: 'Could not reach the AI service. Try again.' }, 502);
      if (e instanceof Anthropic.APIError) return json({ error: `AI service error (${e.status}). ${shortMsg(e)}` }, 502);
      return json({ error: 'Worker error: ' + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
};

class UserError extends Error {}

function images(list) {
  if (!Array.isArray(list)) return [];
  if (list.length > MAX_IMAGES) throw new UserError(`At most ${MAX_IMAGES} photos per entry.`);
  return list.map(im => {
    const media_type = IMAGE_TYPES.includes(im && im.media_type) ? im.media_type : 'image/jpeg';
    const data = String((im && im.data) || '').replace(/^data:[^,]*,/, '');
    if (!data) throw new UserError('Empty photo.');
    return { type: 'image', source: { type: 'base64', media_type, data } };
  });
}

async function estimate(client, body) {
  const imgs = images(body.images);
  const text = String(body.text || '').slice(0, 2000).trim();
  if (!imgs.length && !text) throw new UserError('Add a photo or describe the food.');
  const mode = body.mode === 'plan' ? 'plan' : 'log';
  const prompt = `Mode: ${mode}.\n${imgs.length ? `${imgs.length} photo(s) attached.` : 'No photo.'}\nUser's note: ${text || '(none)'}\n\nReturn the draft.`;
  const system = [
    { type: 'text', text: RULES },
    { type: 'text', text: contextText(body.context), cache_control: { type: 'ephemeral' } },
  ];
  const params = {
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: [...imgs, { type: 'text', text: prompt }] }],
    output_config: { effort: imgs.length ? 'medium' : 'low', format: { type: 'json_schema', schema: ESTIMATE_SCHEMA } },
  };
  const res = imgs.length
    ? await client.beta.messages.create({ ...params, model: PHOTO_MODEL, betas: [FALLBACK_BETA], fallbacks: 'default' })
    : await client.messages.create({ ...params, model: TEXT_MODEL });
  return { draft: readJson(res), model: res.model, usage: res.usage };
}

async function readLabel(client, body) {
  const imgs = images(body.images);
  if (!imgs.length) throw new UserError('Add a photo of the label.');
  const res = await client.beta.messages.create({
    model: PHOTO_MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: LABEL_RULES,
    messages: [{ role: 'user', content: [...imgs, { type: 'text', text: 'Read this nutrition facts panel.' }] }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LABEL_SCHEMA } },
  });
  return { label: readJson(res), model: res.model, usage: res.usage };
}

function readJson(res) {
  if (res.stop_reason === 'refusal') throw new UserError('The AI declined this request. Log it manually.');
  if (res.stop_reason === 'max_tokens') throw new UserError('The AI answer was cut off. Try again with a simpler photo or note.');
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(text); } catch { throw new UserError('The AI answer could not be read. Try again.'); }
}

// ---------- access control ----------
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-passcode',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
const dailyLimit = env => Number(env.DAILY_LIMIT || 40);
const dayKey = () => 'n:' + new Date().toISOString().slice(0, 10);
async function usedToday(env) { return env.USAGE ? Number((await env.USAGE.get(dayKey())) || 0) : null; }
// KV is eventually consistent, so the cap is approximate. Good enough for two phones.
async function countRequest(env) {
  if (!env.USAGE) return true;
  const n = await usedToday(env);
  if (n >= dailyLimit(env)) return false;
  await env.USAGE.put(dayKey(), String(n + 1), { expirationTtl: 3 * 86400 });
  return true;
}
function shortMsg(e) { const m = e && e.message ? String(e.message) : ''; return m.length > 200 ? m.slice(0, 200) + '…' : m; }
