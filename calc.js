/* calc.js — pure calculation rules (handoff section 5 and 13).
   Runs in the browser (window.Calc) and in Node (require) for the acceptance tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'sodium_mg'];
  const zero = () => ({ kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sodium_mg: 0 });
  const num = v => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));

  function round(n, d = 1) { const p = Math.pow(10, d); return Math.round((Number(n) || 0) * p) / p; }

  // ---------- foods and items ----------
  function foodBase(food) {
    if (food.basis === 'per_100g') return 100;
    if (food.basis === 'per_piece') return 1;
    return Number(food.serving_g) || 1;
  }
  function defaultAmount(food) { return food.basis === 'per_100g' ? 100 : food.basis === 'per_piece' ? 1 : Number(food.serving_g) || 100; }

  // value = label_value x (grams_eaten / serving_grams)
  function scaleFood(food, amount) {
    const f = num(amount) / foodBase(food);
    const out = zero();
    NUTRIENTS.forEach(k => { out[k] = num(food[k]) * f; });
    return out;
  }
  function addInto(acc, n, mult = 1) { NUTRIENTS.forEach(k => { acc[k] += num(n[k]) * mult; }); return acc; }
  function sumNutrients(list) { return (list || []).reduce((a, n) => addInto(a, n), zero()); }

  // An entry item holds a snapshot of its nutrients, so later food edits never rewrite history.
  function itemFromFood(food, grams, extra) {
    return Object.assign({
      food_id: food.id, name: food.name, grams: num(grams), state: food.state || 'as_sold',
      produce: !!food.produce, unit: food.basis === 'per_piece' ? 'pc' : 'g',
    }, scaleFood(food, grams), extra || {});
  }
  function customItem(name, base, portion) {
    const it = { custom: true, name: name || '', portion: portion == null ? 1 : portion, grams: 0, state: 'as_sold' };
    NUTRIENTS.forEach(k => { it['base_' + k] = num(base && base[k]); });
    return recomputeCustom(it);
  }
  function recomputeCustom(it) {
    const p = it.portion == null ? 1 : Number(it.portion);
    NUTRIENTS.forEach(k => { it[k] = num(it['base_' + k]) * p; });
    return it;
  }
  function mealItems(meal, foodsById, opts) {
    opts = opts || {};
    return (meal.items || [])
      .filter(i => !(opts.dropEggOil && i.eggOil))
      .map(i => { const f = foodsById[i.food_id]; return f ? itemFromFood(f, i.grams, i.eggOil ? { eggOil: true } : null) : null; })
      .filter(Boolean);
  }

  // ---------- parsing ----------
  const WORDS = { whole: 1, all: 1, full: 1, half: 0.5, third: 1 / 3, quarter: 0.25, fifth: 0.2,
    'two thirds': 2 / 3, 'three quarters': 0.75 };
  // "half", "1/4", "20%", "0.5", "1 1/2" -> multiplier
  function parseAmount(input) {
    if (input == null) return null;
    let s = String(input).trim().toLowerCase();
    if (!s) return null;
    s = s.replace(/^(a|one)\s+/, '');
    if (Object.prototype.hasOwnProperty.call(WORDS, s)) return WORDS[s];
    let m = s.match(/^(\d+(?:\.\d+)?)\s*%$/); if (m) return Number(m[1]) / 100;
    m = s.match(/^(\d+)\s*\/\s*(\d+)$/); if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
    m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/); if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
    if (/^\d*\.?\d+$/.test(s)) return Number(s);
    return null;
  }
  // grams, allowing simple arithmetic such as "300*0.75" or "122+36"
  function parseGrams(input) {
    const s = String(input == null ? '' : input).replace(/\s*g$/i, '').trim();
    if (!s) return null;
    if (!/^[\d.\s+\-*/()]+$/.test(s)) return null;
    try {
      const v = Function('"use strict";return (' + s + ')')();
      return isFinite(v) && v >= 0 ? v : null;
    } catch (e) { return null; }
  }
  // "B1", "B1 but 160g rice", "B1 poached", "plan Y1"
  function parseMealCommand(text, meals, foodsById) {
    const t = String(text || '').trim();
    const m = t.match(/^([a-z0-9_-]+)\b(.*)$/i);
    if (!m) return null;
    const meal = meals.find(x => x.code && x.code.toLowerCase() === m[1].toLowerCase());
    if (!meal) return null;
    const rest = m[2] || '';
    const overrides = [];
    const re = /(\d+(?:\.\d+)?)\s*g\s+(?:of\s+)?([a-z][a-z ]*?)\s*(?=,|\band\b|\bbut\b|$)/gi;
    let r;
    while ((r = re.exec(rest))) overrides.push({ grams: Number(r[1]), word: r[2].trim() });
    const poached = /\b(poached|boiled|microwaved?|dry)\b/i.test(rest);
    const items = (meal.items || []).filter(i => !(poached && i.eggOil)).map(i => Object.assign({}, i));
    const unmatched = [];
    overrides.forEach(o => {
      const w = o.word.toLowerCase(), ws = w.replace(/s$/, '');
      const idx = items.findIndex(i => { const f = foodsById[i.food_id]; const n = f ? f.name.toLowerCase() : ''; return !i.eggOil && (n.includes(w) || n.includes(ws)); });
      if (idx >= 0) items[idx].grams = o.grams; else unmatched.push(o.word);
    });
    return { meal, items, overrides, unmatched, poached };
  }

  // ---------- dates (device timezone, never hardcoded) ----------
  const pad = n => String(n).padStart(2, '0');
  function isoLocal(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(iso, n) { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoLocal(d); }
  function daysBetween(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 864e5); }
  function weekStart(iso) { const d = parseIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoLocal(d); }
  function ddmm(iso) { const p = iso.split('-'); return p[2] + '/' + p[1]; }
  function dowShort(iso) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseIso(iso).getDay()]; }
  function cutWeek(iso, cutStart) { return Math.floor(daysBetween(weekStart(cutStart), weekStart(iso)) / 7) + 1; }

  // ---------- steps and burn ----------
  function treadmillSteps(min, perMin) { return Math.round(num(min) * (perMin == null ? 100 : perMin)); }
  function stepsTotal(m, s) { return num(m.steps_watch) + treadmillSteps(m.treadmill_min, s.treadmill_steps_per_min); }
  function interpBurn(table, steps) {
    const t = (table || []).filter(r => r && r[0] != null && r[1] != null).map(r => [Number(r[0]), Number(r[1])]).sort((a, b) => a[0] - b[0]);
    if (!t.length) return null;
    if (steps <= t[0][0]) return t[0][1];
    for (let i = 1; i < t.length; i++) {
      if (steps <= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y0 + (y1 - y0) * (steps - x0) / (x1 - x0); }
    }
    return t[t.length - 1][1];
  }
  function hoursToMidnight(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = String(hhmm).split(':').map(Number);
    if (isNaN(h)) return 0;
    if (h < 5) return 0; // already past midnight
    return Math.max(0, 24 - h - (m || 0) / 60);
  }
  function sessionType(label) {
    const l = String(label || '').toLowerCase();
    if (['a', 'b', 'c', 'd', 'home', 'lift', 'lifting'].includes(l)) return 'lift';
    if (l.includes('muay')) return 'muay_thai';
    if (l.includes('pickle')) return 'pickleball';
    return 'other';
  }
  function sessionBurn(sess, s) {
    if (sess.kcal_override !== '' && sess.kcal_override != null) return num(sess.kcal_override);
    const type = sessionType(sess.label);
    if (type === 'lift') return num(s.lift_kcal);
    if (type === 'muay_thai') {
      const rounds = num(sess.rounds);
      const mins = rounds ? rounds * num(s.mt_round_min) : num(sess.minutes);
      return mins ? Math.round(mins * num(s.mt_kcal_per_min) + num(s.mt_warmup_kcal)) : 0;
    }
    if (type === 'pickleball') return Math.round(num(sess.minutes) * num(s.pickleball_kcal_per_min));
    return 0;
  }
  // Base = watch total (plus ~55/h to midnight if sent early), else the calibrated step table.
  // Training the watch did not record goes on top; watch-on training is already inside a watch total.
  function burnForDay(m, s) {
    m = m || {};
    const steps = stepsTotal(m, s);
    let base = null, baseSource = null, projected = 0;
    const watch = num(m.burn_total_watch);
    if (watch > 0) {
      base = watch; baseSource = 'watch';
      projected = Math.round(hoursToMidnight(m.burn_watch_time) * num(s.pre_bed_kcal_per_hour));
      if (projected > 0) { base += projected; baseSource = 'watch+projection'; }
    } else if (steps > 0) {
      base = Math.round(interpBurn(s.burn_table, steps)); baseSource = 'estimate';
    }
    const fromWatch = baseSource === 'watch' || baseSource === 'watch+projection';
    const training = (m.training || []).map(t => {
      const kcal = sessionBurn(t, s);
      return { label: t.label, kcal, watch_on: !!t.watch_on, counted: !(fromWatch && t.watch_on) };
    });
    const trainingAdded = training.filter(t => t.counted).reduce((a, t) => a + t.kcal, 0);
    return { steps, base, baseSource, watch: watch || null, projected, training, trainingAdded,
      total: base == null ? null : base + trainingAdded };
  }

  // ---------- intake and balance ----------
  function entryKcalRange(entry) { return num(entry.range_pct) / 100; }
  function intakeForDay(entries) {
    const logged = (entries || []).filter(e => e.status === 'logged');
    const planned = (entries || []).filter(e => e.status === 'planned');
    const totals = zero(); let low = 0, high = 0, produce = 0;
    logged.forEach(e => {
      const t = sumNutrients(e.items);
      addInto(totals, t);
      const r = entryKcalRange(e);
      low += t.kcal * (1 - r); high += t.kcal * (1 + r);
      produce += (e.items || []).filter(i => i.produce).reduce((a, i) => a + num(i.grams), 0);
    });
    return { totals, kcal_low: low, kcal_high: high, produce_g: produce,
      plannedTotals: sumNutrients(planned.map(e => sumNutrients(e.items))),
      loggedCount: logged.length, plannedCount: planned.length };
  }
  // Balance = intake - burn. Negative is a deficit.
  function balance(intake, burn) {
    if (!burn || burn.total == null) return null;
    return { value: intake.totals.kcal - burn.total, low: intake.kcal_low - burn.total, high: intake.kcal_high - burn.total };
  }

  // ---------- weight ----------
  function mean(a) { const v = (a || []).filter(x => x != null && !isNaN(x)).map(Number); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; }
  function checkWeighIn(lb, lastLb, threshold) {
    lb = Number(lb);
    if (!(lb > 60 && lb < 500)) return { ok: false, reason: 'That does not look like a weight in lb.' };
    const th = threshold == null ? 3 : Number(threshold);
    if (lastLb != null && Math.abs(lb - lastLb) >= th) {
      return { ok: false, needsReweigh: true,
        reason: `${lb} is ${round(Math.abs(lb - lastLb))} lb from the last reading (${lastLb}). That is not a real overnight change. Re-weigh before logging.` };
    }
    return { ok: true };
  }

  // ---------- weekly review (alerts only, never target changes) ----------
  function weekReview(o) {
    const s = o.s, t = o.target, flags = [];
    const change = o.avg != null && o.prevAvg != null ? o.avg - o.prevAvg : null;
    const intakeDays = (o.days || []).filter(d => d.kcal != null);
    const balDays = (o.days || []).filter(d => d.balance != null);
    const avgBal = mean(balDays.map(d => d.balance));
    const explained = avgBal == null ? null : avgBal * 7 / num(s.kcal_per_lb || 3500); // lb/week, negative = loss

    if (change != null && s.drop_rule_mode !== 'off' && -change > num(s.drop_rule_lb)) {
      flags.push({ id: 'fast_drop', level: 'alert',
        text: `Weekly average is down ${round(-change)} lb vs last week, more than ${s.drop_rule_lb}. Your rule says +${s.drop_rule_add_kcal} cal. Alert only: the target stays at ${t.kcal}.` });
    }
    if (change != null && intakeDays.length >= 5 && Math.abs(change) <= num(s.flat_lb) &&
        intakeDays.every(d => d.kcal >= t.kcal_band_low && d.kcal <= t.kcal_band_high)) {
      flags.push({ id: 'log_audit', level: 'alert',
        text: 'Intake was in the band every logged day and the weekly average is flat. Audit the log: oils, sauces, restaurant items and anything not weighed.' });
    }
    const over = intakeDays.filter(d => d.kcal > t.kcal_band_high);
    if (over.length) {
      flags.push({ id: 'over_band', level: 'info',
        text: `${over.length} day${over.length > 1 ? 's' : ''} over the ${t.kcal_band_high} band. Do not cut the next day to pay it back.` });
    }
    if (change != null && explained != null && change < 0 && -change > -explained + num(s.water_margin_lb)) {
      flags.push({ id: 'water', level: 'info',
        text: `The weekly average fell ${round(-change)} lb; the logged balance explains about ${round(Math.max(0, -explained))} lb of fat. Most of the rest is water.` });
    }
    if (change != null && explained != null && change > 0 && explained < 0) {
      const salty = intakeDays.filter(d => d.sodium != null && d.sodium > t.sodium_cap_mg).length;
      flags.push({ id: 'bounce', level: 'info',
        text: `The scale is up ${round(change)} lb while the log shows a deficit. That is water, not fat${salty ? `; ${salty} day${salty > 1 ? 's were' : ' was'} over the sodium cap` : ''}. Judge it on next week's average.` });
    }
    return { change, explained, avgBal, flags };
  }

  return { NUTRIENTS, zero, round, num, foodBase, defaultAmount, scaleFood, addInto, sumNutrients,
    itemFromFood, customItem, recomputeCustom, mealItems, parseAmount, parseGrams, parseMealCommand,
    isoLocal, parseIso, addDays, daysBetween, weekStart, ddmm, dowShort, cutWeek,
    treadmillSteps, stepsTotal, interpBurn, hoursToMidnight, sessionType, sessionBurn, burnForDay,
    intakeForDay, balance, mean, checkWeighIn, weekReview };
});
