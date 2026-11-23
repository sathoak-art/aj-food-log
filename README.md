# AJ Food Log

Phase 1 of the calorie and nutrition tracker from the 23/11/2026 handoff: a manual MVP with no AI. It is a mobile-first PWA in plain HTML and JS, with no build step and no dependencies. Data is stored on the device in IndexedDB, with JSON export and import. It is separate from the AJ Training App.

## Files

| File | What it does |
|---|---|
| `index.html` | Shell and styles (dark and light themes) |
| `app.js` | Screens: Today, entry editor, metrics, day close, Week, Charts, Foods, Meals, Settings |
| `calc.js` | Pure calculation rules: label scaling, burn, balance, weigh-in check, weekly review |
| `seed.js` | Seed foods, saved meals, targets timeline, standing rules (no personal history) |
| `tests.js` | Acceptance checks from handoff section 19 (`node tests.js`) |
| `sw.js`, `manifest.webmanifest`, `icon*` | Offline caching and installing to the home screen |

## Run locally

```
python -m http.server 8765
```

Then open http://localhost:8765. The service worker only runs over http or https, not `file://`.

## Deploy (GitHub Pages)

1. Create a new repo, for example `aj-food-log`. Keep it separate from `aj-training-app`.
2. Push these files to `main` and turn on Pages from the root.
3. On the phone, open the Pages URL in Chrome and choose **Add to Home screen**.
4. On every later deploy, bump `VERSION` in `sw.js` so the phone picks up the new files.

## How the handoff rules are implemented

- **Plan is not log.** Entries are `planned`, `logged` or `removed`, and only `logged` entries count. Type `plan CB` to plan a meal. Tap **Ate it** to count it.
- **Corrections** edit the entry in place. **Remove** marks it removed (you can restore it) and never adds a duplicate. Each save shows the new day total.
- **Duplicates:** an entry identical to another one that day, or one that uses the same food twice (raw and cooked), asks before it saves.
- **Eggs:** adding any egg food adds a 5g olive oil item. Untick it for poached, boiled or dry eggs, or type `B1 poached`.
- **Meal codes:** type `B1`, `B1 but 160g rice` or `Y1` in the Today bar.
- **Snapshots:** each entry item stores its own nutrients, so editing a food or switching to a new yogurt tub never rewrites past days. On a food, **New version** archives the old label and repoints saved meals to the new one.
- **Burn:** the watch total is the base. If the screenshot is from before bed, about 55 cal per hour to midnight is added. Training is added on top unless the watch was on. With no watch total, burn comes from the editable step table and is labeled "estimate". Treadmill minutes are counted at 100 steps/min.
- **Weigh-in check:** a reading 3 lb or more from the last one is not saved. The app asks for a re-weigh. If the re-weigh matches the first reading, it is saved with a note.
- **The day** runs until **End of day**. If burn has not arrived, it closes as "closed, balance pending". A day left open past noon the next day shows a banner. After a close, new entries start a new day.
- **Weekly close** shows the average weight, how many readings, the change from the prior week, and average intake and balance. Its alerts are the 2 lb drop (alert only, and the target never changes), the log audit, over-band days ("do not cut the next day"), scale-ahead-of-log water, and the sodium bounce.
- **Not tracked:** stress, stool, headache, measurements, body fat and the clinic call.

## Open questions (handoff section 17)

None of these blocked phase 1. Defaults used:

1. PWA first. Health Connect needs an Android wrapper later (phase 4).
2. One device, with exports. Sync is phase 4.
3. AI budget: not needed until phase 2.
4. 2 lb rule: alert only by default. Turn it off in Settings.
5. Name: "AJ Food Log" as a placeholder. Change it in Settings. Not published.
6. History: the app starts clean with the seed foods and meals. **Settings → Load chat history file** imports a history JSON kept off the repo (weights, daily totals, sleep, weekly averages). It never overwrites existing days.

## Notes on the seed data

- In the handoff, B1's fiber is "about 2.5g". Its listed items add up to 3.1g, and the app uses the items.
- Pre-lift option (a), 2 rice cakes plus 14g jam, comes to about 155 cal and 27g carbs from the labels. The handoff says about 170 cal and 40g carbs.
- Muffin macros are estimates. Only their calories are known.
- The hot pot meal (`HP`) is a template. Its grams are placeholders.
- Imported history days have no watch totals, so their balances use the step table and are marked with `*`.

## Phase 2: AI photos and text (needs the Worker)

- **📷 Photo** on Today: take or pick up to 3 photos and add a note if you want ("ate half", "chicken not beef"). Claude drafts the entry, and you check it and tap Save.
- **AI from text**, or **✨ Ask AI** under a food search: describe what you ate.
- **📷 Scan label** on Foods: Claude reads the nutrition panel into a new food. Check the numbers against the photo.
- **Saved foods are used directly.** If the AI matches one of your saved foods, the app computes it from your own label values.
- **Questions from the AI** show above the items. Save waits until you tick "Answered".
- **Background items** the AI saw but didn't count are listed.
- **Repeated photos:** using the same photo twice is flagged.

Setup: [worker/README.md](worker/README.md). The Worker URL and passcode go in Settings → AI on each phone. The passcode never leaves the device in exports.

**Two people:** each phone keeps its own log. On a second phone, set your own targets and standing rules in Settings. The AI reads them from that phone.
