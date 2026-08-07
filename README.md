<div align="center">

# NewzWale

**Only Facts News**

Live Indian news, in 13 languages — plus a fact-checker that never guesses.

[![CI](https://github.com/Yrathore97/NewzWale/actions/workflows/deploy.yml/badge.svg)](https://github.com/Yrathore97/NewzWale/actions/workflows/deploy.yml)
[![Built with Astro](https://img.shields.io/badge/built%20with-Astro-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![Deployed on Cloudflare Workers](https://img.shields.io/badge/deployed%20on-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

[**Live Site →**](https://newzwale.editall.workers.dev)

</div>

---

## What it is

NewzWale is two things, not seven:

1. **A live headline feed** — real Indian news, pulled per category and language, always linking out to the original publisher. No rewritten copy, no invented summaries.
2. **A fact-checker** — paste a headline, a claim, or an article URL. It checks a certified fact-checker database first, then live web evidence, and only ever answers `Verified`, `Misleading`, `False`, or **`Not enough evidence to judge`**. It does not guess.

Full write-up of what it does and how it was built: [`docs/WEBSITE-DOCUMENTATION.md`](docs/WEBSITE-DOCUMENTATION.md) ([PDF](docs/NewzWale-Documentation.pdf)).

## Features

| | |
|---|---|
| 📰 **Live headlines** | 8 categories, 13 languages, cached and RSS-backed for resilience |
| ✅ **Fact Check Explorer** | 3-stage pipeline — certified lookup → web search → AI reasoning over real evidence only |
| 🔖 **Save articles** | Bookmark any story, browse them in a slide-in drawer — no account needed |
| 🎛️ **Customize topics** | Show or hide homepage sections to match what you read |
| 📈 **Live market ticker** | Sensex/Nifty — hides itself rather than ever showing a stale number |
| 🌗 **Dark mode** | Full token-based theme, not a bolted-on toggle |
| ♿ **Accessibility-tested** | WCAG contrast pairs enforced in CI, not just eyeballed |

## Tech stack

| | |
|---|---|
| **Framework** | [Astro](https://astro.build) (SSR) |
| **Hosting** | [Cloudflare Workers](https://workers.cloudflare.com) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com), token-based design system |
| **Cache** | Cloudflare KV |
| **AI** | Workers AI (`llama-3.1-8b-instruct-fp8`) for grounded fact-check reasoning |
| **News data** | [NewsData.io](https://newsdata.io), with an RSS fallback |
| **Fact-check sources** | [Google Fact Check Tools](https://toolbox.google.com/factcheck/apis) + [Tavily Search](https://tavily.com) |
| **Tests** | [Vitest](https://vitest.dev) — 131 tests, including an automated WCAG contrast check |

## Getting started

**Requirements:** Node ≥ 22.12, a [Cloudflare account](https://dash.cloudflare.com/sign-up) for deployment.

```bash
git clone https://github.com/Yrathore97/NewzWale.git
cd NewzWale
npm install
```

Copy the env template and add your API keys for local development:

```bash
cp .dev.vars.example .dev.vars
```

```dotenv
NEWSDATA_API_KEY=          # newsdata.io
GOOGLE_FACTCHECK_API_KEY=  # Google Fact Check Tools API
TAVILY_API_KEY=            # tavily.com
```

Then:

```bash
npm run dev       # local dev server → localhost:4321
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Build, then run under `wrangler dev` (closer to production) |
| `npm test` | Run the Vitest suite |
| `npx astro check` | Type-check the whole project |
| `npm run deploy` | Build and deploy to Cloudflare Workers |

## Deployment

Deployed as a Cloudflare Worker via [`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/). Bindings (KV cache, Workers AI, static assets) are declared in `wrangler.jsonc`; secrets are set with `wrangler secret put` and never committed. CI (`.github/workflows/deploy.yml`) runs tests, type-checks, and a full build on every push and PR to `main` — no bypassed gates.

## Project structure

```
src/
├── components/    # Astro components (Navbar, ArticleCard, FactCheckWidget, ...)
├── layouts/       # Shared page shell
├── lib/           # News fetching, fact-check pipeline, caching, rate limiting
├── pages/         # Routes, incl. src/pages/api/* for news/factcheck/ticker
└── styles/        # Tailwind v4 design tokens (global.css)
tests/             # Vitest suite, mirrors src/lib structure
docs/              # Full product & build documentation
```

## Documentation

- [`docs/WEBSITE-DOCUMENTATION.md`](docs/WEBSITE-DOCUMENTATION.md) — full product overview, architecture, and build narrative
- [`DESIGN.md`](DESIGN.md) — design system: tokens, color contract, dark mode, spacing
- [`PROGRESS.md`](PROGRESS.md) — living build log and current gotchas

## License

No license file yet — all rights reserved by default. Add one if you intend to open-source this.
