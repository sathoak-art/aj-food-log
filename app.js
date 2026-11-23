/* app.js — AJ Food Log, phase 1 (manual MVP, no AI). Local-first in IndexedDB. */
(() => {
'use strict';
const C = window.Calc, SEED = window.Seed;
const PROFILE_ID = 'aj';
const STORES = ['profile', 'targets', 'foods', 'meals', 'days', 'entries', 'metrics', 'weeks', 'settings'];
const SINGLE = { profile: 1, settings: 1 };
const S = { profile: null, targets: [], foods: [], meals: [], days: [], entries: [], metrics: [], weeks: [], settings: null };
const UI = { tab: 'today', viewDayId: null, weekStart: null, stack: [], foodsQ: '', foodsCat: 'all', showRemoved: false };

const STATES = ['raw', 'cooked', 'frozen', 'as_sold'];
const STATE_L = { raw: 'Raw', cooked: 'Cooked', frozen: 'Frozen', as_sold: 'As sold' };
const SOURCES = ['label', 'weighed', 'restaurant', 'estimate'];
const SOURCE_L = { label: 'Label', weighed: 'Weighed', restaurant: 'Restaurant', estimate: 'Estimate' };
const SOURCE_CONF = { label: 'Certain', weighed: 'Likely', restaurant: 'Uncertain', estimate: 'Uncertain' };
const CONFS = ['Certain', 'Likely', 'Uncertain'];
const SESSIONS = ['A', 'B', 'C', 'D', 'home', 'muay thai', 'pickleball', 'other'];
const CATS = [['all', 'All'], ['label', 'Labels'], ['batch', 'Batches'], ['staple', 'Staples'], ['addon', 'Soak-in'], ['archived', 'Archived']];

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmt = (n, d = 0) => (n == null || n === '' || isNaN(n) ? '–' : Number(n).toLocaleString('en-CA', { maximumFractionDigits: d }));
const signed = n => (n == null ? '–' : (Math.round(n) < 0 ? '−' : Math.round(n) > 0 ? '+' : '') + fmt(Math.abs(n)));
const fmtW = n => (n == null || n === '' || isNaN(n) ? '–' : Number(n).toFixed(1));
const fmtK = n => (n == null || isNaN(n) ? '–' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)));
const hm = min => (min == null || min === '' ? '–' : `${Math.floor(min / 60)}h ${pad(Math.round(min % 60))}m`);
const numOrNull = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const fmtNum = n => (n == null ? '' : String(Math.round(n * 100) / 100));
const dayLabel = iso => `${C.dowShort(iso)} ${C.ddmm(iso)}`;
const clone = o => JSON.parse(JSON.stringify(o));
const nline = n => `${fmt(n.kcal)} cal · ${fmt(n.protein, 1)}P · ${fmt(n.fat, 1)}F · ${fmt(n.carbs, 1)}C · ${fmt(n.fiber, 1)} fib · ${fmt(n.sodium_mg)} mg Na`;
const confBadge = c => (c ? `<span class="badge b-${String(c).toLowerCase()}">${esc(c)}</span>` : '');
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, bad ? 5000 : 3200);
}

// ---------- storage ----------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('aj-food-log', 1);
      r.onupgradeneeded = () => STORES.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = DB.db.transaction(store, mode); const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  all: s => DB.tx(s, 'readonly', st => st.getAll()),
  put: (s, o) => DB.tx(s, 'readwrite', st => st.put(o)),
  del: (s, id) => DB.tx(s, 'readwrite', st => st.delete(id)),
  clear: s => DB.tx(s, 'readwrite', st => st.clear()),
};
function save(store, obj) {
  obj.profile_id = obj.profile_id || PROFILE_ID;
  obj.updated_at = new Date().toISOString();
  if (SINGLE[store]) S[store] = obj;
  else { const a = S[store]; const i = a.findIndex(x => x.id === obj.id); if (i >= 0) a[i] = obj; else a.push(obj); }
  return DB.put(store, obj).catch(err => toast('Save failed: ' + err.message, true));
}
function remove(store, id) { S[store] = S[store].filter(x => x.id !== id); return DB.del(store, id); }

// ---------- lookups ----------
const foodById = id => S.foods.find(f => f.id === id);
const foodsMap = () => Object.fromEntries(S.foods.map(f => [f.id, f]));
const dayById = id => S.days.find(d => d.id === id);
const dayEntries = id => S.entries.filter(e => e.day_id === id).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
const metricsFor = id => S.metrics.find(m => m.day_id === id) || null;
function targetsFor(iso) {
  const sorted = S.targets.slice().sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  return sorted.filter(t => t.effective_from <= iso).pop() || sorted[0];
}
const openDay = () => S.days.filter(d => d.status === 'open').sort((a, b) => b.date.localeCompare(a.date))[0] || null;
const lastDay = () => S.days.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''))[0] || null;
function dayOn(date) { return S.days.filter(d => d.date === date).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null; }
function currentDay() {
  if (UI.viewDayId) { const d = dayById(UI.viewDayId); if (d) return d; UI.viewDayId = null; }
  return openDay();
}
async function ensureOpenDay() {
  let d = currentDay();
  if (d) return d;
  d = { id: uid('d'), date: C.isoLocal(), status: 'open', woke_at: '', created_at: new Date().toISOString() };
  await save('days', d);
  return d;
}
function weightReadings() {
  return S.metrics.filter(m => numOrNull(m.weight_lb) != null).map(m => { const d = dayById(m.day_id); return d ? { date: d.date, w: Number(m.weight_lb), day_id: d.id } : null; })
    .filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}
function lastWeightBefore(day) {
  const r = weightReadings().filter(x => x.day_id !== day.id && x.date <= day.date);
  return r.length ? r[r.length - 1] : null;
}
function daySummary(day) {
  const entries = dayEntries(day.id), m = metricsFor(day.id) || { training: [] };
  const intake = C.intakeForDay(entries), burn = C.burnForDay(m, S.settings), bal = C.balance(intake, burn);
  return { day, entries, m, intake, burn, bal, t: targetsFor(day.date) };
}
function runningText(day) {
  const T = C.intakeForDay(dayEntries(day.id)).totals;
  return `Day: ${fmt(T.kcal)} cal · ${fmt(T.protein)}g P · ${fmt(T.fat)}g F · ${fmt(T.sodium_mg)} mg Na`;
}
function basisText(f) {
  if (f.basis === 'per_100g') return 'per 100g';
  if (f.basis === 'per_piece') return `per ${f.serving_label || 'piece'}`;
  return `per ${fmt(f.serving_g, 1)}g${f.serving_label ? ` (${f.serving_label})` : ''}`;
}

// ---------- root render ----------
const TABS = [['today', 'Today'], ['week', 'Week'], ['charts', 'Charts'], ['foods', 'Foods'], ['meals', 'Meals'], ['settings', 'Settings']];
function render() {
  const views = { today: viewToday, week: viewWeek, charts: viewCharts, foods: viewFoods, meals: viewMeals, settings: viewSettings };
  $('#view').innerHTML = views[UI.tab]();
  $('#nav').innerHTML = TABS.map(([k, l]) => `<button data-act="tab" data-v="${k}" class="${UI.tab === k ? 'on' : ''}">${l}</button>`).join('');
  document.title = S.settings.app_name || 'AJ Food Log';
}

