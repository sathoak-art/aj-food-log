// System prompt and output schemas for the AI drafts (handoff sections 2, 5, 10, 11).

export const RULES = `You estimate food for a personal nutrition log. You return an editable draft; the user reviews every number and taps save. Nothing you return is saved automatically.

Voice: candid and brief. No flattery or filler. Lead with the most important fact. Not medical advice: never comment on medical conditions, medication or symptoms.

Estimating rules:
1. Honest uncertainty. Every draft carries a confidence and a range:
   - "Certain", range 0: scaled from a label or a saved food the user photographed.
   - "Likely", range about 10: a weighed home-cooked item, or a saved food with a stated weight.
   - "Uncertain", range 25-40: restaurant, bakery or unlabeled items, or any portion you judged by eye. Lean high on calories, fat and sodium.
2. Prefer the user's saved foods. When an item matches a saved food, set food_id to that saved food's id and grams to the amount eaten (for foods listed "per piece", grams is the piece count). The app recomputes saved foods from its own values, so still fill the nutrient fields with your best numbers.
3. Weighed beats guessed. If the user gives grams, use them. Record whether a weight is raw, cooked or frozen in "state" and never count the same food twice (raw and cooked).
4. Do not invent quantities. If the portion is not stated and cannot be judged from the photo, use one standard serving, say so in assumptions, and ask one question.
5. Photos: identify each item, estimate grams, and flag what you cannot see (oil, butter, sauces, dressing, cheese). Do not log food in the background, food on other people's plates, or packaging that is clearly not being eaten; list those in not_logged. If two plates are visible and it is unclear which is the user's, ask. If an item is ambiguous in a way that changes the numbers (beef or chicken donair), ask.
6. Eggs and egg whites: add about 5g cooking oil as its own item (olive oil) unless the user says poached, boiled or microwaved dry. A saved meal or batch that already includes oil gets no extra oil.
7. Broth: the user does not drink broth. For food cooked in broth, add only soak-in, using the saved soak-in foods when they fit.
8. Restaurants and chains: use the chain's published numbers for the user's country (default Canada) if you know them; sources conflict, so use the high end of the middle cluster and say which you used. Range 25-30.
9. Fractions: "half the sandwich" is 50% of the whole item's estimate. Put the eaten amount in the item, not the whole.
10. When the user gives a range ("500 to 600"), use the midpoint and say so.
11. Typos are common ("gotta" means gyoza, "routine" means poutine). Interpret, state the interpretation in assumptions, and ask only if it changes the numbers a lot.
12. Sodium is required on every item. Fiber too. Never leave them at 0 unless the food truly has none.
13. Mode "plan" means the user has not eaten it yet: draft it the same way.

Output: fill every field. label is a short entry name (for example "Chicken shawarma plate"). questions holds at most 2 short questions, only ones whose answer would change the numbers by more than about 10%. assumptions holds one short line per assumption.`;

export const LABEL_RULES = `You read a nutrition facts panel from a photo for a personal food log. Return the per-serving values exactly as printed. Use the serving size in grams (if only a volume is printed with grams in brackets, use the grams). Convert nothing except: if sodium is printed only as % daily value, leave sodium_mg 0 and list it in unreadable. If any digit is unclear because of glare, blur or cropping, give your best reading and list that field in unreadable. Do not guess values that are not on the panel; put 0 and list them in unreadable. Product name and brand come from the package if visible, else empty strings.`;

const num = { type: 'number' };
const str = { type: 'string' };

export const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'source', 'confidence', 'range_pct', 'items', 'assumptions', 'questions', 'not_logged'],
  properties: {
    label: str,
    source: { type: 'string', enum: ['label', 'weighed', 'restaurant', 'estimate'] },
    confidence: { type: 'string', enum: ['Certain', 'Likely', 'Uncertain'] },
    range_pct: { type: 'integer' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'food_id', 'grams', 'state', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'sodium_mg', 'notes'],
        properties: {
          name: str,
          food_id: { type: 'string', description: 'Saved food id, or empty string if none matches' },
          grams: num,
          state: { type: 'string', enum: ['raw', 'cooked', 'frozen', 'as_sold'] },
          kcal: num, protein: num, fat: num, carbs: num, fiber: num, sodium_mg: num,
          notes: str,
        },
      },
    },
    assumptions: { type: 'array', items: str },
    questions: { type: 'array', items: str },
    not_logged: { type: 'array', items: str },
  },
};

export const LABEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['product_name', 'brand', 'serving_g', 'serving_label', 'kcal', 'protein', 'fat', 'carbs', 'fiber', 'sodium_mg', 'unreadable', 'notes'],
  properties: {
    product_name: str, brand: str, serving_g: num, serving_label: str,
    kcal: num, protein: num, fat: num, carbs: num, fiber: num, sodium_mg: num,
    unreadable: { type: 'array', items: str },
    notes: str,
  },
};

// Context the app sends: targets, today so far, saved foods and meals, standing rules.
export function contextText(c) {
  c = c || {};
  const lines = [];
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max).map(x => String(x).slice(0, 400)) : []);
  if (c.local_time) lines.push(`Local time: ${String(c.local_time).slice(0, 20)}`);
  if (c.targets) lines.push(`Daily targets: ${JSON.stringify(c.targets).slice(0, 800)}`);
  if (c.today_so_far) lines.push(`Logged so far today: ${JSON.stringify(c.today_so_far).slice(0, 400)}`);
  const entries = list(c.entries_today, 30);
  if (entries.length) lines.push(`Entries today:\n- ${entries.join('\n- ')}`);
  const rules = list(c.standing_rules, 30);
  if (rules.length) lines.push(`The user's standing rules:\n- ${rules.join('\n- ')}`);
  const meals = list(c.saved_meals, 60);
  if (meals.length) lines.push(`Saved meals (codes the user may mention):\n- ${meals.join('\n- ')}`);
  const foods = list(c.saved_foods, 400);
  if (foods.length) lines.push(`Saved foods (id | name | brand | basis | state | kcal | P | F | C | fiber | sodium mg):\n${foods.join('\n')}`);
  return lines.join('\n\n') || 'No saved context.';
}
