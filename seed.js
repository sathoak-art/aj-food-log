/* seed.js — seed foods, meals, targets, targets and settings (handoff sections 6-9). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Seed = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [id, name, brand, basis, serving_g, serving_label, kcal, P, F, C, fiber, Na, extra]
  const L = (id, name, brand, serving_g, serving_label, kcal, protein, fat, carbs, fiber, sodium_mg, x) =>
    Object.assign({ id, name, brand, basis: 'per_serving', serving_g, serving_label, kcal, protein, fat, carbs, fiber, sodium_mg,
      state: 'as_sold', source: 'label', confidence: 'Certain', category: 'label', notes: '' }, x || {});
  const P100 = (id, name, kcal, protein, fat, carbs, fiber, sodium_mg, x) =>
    Object.assign({ id, name, brand: '', basis: 'per_100g', serving_g: 100, serving_label: '100g', kcal, protein, fat, carbs, fiber, sodium_mg,
      state: 'as_sold', source: 'estimate', confidence: 'Likely', category: 'staple', notes: 'Standard reference values.' }, x || {});

  const foods = [
    // His photographed labels
    L('powder', 'Protein powder, whey isolate', 'Beyond', 30, '1 scoop', 121, 26, 1.5, 1, 0, 36),
    L('yogurt', 'Greek yogurt 0% (current tub)', '', 115, '3/4 cup', 70, 11, 0, 5, 0, 40, { notes: 'Tub changed on 20/11. Make a new version of this food when the tub changes again.' }),
    L('rye', 'Rye bread', 'Natural Bakery', 48, '2 slices', 120, 4, 1.5, 22, 1, 190),
    L('bread', 'Bread (other loaf)', '', 60, '2 slices', 140, 7, 1.5, 27, 3, 210),
    L('bun', 'Bun', 'Freson Bros', 55, '1 bun', 140, 3, 2.5, 26, 1, 200),
    L('ham', 'Black Forest ham', 'Maple Leaf', 50, '3 slices', 60, 10, 1.5, 1, 0, 290),
    L('pepperoni', 'Pepperoni', '', 28, '5 slices', 110, 7, 9, 1, 0, 440),
    L('cheese_light', 'Light shredded cheese', 'Cracker Barrel', 30, '1/3 cup', 80, 8, 6, 1, 0, 190),
    L('sardines', 'Sardines in tomato sauce with chili', 'Mega', 55, '1/3 can (can 155g)', 50, 6, 2.5, 2, 0, 400),
    L('popcorn', 'Popcorn', "Angie's", 50, '50g', 250, 4, 15, 26, 4, 190),
    L('rice_chips', 'Rice chips', '', 15, '8 chips', 70, 1, 2.5, 11, 1, 135),
    L('shrimp', 'Frozen shrimp', 'Kirkland', 125, '17 shrimp, frozen', 100, 22, 1, 0, 0, 430, { state: 'frozen', notes: 'Log by frozen weight; that is the label basis.' }),
    L('blueberries', 'Frozen wild blueberries', '', 140, '1 cup', 80, 0, 0.2, 19, 6, 0, { state: 'frozen', produce: true }),
    L('cinnabon', 'Cinnabon Clusters', '', 40, '40g', 210, 2, 12, 24, 1, 120, { notes: 'Protein and fiber are estimates; the rest is from the label.' }),
    L('kitkat', 'Kit Kat', 'Nestle', 45, '1 bar', 230, 3, 12, 29, 1, 35, { notes: 'Protein and fiber are estimates.' }),
    L('udon', 'Udon', '', 200, '1 package', 290, 10, 1, 61, 2, 370, { notes: 'Fat and fiber are estimates.' }),
    L('jam', 'Jam', "Smucker's", 20, '1 tbsp', 50, 0, 0, 13, 0, 0),
    L('rice_cake', 'Rice cake', '', 13, '1 cake', 60, 1, 2, 9, 0, 70, { notes: 'Protein is an estimate.' }),

    // His batches and recipes
    P100('chilli', 'Turkey chilli (batch, 2,009g finished)', 95, 12.2, 2.3, 7.2, 2.3, 133,
      { state: 'cooked', source: 'label', confidence: 'Likely', category: 'batch', notes: 'Whole pot about 1,915 cal. That batch was finished on 21/11.' }),
    P100('chicken_pf', 'Chicken breast, pan-fried in olive oil (batch)', 197, 31, 7.2, 0, 0, 75,
      { state: 'cooked', source: 'label', confidence: 'Likely', category: 'batch', notes: 'Oil already included: 750g cooked + 27g oil = 1,476 cal / 232.5g P / 54g F. Weigh cooked. Do not add oil again.' }),
    { id: 'muffin_mini', name: 'Muffin, mini (mix + eggs + yogurt, no oil)', brand: '', basis: 'per_piece', serving_g: 1, serving_label: '1 mini',
      kcal: 35, protein: 1, fat: 1, carbs: 6, fiber: 0.3, sodium_mg: 50, state: 'cooked', source: 'estimate', confidence: 'Uncertain', category: 'batch',
      notes: 'Batch about 1,684 cal: 24 minis + 12 big. Only kcal is known; macros are estimates.' },
    { id: 'muffin_big', name: 'Muffin, big (mix + eggs + yogurt, no oil)', brand: '', basis: 'per_piece', serving_g: 1, serving_label: '1 big',
      kcal: 70, protein: 2, fat: 2, carbs: 12, fiber: 0.6, sodium_mg: 100, state: 'cooked', source: 'estimate', confidence: 'Uncertain', category: 'batch',
      notes: 'Batch about 1,684 cal: 24 minis + 12 big. Only kcal is known; macros are estimates.' },

    // Staples, per 100g
    P100('rice', 'Cooked white rice', 130, 2.8, 0.3, 28, 0.4, 1, { state: 'cooked' }),
    P100('chicken_plain', 'Chicken breast, cooked, plain', 165, 31, 3.6, 0, 0, 74, { state: 'cooked' }),
    P100('chicken_thigh', 'Chicken thigh, cooked, skinless', 179, 24.8, 8.2, 0, 0, 95, { state: 'cooked' }),
    P100('eye_round', 'Eye of round beef, raw', 137, 21.4, 4.9, 0, 0, 60, { state: 'raw', notes: '300g raw is roughly 200-215g cooked. Weigh raw or cooked, never both.' }),
    P100('top_blade', 'Top blade beef, raw frozen slices', 170, 19, 10.5, 0, 0, 60, { state: 'raw', notes: 'Hot pot slices. Weigh raw before they go in the pot.' }),
    P100('egg', 'Whole egg (50g each)', 144, 12.6, 9.5, 1, 0, 140, { state: 'raw', egg: true, notes: '2 eggs = 100g. About 5g oil is added unless poached, boiled or microwaved dry.' }),
    P100('egg_whites', 'Egg whites', 52, 10.8, 0.2, 0.7, 0, 166, { state: 'raw', egg: true }),
    P100('peas', 'Green peas', 77, 5.1, 0.4, 14, 5, 3, { produce: true }),
    P100('banana', 'Banana, peeled (118g = 105 cal)', 89, 1.1, 0.3, 23, 2.6, 1, { produce: true }),
    P100('orange', 'Navel orange', 47, 0.9, 0.1, 11.7, 2.4, 0, { produce: true }),
    P100('kiwi', 'Gold kiwi with skin (130g = 78 cal)', 60, 1.1, 0.3, 14.2, 2.3, 3, { produce: true }),
    P100('raspberries', 'Raspberries', 52, 1.2, 0.7, 11.9, 6.5, 1, { produce: true }),
    P100('oats', 'Rolled oats, dry (60g = 228 cal)', 380, 13, 7, 67, 10, 5, { state: 'raw' }),
    P100('walnuts', 'Walnuts', 654, 15, 65, 14, 7, 2),
    P100('olive_oil', 'Olive oil (1 tbsp = 13.5g = 119 cal)', 884, 0, 100, 0, 0, 0),
    P100('enoki', 'Enoki mushrooms', 37, 2.7, 0.3, 7.8, 2.7, 3, { state: 'raw', produce: true }),
    P100('spinach', 'Spinach', 23, 2.9, 0.4, 3.6, 2.2, 79, { state: 'raw', produce: true }),
    P100('watercress', 'Watercress', 11, 2.3, 0.1, 1.3, 0.5, 41, { state: 'raw', produce: true }),
    P100('red_pepper', 'Red bell pepper, raw', 31, 1, 0.3, 6, 2.1, 4, { state: 'raw', produce: true }),
    P100('lettuce', 'Lettuce', 15, 1.4, 0.2, 2.9, 1.3, 28, { state: 'raw', produce: true }),
    P100('tofu', 'Firm tofu', 80, 8, 4.7, 2, 0.3, 7, { state: 'raw' }),
    P100('mussel', 'Mussel meat, raw', 86, 11.9, 2.2, 3.7, 0, 290, { state: 'raw' }),
    P100('back_bacon', 'Back bacon, smoked', 120, 18, 4.3, 1.7, 0, 1040,
      { brand: 'Freybe', confidence: 'Uncertain', notes: 'No label. Midpoint of two listings, about ±20%.' }),
    { id: 'kraft_single', name: 'Kraft single', brand: 'Kraft', basis: 'per_serving', serving_g: 21, serving_label: '1 slice',
      kcal: 45, protein: 3, fat: 3, carbs: 1, fiber: 0, sodium_mg: 280, state: 'as_sold', source: 'estimate', confidence: 'Likely', category: 'staple', notes: '' },
    { id: 'mayo_lf', name: 'Mayo, low-fat', brand: '', basis: 'per_serving', serving_g: 15, serving_label: '1 tbsp',
      kcal: 35, protein: 0, fat: 3, carbs: 2, fiber: 0, sodium_mg: 110, state: 'as_sold', source: 'estimate', confidence: 'Likely', category: 'staple', notes: '35 cal/tbsp. Fat, carbs and sodium are estimates.' },
    { id: 'chili_oil', name: 'Chili oil', brand: '', basis: 'per_serving', serving_g: 7, serving_label: '1 tsp-ish (7g)',
      kcal: 60, protein: 0, fat: 6.5, carbs: 0.5, fiber: 0, sodium_mg: 10, state: 'as_sold', source: 'estimate', confidence: 'Uncertain', category: 'staple', notes: 'About 60 cal and 6.5g fat per 7g.' },
  ];

  // Broth soak-in (he never drinks broth). Enter the grams of the food that was cooked in the broth.
  const soak = (id, broth, food, refG, kcal, fat, na) => ({
    id, name: `Soak-in: ${broth} broth on ${food}`, brand: '', basis: 'per_serving', serving_g: refG, serving_label: `per ${refG}g ${food}`,
    kcal, protein: 0, fat, carbs: 0, fiber: 0, sodium_mg: na, state: 'as_sold', source: 'estimate', confidence: 'Uncertain',
    category: 'addon', notes: `Loose estimate. Enter the grams of ${food} that went in the pot, not broth.`,
  });
  foods.push(
    soak('soak_sich_beef', 'Sichuan', 'raw beef', 300, 80, 8, 500),
    soak('soak_sich_shrimp', 'Sichuan', 'shrimp', 122, 15, 1, 100),
    soak('soak_sich_mussel', 'Sichuan', 'mussel meat', 36, 25, 2.5, 150),
    soak('soak_tom_veg', 'Tomato', 'vegetables', 300, 25, 2, 200),
    soak('soak_tom_mussel', 'Tomato', 'mussel meat', 81, 15, 1, 100),
  );

  const meals = [
    { id: 'm_b1', code: 'B1', name: 'Eggs, whites, rice and peas',
      items: [{ food_id: 'egg', grams: 100 }, { food_id: 'egg_whites', grams: 250 }, { food_id: 'rice', grams: 150 }, { food_id: 'peas', grams: 50 }, { food_id: 'olive_oil', grams: 5, eggOil: true }],
      notes: 'About 551 cal / 46.4P. Drop the 5g oil (44 cal, 5g F) if the eggs are poached, boiled or microwaved dry. Say "B1 poached".' },
    { id: 'm_y1', code: 'Y1', name: 'Greek yogurt + protein powder',
      items: [{ food_id: 'yogurt', grams: 250 }, { food_id: 'powder', grams: 30 }], notes: 'Current tub.' },
    { id: 'm_ham', code: 'HAM', name: 'Usual ham sandwich',
      items: [{ food_id: 'ham', grams: 67 }, { food_id: 'bread', grams: 60 }, { food_id: 'kraft_single', grams: 21 }, { food_id: 'mayo_lf', grams: 15 }, { food_id: 'lettuce', grams: 20 }],
      notes: '4 slices ham, 2 slices bread, 1 single, about 1 tbsp low-fat mayo, lettuce.' },
    { id: 'm_hamr', code: 'HAMR', name: 'Ham sandwich on rye',
      items: [{ food_id: 'ham', grams: 67 }, { food_id: 'rye', grams: 48 }, { food_id: 'kraft_single', grams: 21 }, { food_id: 'mayo_lf', grams: 15 }, { food_id: 'lettuce', grams: 20 }],
      notes: 'Rye version, about 285 cal.' },
    { id: 'm_cr', code: 'CR', name: 'Chicken and rice lunch',
      items: [{ food_id: 'chicken_pf', grams: 200 }, { food_id: 'rice', grams: 250 }, { food_id: 'peas', grams: 150 }], notes: 'Pan-fried batch chicken, oil included.' },
    { id: 'm_cb', code: 'CB', name: 'Chilli bowl',
      items: [{ food_id: 'chilli', grams: 400 }, { food_id: 'rice', grams: 100 }], notes: '' },
    { id: 'm_pl1', code: 'PL1', name: 'Pre-lift: rice cakes + jam',
      items: [{ food_id: 'rice_cake', grams: 26 }, { food_id: 'jam', grams: 14 }], notes: '2 rice cakes + about 14g jam.' },
    { id: 'm_pl2', code: 'PL2', name: 'Pre-lift: banana + blueberries',
      items: [{ food_id: 'banana', grams: 118 }, { food_id: 'blueberries', grams: 100 }], notes: 'Ripe banana, frozen blueberries, water.' },
    { id: 'm_pl3', code: 'PL3', name: 'Pre-lift: rye + jam',
      items: [{ food_id: 'rye', grams: 60 }, { food_id: 'jam', grams: 17 }], notes: '' },
    { id: 'm_hp', code: 'HP', name: 'Hot pot (no sauce, no broth)', template: true,
      items: [{ food_id: 'top_blade', grams: 300 }, { food_id: 'tofu', grams: 100 }, { food_id: 'enoki', grams: 100 }, { food_id: 'spinach', grams: 100 }, { food_id: 'watercress', grams: 100 }, { food_id: 'rice', grams: 150 }],
      notes: 'Template: grams are placeholders, weigh raw each time. Add a Soak-in item if cooked in broth.' },
  ];

  const baseTargets = { kcal: 2200, kcal_band_low: 2000, kcal_band_high: 2200, protein_floor_g: 150, protein_soft_ceiling_g: 180,
    fat_cap_g: 70, carbs_g: 240, fiber_g: 25, sodium_cap_mg: 2000, produce_g: 450, steps_ordinary_max: 12000, steps_rest_max: 8000 };
  const targets = [
    Object.assign({}, baseTargets, { id: 't_2026-10-05', effective_from: '2026-10-05', kcal: 2000, kcal_band_low: 1800, kcal_band_high: 2000,
      note: 'Cut start. 2,000 until 26/10. Band and other values are assumed equal to the current ones.' }),
    Object.assign({}, baseTargets, { id: 't_2026-10-27', effective_from: '2026-10-27',
      note: '2,200 flat from 27/10. A 2,400 proposal on 22/11 was overridden: "keep my calories 2000 to 2200".' }),
  ];

  const STANDING_RULES = [
    'Eggs and egg whites carry about 5g oil unless poached, boiled or microwaved dry.',
    'Treadmill steps are 100/min and are added to the watch count.',
    'Exercise calories are shown as their own line, not added to intake. They are added to the burn.',
    "Use the watch's total burned calories as the base when he sends it.",
    'Weigh cooked or raw and send grams. Do not double count.',
    'Restaurant meals: ±25% range, lean high.',
    'Sleep: log the watch number for trend consistency.',
    'Muay thai with his brother is pad work, always RPE 10.',
    'A day closes on "end of day".',
    'Save a label when he photographs one. "Remember this" files it as a saved food.',
    'Judge by weekly averages, never a single weigh-in.',
    'Do not log an implausible weigh-in. If a reading differs from the last by about 3 lb or more overnight, ask him to re-weigh. A 1-2 lb swing after a high-sodium day is normal and is logged with a note.',
  ];
  const DROPPED = ['Daily stress score', 'Stomach and stool status', 'Daily headache check', 'Body measurements and body fat', 'Clinic call'];

  function defaultSettings(tz) {
    return {
      id: 'settings', app_name: 'AJ Food Log', units: 'lb', timezone: tz || '', cut_start: '2026-10-05', goal_lb: 180,
      burn_table: [[2500, 2100], [7500, 2200], [10000, 2350], [12000, 2380], [15000, 2450], [20000, 2520]],
      treadmill_steps_per_min: 100, pre_bed_kcal_per_hour: 55,
      lift_kcal: 175, mt_kcal_per_min: 15, mt_round_min: 3, mt_warmup_kcal: 125, pickleball_kcal_per_min: 5,
      egg_oil_g: 5, reweigh_threshold_lb: 3,
      drop_rule_mode: 'alert', drop_rule_lb: 2, drop_rule_add_kcal: 200, flat_lb: 0.3, water_margin_lb: 1, kcal_per_lb: 3500,
      range_label: 0, range_weighed: 10, range_restaurant: 25, range_estimate: 30,
      standing_rules: STANDING_RULES.slice(), dropped_metrics: DROPPED.slice(), glucose_optional: true,
    };
  }
  function profile() {
    return { id: 'aj', name: 'AJ', units: 'lb' };
  }

  // Personal history is not in the repo. Settings -> Load chat history reads it from a JSON file on the device.

  return { foods, meals, targets, defaultSettings, profile, STANDING_RULES, DROPPED };
});
