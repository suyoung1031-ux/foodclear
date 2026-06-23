# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"냉장고 레시피 추천" — a Korean-language web app where users photograph their fridge, the AI identifies ingredients, and then recommends recipes.

## Commands

```bash
npm install      # install dependencies
npm start        # start Express server on port 3000 (reads .env)
npm run deploy   # publish public/ to GitHub Pages
```

No test runner is configured. The `src/test-*.js` files are standalone scripts run directly with `node`.

## Architecture

**Split deployment:**
- **Backend** — Node.js/Express on Render (`render.yaml`). Handles AI API calls and keeps the OpenRouter key secret.
- **Frontend** — Static HTML/CSS/JS in `public/` on GitHub Pages. Fetches the Render URL directly.

**3-step user flow:**
1. `public/index.html` — upload fridge photo → calls `POST /api/analyze`
2. `public/step2.html` — review/edit recognized ingredients → calls `POST /api/recipes`
3. `public/step3.html` — saved recipe collection (localStorage)

**Backend routes (`src/routes/`):**
- `analyze.js` — sends base64 image to OpenRouter (`google/gemma-4-31b-it:free`), returns `{ ingredients[], raw_description }`
- `recipes.js` — sends ingredient list + user options to OpenRouter (`openai/gpt-oss-120b:free`), returns `{ recipes[] }`. Has an in-memory LRU-ish cache (10 min TTL, 200 entries). Cache is bypassed when the request includes a `nonce` field (used for "regenerate" UX).

Both routes include JSON repair logic (`repairJson`) to handle malformed model output (missing opening quotes on string values).

**Key files:**
- `src/config.js` — reads and validates `OPENROUTER_API_KEY` from env; throws on startup if missing
- `src/server.js` — mounts routes, serves `public/` as static files, adds CORS headers (all origins)

## Environment

Requires a `.env` file at the project root:
```
OPENROUTER_API_KEY=<your key>
```

The `.env` in the repo currently has the wrong key name (`OPENAI_API_KEY`) — rename it to `OPENROUTER_API_KEY`.

## Module system

The entire project uses ESM (`"type": "module"` in `package.json`). Use `import`/`export` everywhere — no `require()`.
