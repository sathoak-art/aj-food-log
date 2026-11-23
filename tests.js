/* Acceptance checks from handoff section 19. Run: node tests.js */
'use strict';
const C = require('./calc.js');
const Seed = require('./seed.js');

const foods = Object.fromEntries(Seed.foods.map(f => [f.id, f]));
const meals = Seed.meals;
const S = Seed.defaultSettings('UTC');
let pass = 0, fail = 0;
function near(label, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${C.round(got, 2)}, want ${want} (±${tol})`);
}
function truthy(label, cond) { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); }
const meal = code => meals.find(m => m.code === code);
const tot = items => C.sumNutrients(items);

// 1. 33g protein powder
let n = C.scaleFood(foods.powder, 33);
near('1 powder kcal', n.kcal, 133, 0.5); near('1 powder P', n.protein, 28.6, 0.05); near('1 powder F', n.fat, 1.7, 0.06);
near('1 powder C', n.carbs, 1.1, 0.05); near('1 powder Na', n.sodium_mg, 40, 1);

// 2. B1, fried and poached
n = tot(C.mealItems(meal('B1'), foods));
near('2 B1 kcal', n.kcal, 551, 1); near('2 B1 P', n.protein, 46.4, 0.1); near('2 B1 F', n.fat, 15.6, 0.1);
near('2 B1 C', n.carbs, 52, 0.5); near('2 B1 fiber (handoff says about 2.5; items sum to 3.1)', n.fiber, 2.5, 0.7); near('2 B1 Na', n.sodium_mg, 550, 10);
n = tot(C.mealItems(meal('B1'), foods, { dropEggOil: true }));
near('2 B1 poached kcal', n.kcal, 507, 1); near('2 B1 poached F', n.fat, 10.6, 0.1);
const cmd = C.parseMealCommand('B1 poached', meals, foods);
near('2 "B1 poached" command kcal', tot(cmd.items.map(i => C.itemFromFood(foods[i.food_id], i.grams))).kcal, 507, 1);

// 3. 250g current-tub yogurt
n = C.scaleFood(foods.yogurt, 250);
near('3 yogurt kcal', n.kcal, 152, 0.5); near('3 yogurt P', n.protein, 23.9, 0.05); near('3 yogurt F', n.fat, 0, 0);
near('3 yogurt C', n.carbs, 10.9, 0.05); near('3 yogurt Na', n.sodium_mg, 87, 0.5);

// 4. 27g popcorn
n = C.scaleFood(foods.popcorn, 27);
near('4 popcorn kcal', n.kcal, 135, 0.5); near('4 popcorn P', n.protein, 2.2, 0.05); near('4 popcorn F', n.fat, 8.1, 0.05);
near('4 popcorn C', n.carbs, 14, 0.1); near('4 popcorn fiber', n.fiber, 2.2, 0.05); near('4 popcorn Na', n.sodium_mg, 103, 0.5);

// 5. 300g raw eye of round
n = C.scaleFood(foods.eye_round, 300);
near('5 eye of round kcal', n.kcal, 411, 0.5); near('5 eye of round P', n.protein, 64, 0.3); near('5 eye of round F', n.fat, 14.7, 0.05);

// 6. Week 7 average and the 2 lb rule (alert only)
// Synthetic weights with the same spread as the handoff's week 6 and 7 (real history is not in the repo).
const wk7 = [200.8, 199.2, 198.4, 197.6, 198.8, 198.0, 196.4], wk6 = [202.2, 201.8, 200.8, 202.8, 199.2, 198.8, 199.4];
const avg7 = C.mean(wk7), avg6 = C.mean(wk6);
near('6 week 7 average', avg7, 198.5, 0.05); near('6 week 6 average', avg6, 200.7, 0.05);
const target = Seed.targets[1];
const rev = C.weekReview({ avg: avg7, prevAvg: avg6, days: [], target, s: S });
near('6 change', rev.change, -2.3, 0.05);
truthy('6 drop alert fires', rev.flags.some(f => f.id === 'fast_drop'));
truthy('6 target unchanged (2200)', target.kcal === 2200 && /stays at 2200/.test(rev.flags[0].text));
truthy('6 alert off when rule disabled', !C.weekReview({ avg: avg7, prevAvg: avg6, days: [], target, s: Object.assign({}, S, { drop_rule_mode: 'off' }) }).flags.some(f => f.id === 'fast_drop'));

// 7. Balance: 2,112 eaten, burn 2,350 base (10k steps, no watch) + 175 lifting + 305 pads
const burn = C.burnForDay({ steps_watch: 10000, training: [{ label: 'B', watch_on: false }, { label: 'muay thai', rounds: 4, rpe: 10, watch_on: false }] }, S);
near('7 base from table at 10k', burn.base, 2350, 0); near('7 muay thai 4 rounds', burn.training[1].kcal, 305, 0);
near('7 burn total', burn.total, 2830, 0);
const intake = C.intakeForDay([{ status: 'logged', range_pct: 0, items: [C.customItem('day', { kcal: 2112 })] }]);
near('7 balance', C.balance(intake, burn).value, -718, 0);
const watchBurn = C.burnForDay({ burn_total_watch: 2600, training: [{ label: 'muay thai', rounds: 4, watch_on: true }, { label: 'A', watch_on: false }] }, S);
near('7b watch-on pads not added on top of watch total', watchBurn.total, 2775, 0);
near('7c pre-bed projection 21:00 adds 3h x 55', C.burnForDay({ burn_total_watch: 2400, burn_watch_time: '21:00' }, S).total, 2565, 0);
near('7d treadmill 30 min adds 3,000 steps', C.stepsTotal({ steps_watch: 7000, treadmill_min: 30 }, S), 10000, 0);
near('7e burn interpolates 11k', C.interpBurn(S.burn_table, 11000), 2365, 0);

// 8. Planned entries do not count until eaten
const planned = { status: 'planned', range_pct: 10, items: C.mealItems(meal('CB'), foods) };
const day = [{ status: 'logged', range_pct: 0, items: C.mealItems(meal('Y1'), foods) }, planned];
const before = C.intakeForDay(day).totals.kcal;
near('8 planned excluded', before, 273, 0.5);
planned.status = 'logged';
near('8 after "ate it" included', C.intakeForDay(day).totals.kcal, 273 + 510, 1);
planned.status = 'removed';
near('8 removed excluded', C.intakeForDay(day).totals.kcal, 273, 0.5);

// 9. Implausible weigh-in
const w = C.checkWeighIn(180.0, 196.6, S.reweigh_threshold_lb);
truthy('9 a 16.6 lb overnight jump is not saved and asks for re-weigh', !w.ok && w.needsReweigh);
truthy('9b 1.6 lb swing is accepted', C.checkWeighIn(200.0, 198.4, 3).ok);

// Extras: meal command overrides, fractions, other saved meals
const b1 = C.parseMealCommand('B1 but 160g rice', meals, foods);
truthy('x "B1 but 160g rice" sets rice to 160', b1.items.find(i => i.food_id === 'rice').grams === 160 && !b1.unmatched.length);
near('x Y1 kcal', tot(C.mealItems(meal('Y1'), foods)).kcal, 273, 0.5);
near('x ham sandwich kcal', tot(C.mealItems(meal('HAM'), foods)).kcal, 305, 5);
near('x ham sandwich Na', tot(C.mealItems(meal('HAM'), foods)).sodium_mg, 985, 10);
near('x chicken and rice kcal', tot(C.mealItems(meal('CR'), foods)).kcal, 834, 1);
near('x chilli bowl P', tot(C.mealItems(meal('CB'), foods)).protein, 51.6, 0.1);
near('x fraction "half"', C.parseAmount('half'), 0.5, 0); near('x fraction "20%"', C.parseAmount('20%'), 0.2, 0);
near('x fraction "1/4"', C.parseAmount('1/4'), 0.25, 0); near('x grams "300*0.75"', C.parseGrams('300*0.75'), 225, 0);
truthy('x cut week of 23/11 is week 8', C.cutWeek('2026-11-23', '2026-10-05') === 8);
truthy('x week of Sun 22/11 starts Mon 16/11', C.weekStart('2026-11-22') === '2026-11-16');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
