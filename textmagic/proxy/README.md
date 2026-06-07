# Pearl proxy (Cloudflare Worker)

Holds the Anthropic API key server-side so it never ships inside the extension.
The extension calls this worker; the worker builds the prompts, calls Anthropic
with the secret key, and rate-limits by IP.

## One-time setup

1. **Cloudflare account** (free) — https://dash.cloudflare.com/sign-up

2. **Log in wrangler** (from this `proxy/` folder):
   ```bash
   npx wrangler login
   ```

3. **Add your Anthropic key as a secret** (you'll paste it when prompted — it is
   stored on Cloudflare, never in the repo):
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

4. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   Wrangler prints the URL, e.g. `https://pearl-proxy.<your-subdomain>.workers.dev`.

5. Put that URL into the extension: open `../background.js` and set `PROXY_URL`.

## Local test

```bash
npx wrangler dev        # runs at http://localhost:8787
curl -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"mode":"generate","instruction":"write a one-line hello"}'
```
(For local dev, set the key in a `.dev.vars` file with `ANTHROPIC_API_KEY=sk-ant-...`
— that file is gitignored and only used by `wrangler dev`.)

## Notes

- **Rate limit** is configured in `wrangler.toml` (`limit`/`period`). Default
  30 req / 60s per IP.
- **Payload caps** (`MAX_TEXT_LEN`, `MAX_INSTRUCTION_LEN`) in `src/index.js`
  bound how much text one request can carry, capping per-call cost.
- The model is pinned to `claude-sonnet-4-6` in `src/index.js`.
