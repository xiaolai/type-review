# TYPE · [type.review](https://type.review)

A typing-practice web app that **adapts to you** and **stays out of your way** — no account, no server, no telemetry.

> Adaptive letter-unlock + benchmark runs + bring-your-own text.

## What you get

- **Adaptive mode** — the app teaches you a small alphabet, then unlocks more letters as you get fast and accurate. Drilling weak keys without thinking about it.
- **Benchmark mode** — runs on real prose, ended by either word count or a timer (configurable).
- **Real text to type** — a curated library of public-domain quotes and short passages, your own `.txt` / `.md` uploads, or paste a one-off paragraph via the *custom text* affordance.
- **Per-key + per-finger stats** — a stats dashboard with per-source WPM trends, finger speed/error breakdown, daily-run streaks, and milestone tracking. Every run feeds the same model regardless of mode.
- **An on-screen keyboard** (optional) — colour-coded by your per-key mastery, with live press-state. Mac and Windows layouts. QWERTY, Colemak, Dvorak keymaps.
- **Mechanical-keyboard sounds** (optional) — synthesised mechvibe + soft packs, plus a real-sample typewriter pack. Synth packs generate on-device with Web Audio.
- **Sharable results** — `copy share link` on Results emits a `#/share/<payload>` URL; recipients see a read-only card of the run.
- **Long-form in-app reading** — the *Why typing matters* essay (and any future essays under `public/articles/<slug>/article.md`) renders as part of the app.
- **Four themes** — dark, light, sepia, high-contrast. sRGB fallbacks for pre-2023 browsers.
- **Your data, on your device** — IndexedDB, no account. One click exports a JSON backup; one click wipes it.

## Try it

[type.review](https://type.review) — it's a single page that loads, no sign-up, and starts working.

## Privacy

- No analytics, no telemetry, no cookies.
- No third-party fonts at runtime. The CSS hints at Geist + Geist Mono but the app ships zero font files — if the user agent doesn't already have them, the system-font fallback chain renders the page; no font request is ever made.
- Your typing history lives in your browser's IndexedDB. The app never sends it anywhere.
- If you upload your own text in the library, it stays in IndexedDB. It's never uploaded.

See the in-app `#/about` page for the full privacy summary.

## Keyboard shortcuts

- **Type** — just type. The app captures everything that's not a modifier.
- **Tab** — start with fresh text (new passage).
- **Enter** on the results screen — start the next run.
- **Esc** — never used by the app; reserved for your OS / browser.

For a deeper walkthrough of modes, settings, scoring, and the source picker, see [`#/guide`](https://type.review/#/guide) (or the catalog of everything at [`#/features`](https://type.review/#/features)).

## For contributors

Everything below is for people working on the app itself.

### Stack

SolidJS + TypeScript (strict) · Vite · Vitest + jsdom · Biome · pnpm.
The only runtime dep is `solid-js`.

### Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # full Vitest suite
pnpm test:coverage
pnpm typecheck
pnpm lint         # Biome
pnpm lint:fix
pnpm build        # tsc --noEmit && vite build → dist/
pnpm preview      # serve dist locally
```

### Architecture in one sentence

A pure TypeScript **engine** (typing loop, metrics, adaptive letter-unlock planner, corpus, session orchestrator) sits at the bottom; thin **io** adapters (DOM input bus, IndexedDB persistence, Web Audio sounds) sit in the middle; a **SolidJS UI** sits on top. The hot keystroke loop never flows through reactive state — keystrokes mutate a plain `Session` and the UI subscribes to RAF-batched snapshots.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for layer rules, the data flow, and the corpus seam.

### Deployment

[type.review](https://type.review) is served by **Cloudflare Pages**. To redeploy after a build:

```bash
pnpm build
pnpm dlx wrangler pages deploy dist --project-name=type-review --branch=main
```

(Auth via `CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY` env vars, or `CLOUDFLARE_API_TOKEN`.)

The repo ships header policies for Netlify / Cloudflare Pages / Vercel:

- **Content-Security-Policy**: `default-src 'none'` baseline, only same-origin scripts/styles, no inline anything, `frame-ancestors 'none'`
- **COOP/COEP**: `same-origin` + `require-corp` (enables full-resolution `performance.now()`)
- **Permissions-Policy**: deny camera / microphone / geolocation / payment / usb
- **X-Frame-Options**: `DENY` · **X-Content-Type-Options**: `nosniff` · **Referrer-Policy**: `no-referrer`

For Apache / Nginx / S3+CloudFront, translate the same policy to your host. Subresource Integrity is intentionally not configured — all assets are served same-origin.

### Identifiers used on the client

| Surface | Value | Notes |
|---|---|---|
| Package name | `type-review` | `package.json` |
| IndexedDB database | `type-review` (v2) | object stores: `profile`, `user-corpus` |
| localStorage keys | `type-review:theme`, `type-review:has-saved-profile`, `type-review:show-keyboard`, `type-review:keyboard-layout`, `type-review:sound-pack`, `type-review:sound-volume`, `type-review:corpus-channel` | preferences only — no PII |
| BroadcastChannel | `type-review` | cross-tab "another tab saved" notification |
| Console log prefix | `type-review: <stage> failed` | from `src/ui/log.ts` |

These are every string a user-agent sees from this app. None of them surface in the UI; the visible brand is **TYPE**.

### Contributing

This codebase optimises for **clarity over cleverness** and **fail-loud invariants**. Before opening a PR:

1. `pnpm typecheck && pnpm lint && pnpm test` — all must pass (CI enforces).
2. Don't destructure SolidJS `props` (breaks reactivity). Read via `props.x` inside JSX.
3. Don't mutate `session.profile` directly — route through `Session.updateSettings` (the only validated write path from UI to engine).
4. Layer purity is checked by `src/layer-purity.test.ts` — `engine` may not import `io` or `ui`; `io` may not import `ui`.

### License

[MIT](./LICENSE). Bundled corpus content (quotes + code snippets) is curated from public-domain sources plus short fair-use quotation snippets; each entry carries its own `license` field — see `LICENSE` and `src/io/corpus/data/`.
