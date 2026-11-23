# AI Worker

A small Cloudflare Worker that holds the Anthropic API key and turns photos or text into draft entries. The app never sees the key; it sends a passcode instead.

| Route | Model | Use |
|---|---|---|
| `/estimate` with photo | Claude Sonnet 5.5 (effort medium) | Plate photos |
| `/estimate` text only | Claude Haiku 5.5 (effort low) | "half a beef donair" |
| `/label` | Claude Sonnet 5.5 (effort low) | Nutrition facts panels |
| `/ping` | none | Settings → Test connection |

Photo and label requests turn on Anthropic's server-side refusal fallback (`fallbacks: "default"`). Remove it in `src/index.js` if you don't want it. A request the AI declines comes back as an error that says to log it manually.

## One-time setup (about 15 minutes)

Run these from this `worker` folder.

1. **Anthropic API key.** Create one at console.anthropic.com → API keys, add prepaid credits, and set a monthly spend limit under Limits.
2. **Cloudflare.** Create a free account at dash.cloudflare.com, then log wrangler in (it opens the browser):
   ```
   npx wrangler login
   ```
3. **Daily counter.** Run the command below, paste the `id` it prints into `wrangler.toml`, and uncomment the `[[kv_namespaces]]` block:
   ```
   npx wrangler kv namespace create USAGE
   ```
4. **Secrets.** Type each one at the prompt. Neither is stored in any file.
   ```
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put APP_PASSCODE
   ```
   Pick a long passcode, for example four random words. Both phones use the same one.
5. **Deploy:**
   ```
   npx wrangler deploy
   ```
   It prints a URL like `https://aj-food-log-ai.<name>.workers.dev`.
6. **On each phone:** go to Settings → AI, paste the URL and passcode, and tap **Test connection**.

## Limits and cost

`DAILY_LIMIT` in `wrangler.toml` caps AI requests per day across all phones (default 40). Estimated cost: about $0.03–0.04 USD per photo and well under a cent per text draft. The spend limit in the Anthropic console is the hard stop.

## Tests

`npm test` runs the Worker against a fake Anthropic API, so it needs no key or network. `npm run check` bundles it without deploying.