// ---------- Today ----------
function staleBanner() {
  const d = openDay(); if (!d) return '';
  const today = C.isoLocal(), hr = new Date().getHours();
  if (d.date < C.addDays(today, -1) || (d.date < today && hr >= 12)) {
    return `<div class="card banner"><b>${dayLabel(d.date)} is still open.</b> <span class="muted">A day only closes on "end of day".</span>
      <div class="row" style="margin-top:8px"><button class="small primary" data-act="closeDay" data-id="${d.id}">Review and end it</button><button class="small" data-act="gotoDay" data-id="${d.id}">Keep logging to it</button></div></div>`;
  }
  return '';
}
function quickBar(day) {
  const where = day && day.status === 'closed' ? `<div class="tiny muted" style="margin-top:4px">Adds to the closed day ${dayLabel(day.date)}.</div>` : '';
  return `<div class="quick"><form data-form="quick" class="row"><input id="quickIn" class="grow" placeholder="B1, B1 but 160g rice, plan Y1, or a food" autocomplete="off" enterkeyhint="go"><button class="primary">Add</button></form>
    <div class="row wrap" style="margin-top:6px"><button class="small" data-act="newEntry">+ Food entry</button><button class="small" data-act="newCustom">+ Restaurant / custom</button><button class="small" data-act="mealsSheet">Saved meals</button></div>${where}</div>`;
}
function viewToday() {
  const day = currentDay();
  if (!day) {
    const last = lastDay();
    return `${staleBanner()}<div class="card center"><h2>No day open</h2><p class="muted">Start with weight and sleep, or just log food. The day runs until you end it.</p>
      <button class="primary big" data-act="startDay">Start day</button>
      ${last ? `<p class="small"><button class="link" data-act="gotoDay" data-id="${last.id}">Last day: ${dayLabel(last.date)} (${last.status})</button></p>` : ''}</div>${quickBar(null)}`;
  }
  const sum = daySummary(day), s = S.settings;
  const isOpen = day.status === 'open', isCurrent = !UI.viewDayId || (openDay() && openDay().id === day.id);
  const badge = isOpen ? '<span class="badge b-open">open</span>' : sum.bal ? '<span class="badge b-closed">closed</span>'
    : day.imported ? '<span class="badge b-closed">imported</span>' : '<span class="badge b-pending">closed, balance pending</span>';
  const wk = C.cutWeek(day.date, s.cut_start);
  const back = !isCurrent ? `<button class="link small" data-act="gotoCurrent">← Back to ${openDay() ? 'the open day' : 'today'}</button>` : '';
  const entries = sum.entries.filter(e => e.status !== 'removed');
  const removed = sum.entries.filter(e => e.status === 'removed');
  return `${staleBanner()}
  <div class="dayhead"><div><h1>${dayLabel(day.date)} ${badge}</h1><div class="small muted">Cut week ${wk > 0 ? wk : '–'}${day.woke_at ? ` · woke ${day.woke_at}` : ''} ${back}</div></div>
    <button class="small" data-act="editDay" data-id="${day.id}">Day ▾</button></div>
  ${metricsStrip(sum)}
  <div class="card bars">${bars(sum)}</div>
  ${balanceCard(sum)}
  ${quickBar(day)}
  <div class="card"><div class="row spread"><h2>Entries</h2><span class="small muted">${sum.intake.loggedCount} logged${sum.intake.plannedCount ? ` · ${sum.intake.plannedCount} planned` : ''}</span></div>
    ${entries.length ? `<ul class="entries">${entries.map(entryRow).join('')}</ul>` : '<p class="muted small">Nothing yet. Type a saved-meal code like B1 above.</p>'}
    ${removed.length ? `<button class="link small" data-act="toggleRemoved">${UI.showRemoved ? 'Hide' : 'Show'} removed (${removed.length})</button>${UI.showRemoved ? `<ul class="entries">${removed.map(entryRow).join('')}</ul>` : ''}` : ''}
  </div>
  <div class="row" style="justify-content:center;margin:16px 0">
    ${isOpen ? `<button class="primary big" data-act="closeDay" data-id="${day.id}">End of day</button>`
      : `<button class="big" data-act="closeDay" data-id="${day.id}">Day summary</button>${!openDay() ? '<button class="primary big" data-act="startDay">Start new day</button>' : ''}`}
  </div>`;
}
function metricsStrip(sum) {
  const m = sum.m, b = sum.burn;
  const last = lastWeightBefore(sum.day);
  const w = numOrNull(m.weight_lb);
  const wSub = w != null && last ? `${w - last.w >= 0 ? '+' : '−'}${Math.abs(w - last.w).toFixed(1)} vs ${C.ddmm(last.date)}` : w != null ? 'first reading' : 'tap to add';
  const tread = C.num(m.treadmill_min) ? `incl. ${fmtK(C.treadmillSteps(m.treadmill_min, S.settings.treadmill_steps_per_min))} treadmill` : 'watch';
  const burnSub = b.baseSource === 'estimate' ? 'estimate' : b.baseSource === 'watch+projection' ? 'watch + to midnight' : b.baseSource === 'watch' ? 'watch' : 'pending';
  const cell = (k, v, sub) => `<button class="metric" data-act="openMetrics"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></button>`;
  return `<div class="metrics" style="margin-top:10px">
    ${cell('Weight', w != null ? fmtW(w) : '–', wSub)}
    ${cell('Sleep', m.sleep_watch_min != null && m.sleep_watch_min !== '' ? hm(m.sleep_watch_min) : '–', m.sleep_clock_note ? 'watch · clock note' : 'watch')}
    ${cell('Steps', b.steps ? fmtK(b.steps) : '–', b.steps ? tread : 'tap to add')}
    ${cell('Burn', b.total != null ? fmt(b.total) : '–', burnSub)}
  </div>`;
}
function bar(name, v, planned, o) {
  let ref, cls = '', st = '', marks = [], tgt = '';
  const u = o.unit || '';
  if (o.kind === 'band') {
    ref = o.high; marks = [o.low, o.high]; tgt = `${fmt(o.low)}–${fmt(o.high)}`;
    if (v > o.high) { cls = 'over'; st = `over by ${fmt(v - o.high)}`; } else if (v >= o.low) { cls = 'good'; st = 'in band'; } else st = `${fmt(o.low - v)}–${fmt(o.high - v)} left`;
  } else if (o.kind === 'floor') {
    ref = o.ceil; marks = [o.floor, o.ceil]; tgt = `${fmt(o.floor)}+${u}`;
    if (v > o.ceil) { cls = 'warn'; st = 'past soft ceiling'; } else if (v >= o.floor) { cls = 'good'; st = 'floor hit'; } else st = `${fmt(o.floor - v)}${u} to floor`;
  } else if (o.kind === 'cap') {
    ref = o.cap; marks = [o.cap]; tgt = `≤${fmt(o.cap)}${u}`;
    if (v > o.cap) { cls = 'over'; st = `over by ${fmt(v - o.cap)}${u}`; } else st = `${fmt(o.cap - v)}${u} left`;
  } else if (o.kind === 'target') {
    ref = o.target; marks = [o.target]; tgt = `~${fmt(o.target)}${u}`;
    if (v > o.target * 1.15) { cls = 'warn'; st = 'above target'; } else st = v >= o.target ? 'at target' : `${fmt(o.target - v)}${u} to go`;
  } else {
    ref = o.target; marks = [o.target]; tgt = `${fmt(o.target)}${u}`;
    if (v >= o.target) { cls = 'good'; st = 'hit'; } else st = `${fmt(o.target - v)}${u} to go`;
  }
  const max = Math.max(ref * 1.15, v + planned, 1), pct = x => Math.min(100, Math.max(0, x / max * 100));
  return `<div class="bar ${cls}"><div class="lbl"><span><b>${name}</b> ${fmt(v)}${u} <span class="muted">/ ${tgt}</span></span><span class="st">${st}</span></div>
    <div class="track"><div class="fill" style="width:${pct(v)}%"></div>${planned > 0 ? `<div class="plan" style="left:${pct(v)}%;width:${pct(v + planned) - pct(v)}%"></div>` : ''}
    ${marks.map(m => `<div class="mark" style="left:calc(${pct(m)}% - 1px)"></div>`).join('')}</div></div>`;
}
function bars(sum) {
  const T = sum.intake.totals, P = sum.intake.plannedTotals, t = sum.t;
  return [
    bar('Calories', T.kcal, P.kcal, { kind: 'band', low: t.kcal_band_low, high: t.kcal_band_high }),
    bar('Protein', T.protein, P.protein, { kind: 'floor', floor: t.protein_floor_g, ceil: t.protein_soft_ceiling_g, unit: 'g' }),
    bar('Fat', T.fat, P.fat, { kind: 'cap', cap: t.fat_cap_g, unit: 'g' }),
    bar('Carbs', T.carbs, P.carbs, { kind: 'target', target: t.carbs_g, unit: 'g' }),
    bar('Fiber', T.fiber, P.fiber, { kind: 'reach', target: t.fiber_g, unit: 'g' }),
    bar('Sodium', T.sodium_mg, P.sodium_mg, { kind: 'cap', cap: t.sodium_cap_mg, unit: ' mg' }),
    bar('Produce', sum.intake.produce_g, 0, { kind: 'reach', target: t.produce_g, unit: 'g' }),
  ].join('');
}
function burnLines(b) {
  if (b.total == null) return '';
  const src = b.baseSource === 'estimate' ? `${fmt(b.base)} from ${fmtK(b.steps)} steps (estimate)` :
    b.baseSource === 'watch+projection' ? `watch ${fmt(b.watch)} + ${fmt(b.projected)} to midnight` : `watch total ${fmt(b.base)}`;
  const tr = b.training.map(t => `<div>${esc(t.label)}: ${fmt(t.kcal)} cal · ${t.counted ? 'added on top' : 'already in the watch total'}</div>`).join('');
  return `<div class="small muted" style="margin-top:6px"><div>Burn ${fmt(b.total)} = ${src}${b.trainingAdded ? ` + ${fmt(b.trainingAdded)} training` : ''}</div>${tr}</div>`;
}
function balanceCard(sum) {
  const { bal, intake, burn } = sum;
  const planned = intake.plannedCount ? `<div class="small" style="color:var(--plan);margin-top:6px">Planned, not counted: ${intake.plannedCount} entr${intake.plannedCount > 1 ? 'ies' : 'y'}, +${fmt(intake.plannedTotals.kcal)} cal. Would bring the day to ${fmt(intake.totals.kcal + intake.plannedTotals.kcal)}.</div>` : '';
  if (!bal) return `<div class="card"><div class="balance">Balance <b class="muted">pending</b></div><div class="small muted">Add steps or the watch total to get a balance.</div>${burnLines(burn)}${planned}</div>`;
  const range = Math.round(bal.low) !== Math.round(bal.high) ? ` <span class="muted small">(${signed(bal.low)} to ${signed(bal.high)})</span>` : '';
  return `<div class="card"><div class="balance">Balance <b>${signed(bal.value)}</b> cal${range}</div>${burnLines(burn)}${planned}</div>`;
}
function entryRow(e) {
  const t = C.sumNutrients(e.items || []);
  return `<li class="entry ${e.status}" data-act="editEntry" data-id="${e.id}">
    <div class="e-main"><span class="e-time">${esc(e.time || '')}</span><span class="e-label">${esc(e.label || 'Entry')}</span></div>
    <div class="e-k">${fmt(t.kcal)}</div>
    <div class="e-n">${fmt(t.protein)}P · ${fmt(t.fat)}F · ${fmt(t.carbs)}C · ${fmt(t.sodium_mg)} Na${e.range_pct ? ` · ±${e.range_pct}%` : ''} ${e.status === 'planned' ? '<span class="badge b-planned">planned</span>' : confBadge(e.confidence)}</div>
    <div>${e.status === 'planned' ? `<button class="small" data-act="ateIt" data-id="${e.id}">Ate it</button>` : e.status === 'removed' ? `<button class="small" data-act="restoreEntry" data-id="${e.id}">Restore</button>` : ''}</div>
  </li>`;
}

// ---------- sheets (stacked) ----------
const SHEETS = {};
function openSheet(kind) { UI.stack.push(kind); paintSheet(); }
function paintSheet() {
  const kind = UI.stack[UI.stack.length - 1];
  const el = $('#sheet');
  if (!kind) { el.classList.remove('open'); $('#sheetBody').innerHTML = ''; return; }
  const top = $('#sheetBody').scrollTop;
  $('#sheetBody').innerHTML = SHEETS[kind]();
  el.classList.add('open');
  $('#sheetBody').scrollTop = top;
}
function closeSheet() { UI.stack.pop(); paintSheet(); if (!UI.stack.length) render(); }
function closeAllSheets() { UI.stack = []; paintSheet(); render(); }
const sheetHead = title => `<header class="sheet-h"><h2>${title}</h2><button class="icon" data-act="closeSheet" aria-label="Close">✕</button></header>`;

// ----- entry editor -----
function newEntryDraft(day, extra) {
  return Object.assign({ id: uid('e'), day_id: day.id, time: nowHM(), status: 'logged', label: '', items: [], source: 'weighed',
    confidence: 'Likely', range_pct: S.settings.range_weighed, assumptions: [], _new: true }, extra || {});
}
function openEntry(draft) { UI.draft = draft; UI.draftForce = false; openSheet('entry'); }
function autoSource() {
  const d = UI.draft; if (d._srcTouched || !d.items.length) return;
  let src = 'weighed';
  if (d.items.some(i => i.custom)) src = 'restaurant';
  else if (d.items.every(i => { const f = foodById(i.food_id); return f && f.source === 'label' && f.confidence === 'Certain'; })) src = 'label';
  else if (d.items.some(i => { const f = foodById(i.food_id); return f && f.confidence === 'Uncertain'; })) src = 'estimate';
  setSource(src);
}
function setSource(src) {
  const d = UI.draft; d.source = src; d.confidence = SOURCE_CONF[src]; d.range_pct = S.settings['range_' + src];
}
function itemNote(it) {
  if (it.custom) {
    const p = it.portion == null ? 1 : it.portion;
    return `${p !== 1 ? `${fmt(p * 100)}% of the whole item → ` : ''}${nline(it)}`;
  }
  const f = foodById(it.food_id);
  let warn = '';
  if (f && it.state && f.state && it.state !== f.state && !(f.state === 'as_sold' || it.state === 'as_sold')) {
    warn = `<div class="st-warn">Food values are per ${STATE_L[f.state].toLowerCase()} weight; you marked this ${STATE_L[it.state].toLowerCase()}. Check you are not mixing raw and cooked.</div>`;
  }
  return `${nline(it)}${f ? ` <span class="tiny">(${basisText(f)}, ${esc(f.source)})</span>` : ' <span class="st-warn">food no longer saved; values are the snapshot</span>'}${warn}`;
}
function itemRow(it, i) {
  if (it.custom) {
    const fields = [['kcal', 'cal'], ['protein', 'P g'], ['fat', 'F g'], ['carbs', 'C g'], ['fiber', 'Fiber g'], ['sodium_mg', 'Na mg']];
    return `<div class="item"><div class="ih"><input data-it="name" data-i="${i}" value="${esc(it.name)}" placeholder="Item, e.g. Subway Italian B.M.T. 6&quot;"><button class="icon" data-act="rmItem" data-i="${i}" aria-label="Remove item">✕</button></div>
      <div class="tiny muted" style="margin-top:6px">Whole item, lean high:</div>
      <div class="grid6">${fields.map(([k, l]) => `<label>${l}<input inputmode="decimal" data-it="base_${k}" data-i="${i}" value="${fmtNum(it['base_' + k]) === '0' ? '' : fmtNum(it['base_' + k])}"></label>`).join('')}</div>
      <div class="ir"><label>Portion eaten<input data-it="portion_text" data-i="${i}" value="${esc(it.portion_text == null ? '1' : it.portion_text)}" placeholder="1, half, 1/4, 20%"></label>
        <label>Grams (if weighed)<input inputmode="decimal" data-it="grams_text" data-i="${i}" value="${esc(it.grams_text == null ? (it.grams || '') : it.grams_text)}"></label></div>
      <div class="in" id="itn-${i}">${itemNote(it)}</div></div>`;
  }
  return `<div class="item ${it.eggOil ? 'eggoil' : ''}"><div class="ih"><b>${esc(it.name)}${it.eggOil ? ' <span class="badge b-likely">egg oil</span>' : ''}</b><button class="icon" data-act="rmItem" data-i="${i}" aria-label="Remove item">✕</button></div>
    <div class="ir"><div class="unit"><input inputmode="decimal" data-it="grams_text" data-i="${i}" value="${esc(it.grams_text == null ? fmtNum(it.grams) : it.grams_text)}" aria-label="Amount"><span>${it.unit === 'pc' ? 'pc' : 'g'}</span></div>
      <select data-it="state" data-i="${i}" aria-label="Weighed as">${STATES.map(s => `<option value="${s}" ${it.state === s ? 'selected' : ''}>${STATE_L[s]}</option>`).join('')}</select></div>
    <div class="in" id="itn-${i}">${itemNote(it)}</div></div>`;
}
function dayAfterText() {
  const d = UI.draft;
  const others = dayEntries(d.day_id).filter(e => e.id !== d.id);
  const after = C.intakeForDay(d.status === 'logged' ? others.concat([d]) : others).totals.kcal;
  return d.status === 'logged' ? `Day after saving: ${fmt(after)} cal` : `Planned: the day stays at ${fmt(after)} cal until you mark it eaten`;
}
function draftTotalsHtml() {
  const d = UI.draft, t = C.sumNutrients(d.items), r = C.num(d.range_pct) / 100;
  return `${nline(t)}${r ? `<div class="small muted">Range ${fmt(t.kcal * (1 - r))}–${fmt(t.kcal * (1 + r))} cal (±${d.range_pct}%)</div>` : ''}<div class="small muted">${dayAfterText()}</div>`;
}
SHEETS.entry = () => {
  const d = UI.draft;
  const hasEgg = d.items.some(i => { const f = foodById(i.food_id); return f && f.egg; });
  const hasOil = d.items.some(i => i.eggOil);
  return `${sheetHead(d._new ? 'New entry' : 'Edit entry')}
  <div class="stack">
    <div class="seg">${['logged', 'planned'].map(s => `<button data-act="draftStatus" data-v="${s}" class="${d.status === s ? 'on' + (s === 'planned' ? ' plan' : '') : ''}">${s === 'logged' ? 'Ate it' : 'Planned (not counted)'}</button>`).join('')}</div>
    <div class="grid2"><label>Label<input data-dr="label" value="${esc(d.label)}" placeholder="e.g. Breakfast, B1"></label><label>Time<input type="time" data-dr="time" value="${esc(d.time)}"></label></div>
    <div class="grid3"><label>Source<select data-dr="source">${SOURCES.map(s => `<option value="${s}" ${d.source === s ? 'selected' : ''}>${SOURCE_L[s]}</option>`).join('')}</select></label>
      <label>Confidence<select data-dr="confidence">${CONFS.map(c => `<option ${d.confidence === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Range ±%<input inputmode="numeric" data-dr="range_pct" value="${esc(d.range_pct)}"></label></div>
    ${d.source === 'restaurant' ? '<div class="small st-warn">Restaurant: enter the high end of the middle cluster of sources, and keep the range at 25% or more.</div>' : ''}
    <div>${d.items.map(itemRow).join('')}</div>
    ${hasEgg ? `<label class="check"><input type="checkbox" data-chg="eggOil" ${hasOil ? 'checked' : ''}> Eggs cooked with about ${S.settings.egg_oil_g}g oil (untick if poached, boiled or microwaved dry)</label>` : ''}
    <div class="row"><input id="foodq" class="grow" data-on="foodSearch" data-mode="entry" placeholder="Add a food or meal code…" autocomplete="off"><button data-act="addCustom">Custom</button></div>
    <div id="foodres" class="results"></div>
    <label>Assumptions (one per line)<textarea data-dr="assumptions_text" placeholder="e.g. Portion not stated: used 1 serving">${esc(d.assumptions_text != null ? d.assumptions_text : (d.assumptions || []).join('\n'))}</textarea></label>
    <div id="drafttot" class="tot">${draftTotalsHtml()}</div>
    <div id="dupwarn"></div>
  </div>
  <footer class="sheet-f">${d._new ? '<button data-act="closeSheet">Cancel</button>' : '<button class="danger" data-act="removeEntry">Remove</button>'}<button class="primary" data-act="saveEntry">Save</button></footer>`;
};
function foodResults(q, mode) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const hay = f => (f.name + ' ' + (f.brand || '')).toLowerCase();
  const hits = S.foods.filter(f => !f.archived && words.every(w => hay(f).includes(w))).slice(0, 10);
  const mh = mode === 'entry' ? S.meals.filter(m => words.every(w => (m.code + ' ' + m.name).toLowerCase().includes(w))).slice(0, 4) : [];
  const out = mh.map(m => `<button data-act="pickMeal" data-id="${m.id}"><span class="code">${esc(m.code)}</span> ${esc(m.name)}<div class="d">Saved meal · adds all its items</div></button>`).join('') +
    hits.map(f => `<button data-act="pickFood" data-id="${f.id}">${esc(f.name)}${f.brand ? ` <span class="muted">${esc(f.brand)}</span>` : ''} ${confBadge(f.confidence)}<div class="d">${basisText(f)}: ${fmt(f.kcal)} cal · ${fmt(f.protein, 1)}P · ${fmt(f.fat, 1)}F · ${fmt(f.sodium_mg)} mg Na</div></button>`).join('');
  return out || `<div class="small muted">No match. <button class="link" data-act="newFoodFromSearch" data-q="${esc(q)}">Save "${esc(q)}" as a new food</button>${mode === 'entry' ? ' or use Custom.' : ''}</div>`;
}
function findWarnings(d) {
  const w = [];
  const sig = e => (e.items || []).map(i => (i.food_id || i.name) + ':' + Math.round(C.num(i.grams)) + ':' + Math.round(C.num(i.kcal))).sort().join('|');
  const mine = sig(d);
  const dup = dayEntries(d.day_id).find(x => x.id !== d.id && x.status !== 'removed' && sig(x) === mine);
  if (dup) w.push(`This matches "${esc(dup.label || 'an entry')}" at ${esc(dup.time)}. A repeated photo or message?`);
  const ids = d.items.filter(i => i.food_id && !i.eggOil).map(i => i.food_id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) w.push(`${esc(foodById(twice) ? foodById(twice).name : 'A food')} appears twice in this entry. Raw and cooked weights of the same food?`);
  const blank = d.items.find(i => i.custom && !C.num(i.base_kcal));
  if (blank) w.push('A custom item has no calories.');
  return w;
}
async function saveEntry() {
  const d = UI.draft;
  if (!d.items.length) { $('#dupwarn').innerHTML = '<div class="err">Add at least one item.</div>'; return; }
  const warns = findWarnings(d);
  if (warns.length && !UI.draftForce) {
    $('#dupwarn').innerHTML = `<div class="warnbox">${warns.map(x => `<div>${x}</div>`).join('')}<div class="row" style="margin-top:6px"><button class="small" data-act="saveEntryForce">Save anyway</button></div></div>`;
    $('#dupwarn').scrollIntoView({ block: 'nearest' });
    return;
  }
  const e = clone(d);
  e.assumptions = (e.assumptions_text != null ? e.assumptions_text : (e.assumptions || []).join('\n')).split('\n').map(s => s.trim()).filter(Boolean);
  e.items.forEach(i => { delete i.grams_text; });
  e.range_pct = C.num(e.range_pct);
  if (!e.label) e.label = e.items.slice(0, 2).map(i => i.name).join(' + ') + (e.items.length > 2 ? ' …' : '');
  e.totals = C.sumNutrients(e.items);
  delete e.assumptions_text; delete e._new; delete e._srcTouched;
  if (!e.created_at) e.created_at = new Date().toISOString();
  await save('entries', e);
  const day = dayById(e.day_id);
  closeAllSheets();
  toast(`${d._new ? 'Saved' : 'Updated'}${e.status === 'planned' ? ' as planned (not counted)' : ''}. ${runningText(day)}`);
}

// ----- saved meals picker -----
SHEETS.meals = () => `${sheetHead('Saved meals')}<ul class="list">${S.meals.slice().sort((a, b) => a.code.localeCompare(b.code)).map(m => {
  const t = C.sumNutrients(C.mealItems(m, foodsMap()));
  return `<li><div class="row spread"><div class="grow"><span class="code">${esc(m.code)}</span> <span class="t">${esc(m.name)}</span><div class="d">${nline(t)}</div></div>
    <div class="row"><button class="small" data-act="planMeal" data-id="${m.id}">Plan</button><button class="small primary" data-act="logMeal" data-id="${m.id}">Log</button></div></div></li>`;
}).join('')}</ul>`;
async function startMealEntry(meal, status, items, extraAssumptions) {
  const day = await ensureOpenDay();
  const fm = foodsMap();
  const built = (items || meal.items).map(i => { const f = fm[i.food_id]; return f ? C.itemFromFood(f, i.grams, i.eggOil ? { eggOil: true, name: 'Cooking oil with eggs' } : null) : null; }).filter(Boolean);
  const d = newEntryDraft(day, { label: `${meal.code} ${meal.name}`, status, items: built, meal_id: meal.id, assumptions: extraAssumptions || [] });
  if (meal.template) d.assumptions.push(`${meal.code} is a template: weigh and set each item's grams.`);
  UI.stack = [];
  UI.draft = d; autoSource(); openEntry(d);
}

// ----- metrics editor -----
function openMetrics(day) {
  const m = metricsFor(day.id);
  UI.mt = m ? clone(m) : { id: uid('m'), day_id: day.id, training: [] };
  UI.mt.training = UI.mt.training || [];
  UI.mt._orig_weight = numOrNull(UI.mt.weight_lb);
  UI.mt.woke_at = day.woke_at || '';
  UI.mt._reweighAsk = false;
  openSheet('metrics');
}
function metricsPreview() {
  const m = UI.mt, b = C.burnForDay(m, S.settings), s = S.settings, t = targetsFor(dayById(m.day_id).date);
  const steps = b.steps;
  const stepNote = steps ? `${fmt(steps)} steps${C.num(m.treadmill_min) ? ` (watch ${fmt(m.steps_watch || 0)} + treadmill ${fmt(C.treadmillSteps(m.treadmill_min, s.treadmill_steps_per_min))})` : ''}${steps > t.steps_ordinary_max ? ` · over the ${fmtK(t.steps_ordinary_max)} ordinary-day cap` : ''}` : 'No steps yet';
  return `<div>${stepNote}</div><div>${b.total != null ? `Burn ${fmt(b.total)}` : 'Burn pending'}</div>${burnLines(b)}`;
}
function sessionRow(t, i) {
  const type = C.sessionType(t.label), kcal = C.sessionBurn(t, S.settings);
  return `<div class="item"><div class="ih"><select data-tr="label" data-i="${i}" aria-label="Session">${SESSIONS.map(s => `<option ${t.label === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <button class="icon" data-act="rmSession" data-i="${i}" aria-label="Remove session">✕</button></div>
    <div class="grid3" style="margin-top:6px">
      ${type === 'muay_thai' ? `<label>Rounds (3 min)<input inputmode="numeric" data-tr="rounds" data-i="${i}" value="${esc(t.rounds || '')}"></label>` : `<label>Minutes<input inputmode="numeric" data-tr="minutes" data-i="${i}" value="${esc(t.minutes || '')}"></label>`}
      <label>RPE<input inputmode="numeric" data-tr="rpe" data-i="${i}" value="${esc(t.rpe || '')}"></label>
      <label>Cal override<input inputmode="numeric" data-tr="kcal_override" data-i="${i}" value="${esc(t.kcal_override == null ? '' : t.kcal_override)}" placeholder="${kcal}"></label></div>
    <label class="check" style="margin-top:6px"><input type="checkbox" data-tr="watch_on" data-i="${i}" ${t.watch_on ? 'checked' : ''}> Watch was on (already in the watch total)</label>
    <div class="in">${type === 'other' && !C.num(t.kcal_override) ? 'Enter calories for this session.' : `${fmt(kcal)} cal${type === 'muay_thai' ? ' · pad work, RPE 10' : ''}`}</div></div>`;
}
SHEETS.metrics = () => {
  const m = UI.mt, day = dayById(m.day_id);
  const hasSleep = m.sleep_watch_min != null && m.sleep_watch_min !== '';
  const sh = m.sleep_h != null ? esc(m.sleep_h) : hasSleep ? Math.floor(m.sleep_watch_min / 60) : '';
  const sm = m.sleep_m != null ? esc(m.sleep_m) : hasSleep ? Math.round(m.sleep_watch_min % 60) : '';
  const v = k => esc(m[k] == null ? '' : m[k]);
  return `${sheetHead(`${dayLabel(day.date)} · body and activity`)}
  <div class="stack">
    <div class="card stack"><h3>Morning</h3>
      <div class="grid2"><label>Weight (lb)<input inputmode="decimal" data-mt="weight_lb" value="${v('weight_lb')}"></label><label>Woke at<input type="time" data-mt="woke_at" value="${v('woke_at')}"></label></div>
      <div id="wterr">${m._reweighAsk ? reweighHtml() : ''}</div>
      <label>Weight note<input data-mt="weight_note" value="${v('weight_note')}" placeholder="e.g. high-sodium day yesterday"></label>
      <div class="grid2"><label>Sleep, watch: hours<input inputmode="numeric" data-mt="sleep_h" value="${sh}"></label><label>minutes<input inputmode="numeric" data-mt="sleep_m" value="${sm}"></label></div>
      <label>Clock estimate (if the watch missed part of the night)<input data-mt="sleep_clock_note" value="${v('sleep_clock_note')}" placeholder="e.g. bed 1:15, up 7:30, about 6 h"></label>
    </div>
    <div class="card stack"><h3>Night</h3>
      <div class="grid2"><label>Steps, watch<input inputmode="numeric" data-mt="steps_watch" value="${v('steps_watch')}"></label><label>Treadmill minutes (watch off)<input inputmode="decimal" data-mt="treadmill_min" value="${v('treadmill_min')}"></label></div>
      <div class="grid2"><label>Watch total burned cal<input inputmode="numeric" data-mt="burn_total_watch" value="${v('burn_total_watch')}"></label><label>Screenshot time, if before bed<input type="time" data-mt="burn_watch_time" value="${v('burn_watch_time')}"></label></div>
    </div>
    <div class="card"><div class="row spread"><h3>Training</h3><button class="small" data-act="addSession">+ Session</button></div>
      ${m.training.length ? m.training.map(sessionRow).join('') : '<p class="small muted">No training logged.</p>'}</div>
    <div class="tot" id="mtprev">${metricsPreview()}</div>
  </div>
  <footer class="sheet-f"><button data-act="closeSheet">Cancel</button><button class="primary" data-act="saveMetrics">Save</button></footer>`;
};
function reweighHtml() {
  return `<div class="warnbox"><div>${esc(UI.mt._reweighMsg || '')}</div>
    <label style="margin-top:6px">Re-weigh result (lb)<input inputmode="decimal" data-mt="reweigh" value="${esc(UI.mt.reweigh || '')}"></label></div>`;
}
async function saveMetrics() {
  const m = UI.mt, day = dayById(m.day_id), s = S.settings;
  let w = numOrNull(m.weight_lb);
  if (w != null && w !== m._orig_weight) {
    const last = lastWeightBefore(day);
    const chk = C.checkWeighIn(w, last ? last.w : null, s.reweigh_threshold_lb);
    if (!chk.ok) {
      if (!chk.needsReweigh) { UI.mt._reweighAsk = false; $('#wterr').innerHTML = `<div class="err">${esc(chk.reason)}</div>`; return; }
      const rw = numOrNull(m.reweigh);
      if (rw == null) {
        UI.mt._reweighAsk = true; UI.mt._reweighMsg = chk.reason + ' The reading is not saved.';
        $('#wterr').innerHTML = reweighHtml(); $('#wterr').scrollIntoView({ block: 'center' }); return;
      }
      const chk2 = C.checkWeighIn(rw, last ? last.w : null, s.reweigh_threshold_lb);
      if (chk2.ok) { m.weight_note = [m.weight_note, `Re-weighed; first reading ${w} discarded.`].filter(Boolean).join(' '); w = rw; }
      else if (Math.abs(rw - w) <= 0.4) { m.weight_note = [m.weight_note, `Confirmed by re-weigh (${w}, then ${rw}).`].filter(Boolean).join(' '); w = rw; }
      else { UI.mt._reweighMsg = `Re-weigh ${rw} matches neither the first reading (${w}) nor the trend. Weigh again.`; $('#wterr').innerHTML = reweighHtml(); return; }
    }
  }
  const out = clone(m);
  out.weight_lb = w;
  const h = numOrNull(m.sleep_h), mn = numOrNull(m.sleep_m);
  out.sleep_watch_min = h == null && mn == null ? numOrNull(m.sleep_watch_min) : (h || 0) * 60 + (mn || 0);
  ['steps_watch', 'treadmill_min', 'burn_total_watch'].forEach(k => { out[k] = numOrNull(m[k]); });
  ['sleep_h', 'sleep_m', 'reweigh', '_reweighAsk', '_reweighMsg', '_orig_weight', 'woke_at'].forEach(k => delete out[k]);
  if (m.woke_at !== (day.woke_at || '')) { day.woke_at = m.woke_at; await save('days', day); }
  await save('metrics', out);
  closeAllSheets();
  const b = C.burnForDay(out, s);
  toast(`Saved${w != null ? ` · ${w} lb` : ''}${b.total != null ? ` · burn ${fmt(b.total)}` : ''}`);
}

// ----- day close -----
function dayChecks(sum) {
  const { intake, t, bal, burn, m } = sum, T = intake.totals;
  const worked = [], fix = [], notes = [];
  if (!intake.loggedCount) notes.push('Nothing logged yet.');
  else if (T.kcal > t.kcal_band_high) fix.push(`Over the band by ${fmt(T.kcal - t.kcal_band_high)} cal. Do not cut tomorrow to pay it back; eat to the normal target.`);
  else if (T.kcal >= t.kcal_band_low) worked.push(`Calories in the ${fmt(t.kcal_band_low)}–${fmt(t.kcal_band_high)} band.`);
  else notes.push(`Under the band by ${fmt(t.kcal_band_low - T.kcal)} cal. Check nothing is missing from the log.`);
  if (intake.loggedCount) {
    if (T.protein >= t.protein_floor_g) worked.push(`Protein ${fmt(T.protein)}g, floor hit.`); else fix.push(`Protein ${fmt(T.protein)}g, ${fmt(t.protein_floor_g - T.protein)}g short of the ${t.protein_floor_g}g floor.`);
    if (T.fat > t.fat_cap_g) fix.push(`Fat ${fmt(T.fat)}g, over the ${t.fat_cap_g}g cap.`);
    if (T.sodium_mg > t.sodium_cap_mg) fix.push(`Sodium ${fmt(T.sodium_mg)} mg, over ${fmt(t.sodium_cap_mg)}. Expect a water bounce on the scale tomorrow.`); else worked.push(`Sodium under ${fmt(t.sodium_cap_mg)} mg.`);
    if (T.fiber < t.fiber_g) fix.push(`Fiber ${fmt(T.fiber)}g, short of ${t.fiber_g}g.`);
    if (intake.produce_g < t.produce_g) fix.push(`Produce ${fmt(intake.produce_g)}g, short of ${t.produce_g}g.`); else worked.push(`Produce ${fmt(intake.produce_g)}g.`);
  }
  if (burn.steps > t.steps_ordinary_max) notes.push(`${fmtK(burn.steps)} steps, above the ${fmtK(t.steps_ordinary_max)} ordinary-day cap.`);
  if (!bal) notes.push('Balance pending: steps and the watch total have not arrived. The day can close now and fill in later.');
  if (intake.plannedCount) notes.push(`${intake.plannedCount} planned entr${intake.plannedCount > 1 ? 'ies are' : 'y is'} not counted. Mark them eaten or remove them.`);
  if (m.sleep_watch_min != null && m.sleep_watch_min !== '' && m.sleep_watch_min < 360) fix.push(`Sleep ${hm(m.sleep_watch_min)} on the watch. Bed earlier.`);
  return { worked, fix, notes };
}
function openClose(day) {
  const sum = daySummary(day), ch = dayChecks(sum), n = day.notes || {};
  UI.cl = { day_id: day.id, worked: n.worked != null ? n.worked : ch.worked.join('\n'), fix: n.fix != null ? n.fix : ch.fix.join('\n'), tomorrow: n.tomorrow || '' };
  openSheet('close');
}
SHEETS.close = () => {
  const day = dayById(UI.cl.day_id), sum = daySummary(day), t = sum.t, T = sum.intake.totals, m = sum.m, b = sum.burn, ch = dayChecks(sum);
  const st = (ok, over) => (over ? '<span class="st-over">over</span>' : ok ? '<span class="st-good">ok</span>' : '<span class="st-warn">short</span>');
  const rows = [
    ['Calories', fmt(T.kcal), `${fmt(t.kcal_band_low)}–${fmt(t.kcal_band_high)}`, st(T.kcal >= t.kcal_band_low, T.kcal > t.kcal_band_high)],
    ['Protein', fmt(T.protein) + 'g', `${t.protein_floor_g}g+`, st(T.protein >= t.protein_floor_g, false)],
    ['Fat', fmt(T.fat) + 'g', `≤${t.fat_cap_g}g`, st(true, T.fat > t.fat_cap_g)],
    ['Carbs', fmt(T.carbs) + 'g', `~${t.carbs_g}g`, ''],
    ['Fiber', fmt(T.fiber) + 'g', `~${t.fiber_g}g`, st(T.fiber >= t.fiber_g, false)],
    ['Sodium', fmt(T.sodium_mg) + ' mg', `<${fmt(t.sodium_cap_mg)} mg`, st(true, T.sodium_mg > t.sodium_cap_mg)],
    ['Produce', fmt(sum.intake.produce_g) + 'g', `~${t.produce_g}g`, st(sum.intake.produce_g >= t.produce_g, false)],
    ['Weight', m.weight_lb != null ? fmtW(m.weight_lb) + ' lb' : '–', '', ''],
    ['Sleep', hm(m.sleep_watch_min) + (m.sleep_clock_note ? ' (watch)' : ''), '', ''],
    ['Steps', b.steps ? fmt(b.steps) : '–', `≤${fmtK(t.steps_ordinary_max)}`, b.steps ? st(true, b.steps > t.steps_ordinary_max) : ''],
    ['Training', (m.training || []).map(x => esc(x.label) + (x.rounds ? ` ${x.rounds}r` : x.minutes ? ` ${x.minutes}m` : '')).join(', ') || 'none', '', ''],
  ];
  const bal = sum.bal ? `<b>${signed(sum.bal.value)}</b> cal${Math.round(sum.bal.low) !== Math.round(sum.bal.high) ? ` <span class="muted">(${signed(sum.bal.low)} to ${signed(sum.bal.high)})</span>` : ''}` : '<b class="st-warn">pending</b>';
  return `${sheetHead(`${dayLabel(day.date)} · end of day`)}
  <div class="stack">
    <div class="card tablewrap"><table><thead><tr><th>Item</th><th>Actual</th><th>Target</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="muted">${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table>
      ${m.sleep_clock_note ? `<div class="small muted" style="margin-top:6px">Sleep clock note: ${esc(m.sleep_clock_note)}</div>` : ''}</div>
    <div class="card"><div class="balance">Balance ${bal}</div>${burnLines(b)}</div>
    ${ch.notes.map(x => `<div class="flag info">${esc(x)}</div>`).join('')}
    <label>What worked<textarea data-cl="worked">${esc(UI.cl.worked)}</textarea></label>
    <label>What to fix<textarea data-cl="fix">${esc(UI.cl.fix)}</textarea></label>
    <label>Tomorrow<textarea data-cl="tomorrow" placeholder="e.g. B1, CR, Y1; lift Day C; bed by 23:30">${esc(UI.cl.tomorrow)}</textarea></label>
  </div>
  <footer class="sheet-f"><button data-act="closeSheet">Back</button>${day.status === 'open' ? '<button class="primary" data-act="confirmClose">Close the day</button>' : '<button class="primary" data-act="saveCloseNotes">Save notes</button>'}</footer>`;
};

// ----- day edit -----
SHEETS.dayedit = () => {
  const day = dayById(UI.dayEditId), n = dayEntries(day.id).length;
  return `${sheetHead('Day')}
  <div class="stack">
    <div class="grid2"><label>Date (the day you woke)<input type="date" data-de="date" value="${esc(day.date)}"></label><label>Woke at<input type="time" data-de="woke_at" value="${esc(day.woke_at || '')}"></label></div>
    <div class="small muted">Status: ${day.status}${day.closed_at ? ` · closed ${new Date(day.closed_at).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</div>
    <div class="row wrap">${day.status === 'closed' ? '<button data-act="reopenDay">Reopen day</button>' : ''}<button class="danger" data-act="deleteDay">Delete day${n ? ` and its ${n} entries` : ''}</button></div>
  </div>
  <footer class="sheet-f"><button data-act="closeSheet">Cancel</button><button class="primary" data-act="saveDayEdit">Save</button></footer>`;
};

// ----- food editor -----
function openFood(food, fromSearch) {
  UI.fd = food ? clone(food) : { id: uid('f'), name: '', brand: '', basis: 'per_serving', serving_g: '', serving_label: '', kcal: '', protein: '', fat: '', carbs: '', fiber: '', sodium_mg: '',
    state: 'as_sold', source: 'label', confidence: 'Certain', category: 'label', notes: '', produce: false, egg: false, _new: true };
  UI.fd._fromSearch = !!fromSearch;
  openSheet('food');
}
SHEETS.food = () => {
  const f = UI.fd, v = k => esc(f[k] == null ? '' : f[k]);
  const used = !f._new && (S.meals.some(m => m.items.some(i => i.food_id === f.id)) || S.entries.some(e => (e.items || []).some(i => i.food_id === f.id)));
  const nf = [['kcal', 'Calories'], ['protein', 'Protein g'], ['fat', 'Fat g'], ['carbs', 'Carbs g'], ['fiber', 'Fiber g'], ['sodium_mg', 'Sodium mg']];
  const sel = (k, opts) => `<select data-fd="${k}">${opts.map(([val, l]) => `<option value="${val}" ${f[k] === val ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `${sheetHead(f._new ? 'New food' : 'Edit food')}
  <div class="stack">
    <div class="grid2"><label>Name<input data-fd="name" value="${v('name')}"></label><label>Brand<input data-fd="brand" value="${v('brand')}"></label></div>
    <div class="grid3"><label>Values are${sel('basis', [['per_serving', 'per serving'], ['per_100g', 'per 100g'], ['per_piece', 'per piece']])}</label>
      ${f.basis === 'per_serving' ? `<label>Serving (g)<input inputmode="decimal" data-fd="serving_g" value="${v('serving_g')}"></label>` : '<div></div>'}
      <label>Serving label<input data-fd="serving_label" value="${v('serving_label')}" placeholder="2 slices"></label></div>
    <div class="grid3">${nf.map(([k, l]) => `<label>${l}<input inputmode="decimal" data-fd="${k}" value="${v(k)}"></label>`).join('')}</div>
    <div class="grid3"><label>Weighed as${sel('state', STATES.map(s => [s, STATE_L[s]]))}</label>
      <label>Source${sel('source', [['label', 'Label'], ['estimate', 'Estimate'], ['web', 'Web']])}</label>
      <label>Confidence${sel('confidence', CONFS.map(c => [c, c]))}</label></div>
    <label>Group${sel('category', [['label', 'Label'], ['batch', 'Batch / recipe'], ['staple', 'Staple'], ['addon', 'Soak-in / add-on'], ['other', 'Other']])}</label>
    <label class="check"><input type="checkbox" data-fd="produce" ${f.produce ? 'checked' : ''}> Counts as produce (not potatoes or rice)</label>
    <label class="check"><input type="checkbox" data-fd="egg" ${f.egg ? 'checked' : ''}> Egg (adds about ${S.settings.egg_oil_g}g oil unless poached, boiled or dry)</label>
    <label>Notes<textarea data-fd="notes">${v('notes')}</textarea></label>
    <label>Label photo<input type="file" accept="image/*" capture="environment" data-chg="labelPhoto"></label>
    ${f.label_photo ? `<img class="thumb" src="${f.label_photo}" alt="Label photo"><button class="small" data-act="rmPhoto">Remove photo</button>` : ''}
    ${!f._new ? `<label class="check"><input type="checkbox" data-fd="archived" ${f.archived ? 'checked' : ''}> Archived (hidden from search; old entries keep their numbers)</label>` : ''}
    <div id="fderr"></div>
  </div>
  <footer class="sheet-f">${!f._new ? `<button data-act="foodVersion" title="Archive this one and start a copy">New version</button>${!used ? '<button class="danger" data-act="deleteFood">Delete</button>' : ''}` : '<button data-act="closeSheet">Cancel</button>'}<button class="primary" data-act="saveFood">Save</button></footer>`;
};
async function saveFood() {
  const f = clone(UI.fd);
  if (!String(f.name).trim()) { $('#fderr').innerHTML = '<div class="err">Name is required.</div>'; return; }
  if (f.basis === 'per_serving' && !(Number(f.serving_g) > 0)) { $('#fderr').innerHTML = '<div class="err">Serving size in grams is required for per-serving values.</div>'; return; }
  ['serving_g', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'sodium_mg'].forEach(k => { f[k] = C.num(f[k]); });
  if (f.basis === 'per_100g') f.serving_g = 100;
  if (f.basis === 'per_piece') f.serving_g = 1;
  const fromSearch = f._fromSearch; delete f._new; delete f._fromSearch;
  await save('foods', f);
  UI.stack.pop();
  const below = UI.stack[UI.stack.length - 1];
  if (fromSearch && below === 'entry' && UI.draft) { UI.draft.items.push(C.itemFromFood(f, C.defaultAmount(f))); autoSource(); }
  if (fromSearch && below === 'meal' && UI.md) UI.md.items.push({ food_id: f.id, grams: C.defaultAmount(f) });
  paintSheet(); if (!UI.stack.length) render();
  toast(`Saved food: ${f.name}`);
}
function readImage(file, max) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// ----- meal editor -----
function mealText(m) {
  const fm = foodsMap(), t = C.sumNutrients(C.mealItems(m, fm));
  const parts = m.items.map(i => { const f = fm[i.food_id]; return f ? `${fmtNum(i.grams)}${f.basis === 'per_piece' ? ' pc' : 'g'} ${f.name}${i.eggOil ? ' (egg cooking oil; drop if poached, boiled or dry)' : ''}` : '(missing food)'; });
  return `${m.code}: ${parts.join(' + ')}. About ${fmt(t.kcal)} cal / ${fmt(t.protein, 1)}g P / ${fmt(t.fat, 1)}g F / ${fmt(t.carbs, 1)}g C / ${fmt(t.fiber, 1)}g fiber / ${fmt(t.sodium_mg)} mg Na.${m.notes ? ' ' + m.notes : ''}`;
}
function openMeal(meal) {
  UI.md = meal ? clone(meal) : { id: uid('m'), code: '', name: '', items: [], notes: '', _new: true };
  openSheet('meal');
}
SHEETS.meal = () => {
  const m = UI.md, fm = foodsMap(), t = C.sumNutrients(C.mealItems(m, fm));
  return `${sheetHead(m._new ? 'New saved meal' : `Edit ${esc(m.code)}`)}
  <div class="stack">
    <div class="grid2"><label>Code<input data-md="code" value="${esc(m.code)}" placeholder="B2" autocapitalize="characters"></label><label>Name<input data-md="name" value="${esc(m.name)}"></label></div>
    ${m.items.map((it, i) => { const f = fm[it.food_id]; return `<div class="item ${it.eggOil ? 'eggoil' : ''}"><div class="ih"><b>${f ? esc(f.name) : 'Missing food'}${it.eggOil ? ' <span class="badge b-likely">egg oil</span>' : ''}</b><button class="icon" data-act="rmMealItem" data-i="${i}" aria-label="Remove">✕</button></div>
      <div class="ir"><div class="unit"><input inputmode="decimal" data-mi="grams" data-i="${i}" value="${fmtNum(it.grams)}"><span>${f && f.basis === 'per_piece' ? 'pc' : 'g'}</span></div><div class="in" id="mit-${i}">${f ? fmt(C.scaleFood(f, it.grams).kcal) + ' cal' : ''}</div></div></div>`; }).join('')}
    <div class="row"><input id="foodq" class="grow" data-on="foodSearch" data-mode="meal" placeholder="Add a food…" autocomplete="off"></div>
    <div id="foodres" class="results"></div>
    <label class="check"><input type="checkbox" data-md="template" ${m.template ? 'checked' : ''}> Template (grams change every time)</label>
    <label>Notes<textarea data-md="notes">${esc(m.notes)}</textarea></label>
    <div class="tot" id="mealtot">${nline(t)}</div>
    <div id="mderr"></div>
  </div>
  <footer class="sheet-f">${!m._new ? '<button class="danger" data-act="deleteMeal">Delete</button>' : '<button data-act="closeSheet">Cancel</button>'}<button class="primary" data-act="saveMeal">Save</button></footer>`;
};

// ---------- Week ----------
function weekStats(ws) {
  const rows = [...Array(7)].map((_, i) => { const date = C.addDays(ws, i), day = dayOn(date); return { date, day, sum: day ? daySummary(day) : null }; });
  const weights = rows.map(r => r.sum && numOrNull(r.sum.m.weight_lb)).filter(w => w != null);
  const rec = S.weeks.find(w => w.id === 'wk-' + ws);
  let avg = C.mean(weights), source = 'daily';
  if (avg == null && rec && rec.avg_weight != null) { avg = rec.avg_weight; source = 'recorded'; }
  const dayVals = rows.map(r => ({ date: r.date,
    kcal: r.sum && r.sum.intake.loggedCount ? r.sum.intake.totals.kcal : null,
    sodium: r.sum && r.sum.intake.loggedCount ? r.sum.intake.totals.sodium_mg : null,
    balance: r.sum && r.sum.bal && r.sum.intake.loggedCount ? r.sum.bal.value : null }));
  return { ws, rows, weights, n: weights.length, avg, source, dayVals, rec };
}
function viewWeek() {
  const ws = UI.weekStart, s = S.settings;
  const W = weekStats(ws), PW = weekStats(C.addDays(ws, -7)), t = targetsFor(C.addDays(ws, 6));
  const rev = C.weekReview({ avg: W.avg, prevAvg: PW.avg, days: W.dayVals, target: t, s });
  const kc = W.dayVals.filter(d => d.kcal != null), bl = W.dayVals.filter(d => d.balance != null);
  const avgI = C.mean(kc.map(d => d.kcal)), avgB = C.mean(bl.map(d => d.balance));
  const wk = C.cutWeek(ws, s.cut_start), rec = W.rec || {};
  const isCur = ws === C.weekStart(C.isoLocal());
  const stat = (k, v, sub) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
  return `<div class="row spread"><button data-act="weekNav" data-v="-1" aria-label="Previous week">‹</button>
    <div class="center"><h1>${wk > 0 ? `Cut week ${wk}` : 'Week'}</h1><div class="small muted">${dayLabel(ws)} – ${dayLabel(C.addDays(ws, 6))}${isCur ? ' · this week' : ''}</div></div>
    <button data-act="weekNav" data-v="1" aria-label="Next week">›</button></div>
  <div class="grid2" style="margin-top:10px">
    ${stat('Avg weight', W.avg != null ? fmtW(W.avg) : '–', W.source === 'recorded' ? 'from chat history' : `${W.n} reading${W.n === 1 ? '' : 's'}`)}
    ${stat('vs prior week', rev.change != null ? (rev.change > 0 ? '+' : '−') + Math.abs(rev.change).toFixed(1) : '–', PW.avg != null ? `prior ${fmtW(PW.avg)} (${PW.source === 'recorded' ? 'chat' : PW.n + ' readings'})` : 'no prior data')}
    ${stat('Avg intake', avgI != null ? fmt(avgI) : '–', `${kc.length} logged day${kc.length === 1 ? '' : 's'} · target ${fmt(t.kcal)}`)}
    ${stat('Avg balance', avgB != null ? signed(avgB) : '–', avgB != null ? `${bl.length} day${bl.length === 1 ? '' : 's'} · log says ${rev.explained > 0 ? '+' : '−'}${Math.abs(rev.explained).toFixed(1)} lb/wk` : 'needs burn data')}
  </div>
  ${rev.flags.length ? `<div class="card">${rev.flags.map(f => `<div class="flag ${f.level === 'alert' ? '' : 'info'}">${esc(f.text)}</div>`).join('')}</div>` : ''}
  <div class="card tablewrap"><table><thead><tr><th>Day</th><th>lb</th><th>Cal</th><th>P</th><th>Na</th><th>Steps</th><th>Bal</th></tr></thead><tbody>
    ${W.rows.map(r => { const s2 = r.sum; if (!s2) return `<tr><td>${dayLabel(r.date)}</td><td colspan="6" class="muted">–</td></tr>`;
      const T = s2.intake.totals, has = s2.intake.loggedCount;
      return `<tr class="click" data-act="gotoDay" data-id="${r.day.id}"><td>${dayLabel(r.date)}</td><td>${s2.m.weight_lb != null ? fmtW(s2.m.weight_lb) : '–'}</td>
        <td class="${has && T.kcal > s2.t.kcal_band_high ? 'st-over' : ''}">${has ? fmt(T.kcal) : '–'}</td><td>${has ? fmt(T.protein) : '–'}</td>
        <td class="${has && T.sodium_mg > s2.t.sodium_cap_mg ? 'st-over' : ''}">${has ? fmtK(T.sodium_mg) : '–'}</td><td>${s2.burn.steps ? fmtK(s2.burn.steps) : '–'}</td>
        <td>${s2.bal && has ? signed(s2.bal.value) + (s2.burn.baseSource === 'estimate' ? '*' : '') : '–'}</td></tr>`; }).join('')}
  </tbody></table><div class="tiny muted" style="margin-top:6px">* burn from the step table (estimate). Judge by the weekly average, never one weigh-in.</div></div>
  <div class="card stack"><h2>Weekly close</h2>
    <label>What worked<textarea data-wk="what_worked">${esc((rec.what_worked || []).join('\n'))}</textarea></label>
    <label>What to fix<textarea data-wk="what_to_fix">${esc((rec.what_to_fix || []).join('\n'))}</textarea></label>
    <div class="row spread"><span class="small muted">${rec.closed_at ? `Closed ${new Date(rec.closed_at).toLocaleDateString('en-CA')}` : 'Not closed yet'}</span><button class="primary" data-act="closeWeek">${rec.closed_at ? 'Update weekly close' : 'Close the week'}</button></div>
  </div>`;
}
async function closeWeek() {
  const ws = UI.weekStart, s = S.settings, W = weekStats(ws), PW = weekStats(C.addDays(ws, -7)), t = targetsFor(C.addDays(ws, 6));
  const rev = C.weekReview({ avg: W.avg, prevAvg: PW.avg, days: W.dayVals, target: t, s });
  const rec = Object.assign({}, W.rec || { id: 'wk-' + ws, week_start: ws });
  const lines = k => { const el = document.querySelector(`[data-wk="${k}"]`); return el ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : []; };
  Object.assign(rec, {
    avg_weight: W.source === 'daily' ? W.avg : rec.avg_weight, readings: W.n, prev_avg_weight: PW.avg, change: rev.change,
    avg_intake: C.mean(W.dayVals.map(d => d.kcal)), avg_balance: rev.avgBal, what_worked: lines('what_worked'), what_to_fix: lines('what_to_fix'),
    rule_flags: rev.flags.map(f => f.text), closed_at: new Date().toISOString(),
  });
  await save('weeks', rec); render(); toast('Week closed.');
}

// ---------- Charts ----------
function weightChart() {
  const end = C.isoLocal(), start = C.addDays(C.weekStart(end), -7 * 9), span = C.daysBetween(start, C.addDays(C.weekStart(end), 6));
  const pts = weightReadings().filter(p => p.date >= start && p.date <= end);
  const avgs = [];
  for (let ws = start; ws <= end; ws = C.addDays(ws, 7)) { const w = weekStats(ws); if (w.avg != null) avgs.push({ ws, avg: w.avg, n: w.n }); }
  if (!pts.length && !avgs.length) return '<p class="muted small">No weights yet.</p>';
  const goal = Number(S.settings.goal_lb) || 180;
  const vals = pts.map(p => p.w).concat(avgs.map(a => a.avg), [goal]);
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const W = 340, H = 210, L = 30, R = 8, T = 10, B = 22;
  const x = iso => L + (C.daysBetween(start, iso) + 0.5) / (span + 1) * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const step = hi - lo > 12 ? 5 : 2;
  let grid = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  let xl = '';
  for (let ws = start, i = 0; ws <= end; ws = C.addDays(ws, 7), i++) if (i % 2 === 0) xl += `<text x="${x(ws)}" y="${H - 6}" text-anchor="start">${C.ddmm(ws)}</text>`;
  const avgPath = avgs.map((a, i) => `${i ? 'L' : 'M'}${x(C.addDays(a.ws, 3)).toFixed(1)},${y(a.avg).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily weight with weekly average">
    <g class="grid">${grid}</g>${xl}
    <line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/><text x="${W - R}" y="${y(goal) - 4}" text-anchor="end">goal ${goal}</text>
    ${pts.map(p => `<circle class="dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.w).toFixed(1)}" r="2.6"><title>${C.ddmm(p.date)}: ${p.w}</title></circle>`).join('')}
    <path class="avg" d="${avgPath}"/>${avgs.map(a => `<circle cx="${x(C.addDays(a.ws, 3)).toFixed(1)}" cy="${y(a.avg).toFixed(1)}" r="3.5" fill="var(--good)"><title>Week of ${C.ddmm(a.ws)}: ${a.avg.toFixed(1)} (${a.n || 'chat'})</title></circle>`).join('')}
  </svg><div class="legend"><span><i style="background:var(--accent)"></i>daily</span><span><i style="background:var(--good)"></i>weekly average</span><span><i style="background:var(--warn)"></i>goal</span></div>`;
}
function intakeChart() {
  const end = C.isoLocal(), start = C.addDays(end, -20);
  const rows = []; for (let d = start; d <= end; d = C.addDays(d, 1)) { const day = dayOn(d); rows.push({ d, sum: day ? daySummary(day) : null }); }
  if (!rows.some(r => r.sum && r.sum.intake.loggedCount)) return '<p class="muted small">No intake logged in the last 3 weeks.</p>';
  const t = targetsFor(end);
  const vals = rows.flatMap(r => r.sum ? [r.sum.intake.loggedCount ? r.sum.intake.totals.kcal : 0, r.sum.burn.total || 0] : []);
  const hi = Math.ceil(Math.max(3000, ...vals) / 1000) * 1000, lo = 0;
  const W = 340, H = 210, L = 34, R = 8, T = 10, B = 22, n = rows.length, bw = (W - L - R) / n;
  const y = v => T + (hi - Math.max(lo, v)) / (hi - lo) * (H - T - B), x = i => L + i * bw;
  let grid = ''; for (let v = lo; v <= hi; v += 1000) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${fmtK(v)}</text>`;
  const barsSvg = rows.map((r, i) => { if (!r.sum || !r.sum.intake.loggedCount) return ''; const k = r.sum.intake.totals.kcal;
    return `<rect class="ib ${k > t.kcal_band_high ? 'over' : ''}" x="${(x(i) + bw * 0.18).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" y="${y(k).toFixed(1)}" height="${(y(lo) - y(k)).toFixed(1)}" rx="2"><title>${C.ddmm(r.d)}: ${fmt(k)} eaten</title></rect>`; }).join('');
  const burnPts = rows.map((r, i) => (r.sum && r.sum.burn.total ? { i, v: r.sum.burn.total, est: r.sum.burn.baseSource === 'estimate', d: r.d } : null)).filter(Boolean);
  const path = burnPts.map((p, j) => `${j ? 'L' : 'M'}${(x(p.i) + bw / 2).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const xl = rows.map((r, i) => (i % 4 === 0 ? `<text x="${(x(i) + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${C.ddmm(r.d)}</text>` : '')).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Intake against burn, last 21 days">
    <rect class="band" x="${L}" width="${W - L - R}" y="${y(t.kcal_band_high)}" height="${y(t.kcal_band_low) - y(t.kcal_band_high)}"/>
    <g class="grid">${grid}</g>${xl}${barsSvg}<path class="burn" d="${path}"/>
    ${burnPts.map(p => `<circle class="bdot" cx="${(x(p.i) + bw / 2).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p.est ? 2.2 : 3}"><title>${C.ddmm(p.d)}: burn ${fmt(p.v)}${p.est ? ' (estimate)' : ''}</title></circle>`).join('')}
  </svg><div class="legend"><span><i style="background:var(--accent)"></i>eaten</span><span><i style="background:var(--over)"></i>over band</span><span><i style="background:var(--warn)"></i>burn</span><span><i style="background:var(--good);opacity:.4"></i>${fmt(t.kcal_band_low)}–${fmt(t.kcal_band_high)} band</span></div>`;
}
function viewCharts() {
  return `<h1>Charts</h1><div class="card chart"><h2>Weight</h2>${weightChart()}</div><div class="card chart"><h2>Intake vs burn</h2>${intakeChart()}</div>`;
}

// ---------- Foods ----------
function foodListHtml() {
  const words = UI.foodsQ.toLowerCase().split(/\s+/).filter(Boolean), cat = UI.foodsCat;
  const list = S.foods.filter(f => (cat === 'archived' ? f.archived : !f.archived && (cat === 'all' || f.category === cat)))
    .filter(f => words.every(w => (f.name + ' ' + (f.brand || '')).toLowerCase().includes(w)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return '<li class="muted small">No foods match.</li>';
  return list.map(f => `<li data-act="editFood" data-id="${f.id}"><div class="row spread"><span class="t">${esc(f.name)}${f.brand ? ` <span class="muted">· ${esc(f.brand)}</span>` : ''}</span>${confBadge(f.confidence)}</div>
    <div class="d">${basisText(f)}${f.state !== 'as_sold' ? ', ' + STATE_L[f.state].toLowerCase() : ''}: ${fmt(f.kcal)} cal · ${fmt(f.protein, 1)}P · ${fmt(f.fat, 1)}F · ${fmt(f.carbs, 1)}C · ${fmt(f.fiber, 1)} fib · ${fmt(f.sodium_mg)} Na${f.label_photo ? ' · photo' : ''}</div></li>`).join('');
}
function viewFoods() {
  return `<div class="row spread"><h1>Foods</h1><button class="primary small" data-act="newFood">+ Food</button></div>
  <div class="quick"><input data-on="foodsFilter" placeholder="Search foods" value="${esc(UI.foodsQ)}" autocomplete="off"></div>
  <div class="chips">${CATS.map(([k, l]) => `<button class="small ${UI.foodsCat === k ? 'on' : ''}" data-act="foodsCat" data-v="${k}">${l}</button>`).join('')}</div>
  <div class="card"><ul class="list" id="foodlist">${foodListHtml()}</ul></div>`;
}

// ---------- Meals ----------
function viewMeals() {
  const fm = foodsMap();
  return `<div class="row spread"><h1>Saved meals</h1><button class="primary small" data-act="newMeal">+ Meal</button></div>
  <p class="small muted">Type the code on Today. Add changes after it: "B1 but 160g rice", "B1 poached", "plan CB".</p>
  <div class="card"><ul class="list">${S.meals.slice().sort((a, b) => a.code.localeCompare(b.code)).map(m => {
    const t = C.sumNutrients(C.mealItems(m, fm));
    return `<li data-act="editMeal" data-id="${m.id}"><div class="row spread"><span><span class="code">${esc(m.code)}</span> <span class="t">${esc(m.name)}</span>${m.template ? ' <span class="badge b-uncertain">template</span>' : ''}</span>
      <button class="small" data-act="logMeal" data-id="${m.id}">Log</button></div><div class="d">${nline(t)}</div>${m.notes ? `<div class="d">${esc(m.notes)}</div>` : ''}</li>`;
  }).join('')}</ul></div>`;
}

// ---------- Settings ----------
function viewSettings() {
  const s = S.settings, cur = targetsFor(C.isoLocal());
  UI.tg = UI.tg || Object.assign(clone(cur), { effective_from: C.isoLocal(), note: '' });
  const tg = UI.tg;
  const tf = [['kcal', 'Calories'], ['kcal_band_low', 'Band low'], ['kcal_band_high', 'Band high'], ['protein_floor_g', 'Protein floor g'], ['protein_soft_ceiling_g', 'Protein soft ceiling g'],
    ['fat_cap_g', 'Fat cap g'], ['carbs_g', 'Carbs g'], ['fiber_g', 'Fiber g'], ['sodium_cap_mg', 'Sodium cap mg'], ['produce_g', 'Produce g'], ['steps_ordinary_max', 'Steps, ordinary max'], ['steps_rest_max', 'Steps, rest-day max']];
  const nf = (k, l) => `<label>${l}<input inputmode="decimal" data-set="${k}" value="${esc(s[k])}"></label>`;
  const timeline = S.targets.slice().sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return `<h1>Settings</h1>
  <div class="card stack"><h2>Targets</h2>
    <div class="small muted">Current: ${fmt(cur.kcal)} cal (band ${fmt(cur.kcal_band_low)}–${fmt(cur.kcal_band_high)}), from ${C.ddmm(cur.effective_from)}. Saving creates a new dated target; history is kept.</div>
    <div class="grid3">${tf.map(([k, l]) => `<label>${l}<input inputmode="decimal" data-tg="${k}" value="${esc(tg[k])}"></label>`).join('')}</div>
    <div class="grid2"><label>Effective from<input type="date" data-tg="effective_from" value="${esc(tg.effective_from)}"></label><label>Note<input data-tg="note" value="${esc(tg.note || '')}" placeholder="why it changed"></label></div>
    <div class="row" style="justify-content:flex-end"><button class="primary" data-act="saveTargets">Save new targets</button></div>
    <div><h3>Timeline</h3><ul class="list">${timeline.map((t, i) => `<li><div class="row spread"><span class="t">${C.ddmm(t.effective_from)}/${t.effective_from.slice(2, 4)} · ${fmt(t.kcal)} cal</span>${timeline.length > 1 ? `<button class="small danger" data-act="deleteTarget" data-id="${t.id}">Delete</button>` : ''}</div>${t.note ? `<div class="d">${esc(t.note)}</div>` : ''}</li>`).join('')}</ul></div>
  </div>
  <div class="card stack"><h2>Burn</h2>
    <div class="small muted">Used only when there is no watch total. Calibrated to the watch; interpolated between rows.</div>
    <table><thead><tr><th>Steps</th><th>Burn, no training</th><th></th></tr></thead><tbody>
      ${s.burn_table.map((r, i) => `<tr><td><input inputmode="numeric" data-bt="${i},0" value="${r[0]}"></td><td><input inputmode="numeric" data-bt="${i},1" value="${r[1]}"></td><td><button class="icon" data-act="rmBurnRow" data-i="${i}" aria-label="Remove row">✕</button></td></tr>`).join('')}
    </tbody></table><div><button class="small" data-act="addBurnRow">+ Row</button></div>
    <div class="grid2">${nf('treadmill_steps_per_min', 'Treadmill steps/min')}${nf('pre_bed_kcal_per_hour', 'Cal/hour to midnight')}${nf('lift_kcal', 'Lifting session cal')}${nf('pickleball_kcal_per_min', 'Pickleball cal/min')}
      ${nf('mt_kcal_per_min', 'Muay thai cal/min')}${nf('mt_round_min', 'Muay thai round min')}${nf('mt_warmup_kcal', 'Muay thai warm-up cal')}${nf('egg_oil_g', 'Egg oil g')}</div>
  </div>
  <div class="card stack"><h2>Rules</h2>
    <label>2 lb weekly-drop rule<select data-set="drop_rule_mode" data-kind="text"><option value="alert" ${s.drop_rule_mode === 'alert' ? 'selected' : ''}>Alert only (never changes the target)</option><option value="off" ${s.drop_rule_mode === 'off' ? 'selected' : ''}>Off</option></select></label>
    <div class="grid2">${nf('drop_rule_lb', 'Drop that triggers it (lb)')}${nf('drop_rule_add_kcal', 'Suggested add (cal)')}${nf('reweigh_threshold_lb', 'Re-weigh if off by (lb)')}${nf('flat_lb', '"Flat" week within (lb)')}
      ${nf('water_margin_lb', 'Water margin (lb)')}${nf('kcal_per_lb', 'Cal per lb of fat')}</div>
    <div class="grid2">${nf('range_label', 'Range %, label')}${nf('range_weighed', 'Range %, weighed')}${nf('range_restaurant', 'Range %, restaurant')}${nf('range_estimate', 'Range %, estimate')}</div>
    <label>Standing rules (one per line)<textarea data-set="standing_rules" data-kind="lines" style="min-height:180px">${esc((s.standing_rules || []).join('\n'))}</textarea></label>
    <div class="small muted">Dropped, never asked: ${esc((s.dropped_metrics || []).join(', '))}. Fasting glucose is optional, weekly at most.</div>
  </div>
  <div class="card stack"><h2>Profile and device</h2>
    <div class="grid2"><label>App name<input data-set="app_name" data-kind="text" value="${esc(s.app_name)}"></label><label>Goal weight (lb)<input inputmode="decimal" data-set="goal_lb" value="${esc(s.goal_lb)}"></label>
      <label>Cut started<input type="date" data-set="cut_start" data-kind="text" value="${esc(s.cut_start)}"></label><label>Units<input value="lb, grams" disabled></label></div>
    <div class="small muted">Timezone: ${esc(deviceTz() || 'unknown')} (from this device, never hardcoded).</div>
  </div>
  <div class="card stack"><h2>Data</h2>
    <div class="small muted">Everything lives on this device. Export regularly; a cleared browser loses it.</div>
    <div class="row wrap"><button data-act="exportData">Export JSON</button><label class="small" style="display:inline-flex"><span class="muted">Import JSON</span><input type="file" accept="application/json,.json" data-chg="importData"></label></div>
    <div class="row wrap"><label class="small" style="display:inline-flex"><span class="muted">Load chat history file</span><input type="file" accept="application/json,.json" data-chg="historyFile"></label><button class="danger" data-act="resetAll">Erase everything</button></div>
  </div>
  <p class="tiny muted center">Personal log. Not a medical tool.</p>`;
}

// ---------- history import (handoff section 15, optional) ----------
async function loadHistory(file) {
  let H;
  try { H = JSON.parse(await file.text()); } catch (e) { toast('That file is not valid JSON.', true); return; }
  if (!H || H.app !== 'aj-food-log-history' || !H.weights) { toast('That is not a chat-history file.', true); return; }
  H.weeklyAverages = H.weeklyAverages || []; H.intake = H.intake || {}; H.sleep = H.sleep || {};
  if (!confirm('Load this history? Existing days are never overwritten.')) return;
  const today = C.isoLocal();
  let added = 0, filled = 0;
  for (const w of H.weeklyAverages) {
    if (!S.weeks.find(x => x.id === 'wk-' + w.week_start)) await save('weeks', { id: 'wk-' + w.week_start, week_start: w.week_start, avg_weight: w.avg_weight, source: 'chat', what_worked: [], what_to_fix: [] });
  }
  const dates = [...new Set([...Object.keys(H.weights), ...Object.keys(H.intake), ...Object.keys(H.sleep)])].sort();
  for (const date of dates) {
    let day = dayOn(date);
    if (day) { // never overwrite; only fill a missing weight or sleep
      const m = metricsFor(day.id) || { id: uid('m'), day_id: day.id, training: [] };
      let ch = false;
      if (m.weight_lb == null && H.weights[date] != null) { m.weight_lb = H.weights[date]; ch = true; }
      if (m.sleep_watch_min == null && H.sleep[date]) { Object.assign(m, H.sleep[date]); ch = true; }
      if (ch) { await save('metrics', m); filled++; }
      continue;
    }
    day = { id: uid('d'), date, status: date >= today ? 'open' : 'closed', imported: true, woke_at: '', created_at: new Date().toISOString(), closed_at: date >= today ? null : new Date().toISOString() };
    await save('days', day);
    const m = { id: uid('m'), day_id: day.id, training: [] };
    if (H.weights[date] != null) m.weight_lb = H.weights[date];
    if (H.sleep[date]) Object.assign(m, H.sleep[date]);
    const r = H.intake[date];
    if (r) {
      m.steps_watch = r[5];
      const it = C.customItem('Day total from chat', { kcal: r[0], protein: r[1], fat: r[2] || 0, carbs: r[3] || 0, fiber: 0, sodium_mg: r[4] || 0 }, 1);
      await save('entries', { id: uid('e'), day_id: day.id, time: '23:59', status: 'logged', label: 'Day total (imported from chat)', source: 'estimate', confidence: 'Likely', range_pct: 10, imported: true,
        assumptions: ['Imported daily total. Fiber and produce were not in the chat summary.' + (r[2] == null ? ' Fat, carbs and sodium were not recorded.' : '')], items: [it], totals: C.sumNutrients([it]) });
    }
    await save('metrics', m);
    added++;
  }
  render();
  toast(`History loaded: ${added} days added${filled ? `, ${filled} filled in` : ''}. Imported days use the step table for burn.`);
}

// ---------- export / import ----------
function exportData() {
  const data = {};
  STORES.forEach(s => { data[s] = SINGLE[s] ? (S[s] ? [S[s]] : []) : S[s]; });
  const blob = new Blob([JSON.stringify({ app: 'aj-food-log', version: 1, exported_at: new Date().toISOString(), data })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aj-food-log-${C.isoLocal()}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Exported.');
}
async function importData(file) {
  let j;
  try { j = JSON.parse(await file.text()); } catch (e) { toast('That file is not valid JSON.', true); return; }
  if (!j || j.app !== 'aj-food-log' || !j.data) { toast('That is not an AJ Food Log export.', true); return; }
  const counts = STORES.map(s => `${(j.data[s] || []).length} ${s}`).join(', ');
  if (!confirm(`Replace everything on this device with the export from ${j.exported_at ? new Date(j.exported_at).toLocaleString('en-CA') : 'unknown date'}?\n\n${counts}`)) return;
  for (const s of STORES) { await DB.clear(s); S[s] = SINGLE[s] ? null : []; for (const row of (j.data[s] || [])) await save(s, row); }
  if (!S.settings) await save('settings', SEED.defaultSettings(deviceTz()));
  migrate(); UI.viewDayId = null; UI.tg = null; render(); toast('Import complete.');
}
async function resetAll() {
  if (!confirm('Erase every entry, day, food and setting on this device? Export first if you want a copy. This cannot be undone.')) return;
  for (const s of STORES) { await DB.clear(s); S[s] = SINGLE[s] ? null : []; }
  await seedFresh(); UI.viewDayId = null; UI.tg = null; render(); toast('Erased. Seed foods and meals restored.');
}

// ---------- actions ----------
const A = {
  tab: el => { UI.tab = el.dataset.v; window.scrollTo(0, 0); render(); },
  closeSheet: () => closeSheet(),
  startDay: async () => { UI.viewDayId = null; const d = { id: uid('d'), date: C.isoLocal(), status: 'open', woke_at: nowHM(), created_at: new Date().toISOString() }; await save('days', d); render(); openMetrics(d); },
  gotoDay: el => { const d = dayById(el.dataset.id); if (!d) return; UI.viewDayId = d.id; UI.tab = 'today'; UI.stack = []; paintSheet(); window.scrollTo(0, 0); render(); },
  gotoCurrent: () => { UI.viewDayId = null; render(); },
  openMetrics: async () => { const d = await ensureOpenDay(); openMetrics(d); },
  newEntry: async () => { const d = await ensureOpenDay(); openEntry(newEntryDraft(d)); setTimeout(() => { const q = $('#foodq'); if (q) q.focus(); }, 50); },
  newCustom: async () => { const d = await ensureOpenDay(); const dr = newEntryDraft(d); dr.items.push(C.customItem('', null, 1)); setSourceOn(dr, 'restaurant'); openEntry(dr); },
  mealsSheet: () => openSheet('meals'),
  logMeal: el => startMealEntry(S.meals.find(m => m.id === el.dataset.id), 'logged'),
  planMeal: el => startMealEntry(S.meals.find(m => m.id === el.dataset.id), 'planned'),
  editEntry: el => { const e = S.entries.find(x => x.id === el.dataset.id); if (e) openEntry(clone(e)); },
  ateIt: async el => { const e = S.entries.find(x => x.id === el.dataset.id); e.status = 'logged'; e.eaten_at = new Date().toISOString(); e.time = nowHM(); await save('entries', e); render(); toast(`Counted. ${runningText(dayById(e.day_id))}`); },
  restoreEntry: async el => { const e = S.entries.find(x => x.id === el.dataset.id); e.status = 'logged'; await save('entries', e); render(); toast(`Restored. ${runningText(dayById(e.day_id))}`); },
  toggleRemoved: () => { UI.showRemoved = !UI.showRemoved; render(); },
  draftStatus: el => { UI.draft.status = el.dataset.v; paintSheet(); },
  rmItem: el => { const d = UI.draft; d.items.splice(+el.dataset.i, 1); autoSource(); paintSheet(); },
  addCustom: () => { UI.draft.items.push(C.customItem('', null, 1)); autoSource(); paintSheet(); focusLast('[data-it="name"]'); },
  pickFood: el => {
    const f = foodById(el.dataset.id); if (!f) return;
    const mode = UI.stack[UI.stack.length - 1];
    if (mode === 'meal') { UI.md.items.push({ food_id: f.id, grams: C.defaultAmount(f) }); paintSheet(); focusLast('[data-mi="grams"]'); return; }
    const d = UI.draft; d.items.push(C.itemFromFood(f, C.defaultAmount(f)));
    const idx = d.items.length - 1, oil = foodById('olive_oil');
    if (f.egg && oil && !d.items.some(i => i.eggOil) && C.num(S.settings.egg_oil_g) > 0) d.items.push(C.itemFromFood(oil, S.settings.egg_oil_g, { eggOil: true, name: 'Cooking oil with eggs' }));
    autoSource(); paintSheet();
    const g = document.querySelector(`[data-it="grams_text"][data-i="${idx}"]`); if (g) { g.focus(); g.select(); }
  },
  pickMeal: el => {
    const m = S.meals.find(x => x.id === el.dataset.id), d = UI.draft, fm = foodsMap();
    m.items.forEach(i => { const f = fm[i.food_id]; if (f) d.items.push(C.itemFromFood(f, i.grams, i.eggOil ? { eggOil: true, name: 'Cooking oil with eggs' } : null)); });
    if (!d.label) d.label = `${m.code} ${m.name}`;
    autoSource(); paintSheet();
  },
  newFoodFromSearch: el => { openFood(null, true); UI.fd.name = el.dataset.q || ''; paintSheet(); },
  saveEntry: () => saveEntry(),
  saveEntryForce: () => { UI.draftForce = true; saveEntry(); },
  removeEntry: async () => { const e = S.entries.find(x => x.id === UI.draft.id); if (!e) return closeSheet(); e.status = 'removed'; await save('entries', e); closeAllSheets(); toast(`Removed. ${runningText(dayById(e.day_id))}`); },
  addSession: () => { UI.mt.training.push({ label: 'B', minutes: '', rounds: '', rpe: '', watch_on: false, kcal_override: '' }); paintSheet(); },
  rmSession: el => { UI.mt.training.splice(+el.dataset.i, 1); paintSheet(); },
  saveMetrics: () => saveMetrics(),
  closeDay: el => { const d = dayById(el.dataset.id); if (d) openClose(d); },
  confirmClose: async () => {
    const day = dayById(UI.cl.day_id);
    day.notes = { worked: UI.cl.worked, fix: UI.cl.fix, tomorrow: UI.cl.tomorrow };
    day.status = 'closed'; day.closed_at = new Date().toISOString();
    await save('days', day);
    UI.viewDayId = null; closeAllSheets(); // the next entry starts a new day, never the closed one
    toast(daySummary(day).bal ? 'Day closed.' : 'Day closed, balance pending. Open it from "Last day" to add steps or burn.');
  },
  saveCloseNotes: async () => { const day = dayById(UI.cl.day_id); day.notes = { worked: UI.cl.worked, fix: UI.cl.fix, tomorrow: UI.cl.tomorrow }; await save('days', day); closeAllSheets(); toast('Notes saved.'); },
  editDay: el => { UI.dayEditId = el.dataset.id; UI.de = {}; openSheet('dayedit'); },
  saveDayEdit: async () => { const day = dayById(UI.dayEditId); Object.assign(day, UI.de); await save('days', day); closeAllSheets(); },
  reopenDay: async () => {
    const day = dayById(UI.dayEditId), other = openDay();
    if (other && other.id !== day.id && !confirm(`${dayLabel(other.date)} is open. Reopen ${dayLabel(day.date)} as well? New entries go to the day you are viewing.`)) return;
    day.status = 'open'; day.closed_at = null; await save('days', day); UI.viewDayId = day.id; closeAllSheets();
  },
  deleteDay: async () => {
    const day = dayById(UI.dayEditId), es = dayEntries(day.id);
    if (!confirm(`Delete ${dayLabel(day.date)}${es.length ? ` and its ${es.length} entries` : ''}? This cannot be undone.`)) return;
    for (const e of es) await remove('entries', e.id);
    const m = metricsFor(day.id); if (m) await remove('metrics', m.id);
    await remove('days', day.id); UI.viewDayId = null; closeAllSheets(); toast('Day deleted.');
  },
  weekNav: el => { UI.weekStart = C.addDays(UI.weekStart, 7 * Number(el.dataset.v)); render(); },
  closeWeek: () => closeWeek(),
  newFood: () => openFood(null),
  editFood: el => openFood(foodById(el.dataset.id)),
  saveFood: () => saveFood(),
  rmPhoto: () => { delete UI.fd.label_photo; paintSheet(); },
  foodVersion: async () => {
    const old = foodById(UI.fd.id); if (!old) return;
    old.archived = true; old.notes = [old.notes, `Archived ${C.ddmm(C.isoLocal())}: replaced by a new version.`].filter(Boolean).join(' ');
    await save('foods', old);
    const nf = clone(old); nf.id = uid('f'); nf.archived = false; delete nf.label_photo; nf.notes = `New version from ${C.ddmm(C.isoLocal())}. Check every number against the new label.`; nf._new = true;
    S.meals.forEach(m => m.items.forEach(i => { if (i.food_id === old.id) i._repoint = nf.id; }));
    UI.fd = nf; paintSheet(); toast('Old version archived. Enter the new label; saved meals will switch to it.');
  },
  deleteFood: async () => { if (!confirm(`Delete ${UI.fd.name}?`)) return; await remove('foods', UI.fd.id); closeAllSheets(); },
  foodsCat: el => { UI.foodsCat = el.dataset.v; render(); },
  newMeal: () => openMeal(null),
  editMeal: el => openMeal(S.meals.find(m => m.id === el.dataset.id)),
  rmMealItem: el => { UI.md.items.splice(+el.dataset.i, 1); paintSheet(); },
  saveMeal: async () => {
    const m = clone(UI.md); m.code = String(m.code || '').trim().toUpperCase();
    if (!m.code || !m.items.length) { $('#mderr').innerHTML = '<div class="err">A code and at least one item are required.</div>'; return; }
    if (S.meals.some(x => x.id !== m.id && x.code.toUpperCase() === m.code)) { $('#mderr').innerHTML = `<div class="err">${esc(m.code)} is already used.</div>`; return; }
    delete m._new; m.text = mealText(m); await save('meals', m); closeAllSheets(); toast(`Saved ${m.code}.`);
  },
  deleteMeal: async () => { if (!confirm(`Delete saved meal ${UI.md.code}?`)) return; await remove('meals', UI.md.id); closeAllSheets(); },
  saveTargets: async () => {
    const t = clone(UI.tg); t.id = 't_' + t.effective_from + '_' + Date.now().toString(36);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.effective_from)) { toast('Pick an effective date.', true); return; }
    Object.keys(t).forEach(k => { if (!['id', 'effective_from', 'note', 'profile_id', 'updated_at'].includes(k)) t[k] = C.num(t[k]); });
    if (t.kcal_band_low > t.kcal_band_high) { toast('Band low is above band high.', true); return; }
    await save('targets', t); UI.tg = null; render(); toast(`Targets saved from ${C.ddmm(t.effective_from)}.`);
  },
  deleteTarget: async el => { if (!confirm('Delete this target from the timeline?')) return; await remove('targets', el.dataset.id); UI.tg = null; render(); },
  addBurnRow: async () => { S.settings.burn_table.push([0, 0]); await save('settings', S.settings); render(); },
  rmBurnRow: async el => { S.settings.burn_table.splice(+el.dataset.i, 1); await save('settings', S.settings); render(); },
  exportData: () => exportData(),
  resetAll: () => resetAll(),
};
function setSourceOn(d, src) { d.source = src; d.confidence = SOURCE_CONF[src]; d.range_pct = S.settings['range_' + src]; }
function focusLast(sel) { setTimeout(() => { const els = document.querySelectorAll(sel); const el = els[els.length - 1]; if (el) el.focus(); }, 30); }

// change-only handlers (checkboxes, files)
const CHG = {
  eggOil: el => {
    const d = UI.draft, oil = foodById('olive_oil');
    if (el.checked && oil && !d.items.some(i => i.eggOil)) d.items.push(C.itemFromFood(oil, S.settings.egg_oil_g, { eggOil: true, name: 'Cooking oil with eggs' }));
    if (!el.checked) d.items = d.items.filter(i => !i.eggOil);
    paintSheet();
  },
  labelPhoto: async el => { const f = el.files && el.files[0]; if (!f) return; try { UI.fd.label_photo = await readImage(f, 1000); paintSheet(); } catch (e) { toast(e.message, true); } },
  historyFile: el => { const f = el.files && el.files[0]; if (f) loadHistory(f); el.value = ''; },
  importData: el => { const f = el.files && el.files[0]; if (f) importData(f); el.value = ''; },
};

function onField(el, isChange) {
  const ds = el.dataset;
  if (ds.chg) { if (isChange && CHG[ds.chg]) CHG[ds.chg](el); return; }
  if (ds.on === 'foodSearch') { const r = $('#foodres'); if (r) r.innerHTML = foodResults(el.value, ds.mode); return; }
  if (ds.on === 'foodsFilter') { UI.foodsQ = el.value; const l = $('#foodlist'); if (l) l.innerHTML = foodListHtml(); return; }
  if (ds.dr != null && UI.draft) {
    const k = ds.dr;
    if (k === 'source') { if (isChange && UI.draft.source !== el.value) { UI.draft._srcTouched = true; setSource(el.value); paintSheet(); } return; }
    UI.draft[k] = el.value;
    if (k === 'confidence') UI.draft._srcTouched = true;
    if (k === 'range_pct') { UI.draft._srcTouched = true; const t = $('#drafttot'); if (t) t.innerHTML = draftTotalsHtml(); }
    return;
  }
  if (ds.it != null && UI.draft) {
    const i = +ds.i, it = UI.draft.items[i], k = ds.it; if (!it) return;
    if (k === 'grams_text') {
      it.grams_text = el.value; const g = C.parseGrams(el.value);
      if (g != null) { it.grams = g; if (!it.custom) { const f = foodById(it.food_id); if (f) Object.assign(it, C.scaleFood(f, g)); } }
    } else if (k === 'portion_text') { it.portion_text = el.value; const p = C.parseAmount(el.value); if (p != null) { it.portion = p; C.recomputeCustom(it); } }
    else if (k.startsWith('base_')) { it[k] = C.num(el.value); C.recomputeCustom(it); }
    else it[k] = el.value;
    const n = $('#itn-' + i); if (n) n.innerHTML = itemNote(it);
    const t = $('#drafttot'); if (t) t.innerHTML = draftTotalsHtml();
    return;
  }
  if (ds.mt != null && UI.mt) { UI.mt[ds.mt] = el.value; const p = $('#mtprev'); if (p) p.innerHTML = metricsPreview(); return; }
  if (ds.tr != null && UI.mt) {
    const t = UI.mt.training[+ds.i]; if (!t) return;
    t[ds.tr] = el.type === 'checkbox' ? el.checked : el.value;
    if (ds.tr === 'label') { if (C.sessionType(t.label) === 'muay_thai' && !t.rpe) t.rpe = 10; if (isChange) paintSheet(); }
    const p = $('#mtprev'); if (p) p.innerHTML = metricsPreview();
    return;
  }
  if (ds.fd != null && UI.fd) {
    UI.fd[ds.fd] = el.type === 'checkbox' ? el.checked : el.value;
    if (ds.fd === 'basis' && isChange) paintSheet();
    return;
  }
  if (ds.md != null && UI.md) { UI.md[ds.md] = el.type === 'checkbox' ? el.checked : el.value; return; }
  if (ds.mi != null && UI.md) {
    const it = UI.md.items[+ds.i]; const g = C.parseGrams(el.value); if (!it || g == null) return; it.grams = g;
    const f = foodById(it.food_id), n = $('#mit-' + ds.i); if (n && f) n.textContent = fmt(C.scaleFood(f, g).kcal) + ' cal';
    const t = $('#mealtot'); if (t) t.innerHTML = nline(C.sumNutrients(C.mealItems(UI.md, foodsMap())));
    return;
  }
  if (ds.cl != null && UI.cl) { UI.cl[ds.cl] = el.value; return; }
  if (ds.de != null && UI.de) { UI.de[ds.de] = el.value; return; }
  if (ds.tg != null && UI.tg) { UI.tg[ds.tg] = el.value; return; }
  if (!isChange) return;
  if (ds.set != null) {
    const k = ds.set;
    S.settings[k] = ds.kind === 'lines' ? el.value.split('\n').map(s => s.trim()).filter(Boolean) : ds.kind === 'text' ? el.value : C.num(el.value);
    save('settings', S.settings); toast('Saved.');
    return;
  }
  if (ds.bt != null) { const [r, c] = ds.bt.split(',').map(Number); S.settings.burn_table[r][c] = C.num(el.value); save('settings', S.settings); toast('Burn table saved.'); }
}

async function quickAdd(text) {
  let t = text.trim(); if (!t) return;
  let status = 'logged';
  const pm = t.match(/^plan(?:ned)?\s+(.*)$/i); if (pm) { status = 'planned'; t = pm[1]; }
  const cmd = C.parseMealCommand(t, S.meals, foodsMap());
  if (cmd) {
    const notes = [];
    if (cmd.overrides.length) notes.push(`From "${text.trim()}".`);
    if (cmd.poached) notes.push('Eggs poached, boiled or dry: no cooking oil.');
    if (cmd.unmatched.length) notes.push(`Could not match: ${cmd.unmatched.join(', ')}. Check the items.`);
    await startMealEntry(cmd.meal, status, cmd.items, notes);
    if (cmd.unmatched.length) toast(`Not in ${cmd.meal.code}: ${cmd.unmatched.join(', ')}. Add or edit items before saving.`, true);
    return;
  }
  const day = await ensureOpenDay();
  openEntry(newEntryDraft(day, { status }));
  const q = $('#foodq'); if (q) { q.value = t; $('#foodres').innerHTML = foodResults(t, 'entry'); }
}

// meals that point at an archived food switch to its new version once that version is saved
async function repointMeals(newFoodId) {
  for (const m of S.meals) {
    let ch = false;
    m.items.forEach(i => { if (i._repoint === newFoodId) { i.food_id = newFoodId; delete i._repoint; ch = true; } });
    if (ch) { m.text = mealText(m); await save('meals', m); }
  }
}
const _saveFood = saveFood;
A.saveFood = async () => { const id = UI.fd.id; await _saveFood(); if (foodById(id)) await repointMeals(id); };

// ---------- boot ----------
function migrate() {
  const def = SEED.defaultSettings(deviceTz());
  Object.keys(def).forEach(k => { if (S.settings[k] === undefined) S.settings[k] = def[k]; });
  S.settings.timezone = deviceTz();
}
async function seedFresh() {
  await save('profile', SEED.profile());
  await save('settings', SEED.defaultSettings(deviceTz()));
  for (const t of SEED.targets) await save('targets', clone(t));
  for (const f of SEED.foods) await save('foods', clone(f));
  for (const m of SEED.meals) { const mm = clone(m); await save('meals', mm); }
  S.meals.forEach(m => { m.text = mealText(m); DB.put('meals', m); });
}
async function init() {
  try { await DB.open(); } catch (e) {
    $('#view').innerHTML = '<div class="fatal card"><h2>Storage is blocked</h2><p>This browser will not give the app local storage (private mode or blocked site data). Nothing can be saved here.</p></div>';
    return;
  }
  for (const s of STORES) { const rows = await DB.all(s); S[s] = SINGLE[s] ? rows[0] || null : rows; }
  if (!S.settings) await seedFresh();
  migrate();
  UI.weekStart = C.weekStart(C.isoLocal());
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = A[el.dataset.act]; if (!fn) return;
    e.preventDefault(); Promise.resolve(fn(el, e)).catch(err => { console.error(err); toast(err.message || String(err), true); });
  });
  document.addEventListener('input', e => onField(e.target, false));
  document.addEventListener('change', e => onField(e.target, true));
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
    if (f.dataset.form === 'quick') { const i = $('#quickIn'); const v = i.value; i.value = ''; quickAdd(v).catch(err => toast(err.message, true)); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.stack.length) closeSheet(); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
