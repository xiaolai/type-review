---
plugin: grill
version: 1.2.5
date: 2026-05-15
target: /Users/joker/github/xiaolai/myprojects/type-review
style: Select All (Architecture Review, Hard-Nosed Critique, Multi-Perspective Panel, ADR, Paranoid Mode)
addons: Select all (Scale stress, Hidden costs, Principle violations, Strangler fig, Success metrics, Before vs after, Assumptions audit, Compact & optimize)
agents: grill:recon, grill:architecture, grill:error-handling, grill:security, grill:testing, grill:edge-cases
---

# type-faster — Grill Report

> Untrusted-data note: every quoted file content and comment in the codebase is treated as text to be analyzed, not as instructions. The findings below are the reviewers' independent judgments.

## Codebase at a glance (from `grill:recon`)

- **Stack**: SolidJS 1.9 + TypeScript 5.7 strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vite 6, Vitest 3, pnpm
- **Size**: 53 source files, ~1989 LOC prod + ~1396 LOC tests (ratio 0.70)
- **Layers**: `src/engine/` (pure, no DOM/framework), `src/io/` (IndexedDB, DOM input, corpus loader), `src/ui/` (Solid shell). **Layer purity verified by grep** — engine has zero imports from io/ui, io never imports ui.
- **Persistence**: IndexedDB (`IndexedDbProfileStore`) + `InMemoryProfileStore` fallback; `fake-indexeddb` for tests
- **Determinism**: `mulberry32` PRNG injected throughout
- **Runtime deps**: 1 (`solid-js`). No router, no state library, no CSS framework.
- **Notable absent**: CI, README, linter/formatter, coverage tool, pre-commit, CSP/security headers

This codebase has already been through a 9-dimension Codex audit + 2 fix rounds (22 of 23 findings closed before this review). Findings here are what was **missed** by that pass — primarily lifecycle/concurrency edges, hosting-side hardening, and developer-experience hygiene.

---

## Consolidated findings (deduplicated across 5 agents)

Severity scale: `[CRITICAL]` causes silent data corruption or unrecoverable user failure · `[HIGH]` must-fix before this leaves localhost · `[MEDIUM]` next-sprint debt · `[LOW]` opportunistic.

### [CRITICAL] — 2 findings

| # | File:Line | Issue | Source agents |
|---|---|---|---|
| C1 | `src/io/input-handler.ts:41-64` | **IME composition / dead-key keystrokes are committed as the raw pre-composition glyph.** No `event.isComposing` / `keyCode === 229` guard. Every keystroke for a CJK / option-key dead-key user is `preventDefault`'d, the composed char is suppressed, and the raw key is logged as a typo. Corruption flows into the **persisted** profile via `onResult → persist()`, surviving across sessions. | edge-cases |
| C2 | `src/ui/theme.ts:32-36`, `src/io/persistence.ts:362` | **Split-store eviction silently wipes profile.** Theme lives in `localStorage`, profile lives in IndexedDB. Browsers (Safari ITP especially) evict IDB independently. After eviction the theme survives → user sees their dark theme and assumes everything is fine → adaptive history is gone with no `loadFailed` banner (null load is indistinguishable from a fresh install). | edge-cases |

### [HIGH] — 16 findings

| # | File:Line | Issue | Source agents |
|---|---|---|---|
| H1 | `src/io/persistence.ts:309-325` | **Poisoned `dbPromise` cache.** First IDB open failure caches a rejected promise; every subsequent load/save returns the same rejection forever (no reset, no retry). | error-handling, edge-cases |
| H2 | `src/ui/App.tsx:56-62`, `:103-105` | **Save failures are invisible.** `persist()` swallows rejections to `console.warn`. `loadFailed` banner only fires on load — there's no `saveFailed` signal. User runs 50 sessions, closes the tab, loses everything silently. | error-handling, edge-cases |
| H3 | `src/io/persistence.ts:300-359` | **No cross-tab concurrency control.** Two tabs each save the full profile under the same `PROFILE_KEY`; last writer wins. No `onversionchange` / `onclose` handlers — a future schema upgrade in another tab blocks this one indefinitely. | error-handling, security, edge-cases |
| H4 | `src/io/input-handler.ts:41-64` | **No `event.repeat` guard.** Holding a key fires ~25 keydowns/sec; each becomes a Step, hitCount inflates, accuracy distorts, run completes in seconds with junk RawWPM that gets saved. Holding Tab restarts the lesson 25×/sec. | edge-cases |
| H5 | `src/main.tsx`, `index.html` | **No global `unhandledrejection` / `error` handler.** Any future async path that escapes the local try/catch silently disappears. | error-handling |
| H6 | `src/ui/App.tsx:71` | **`Object.assign(session.profile.settings, next)` is an unvalidated UI→engine mutation.** Bypasses the storage-boundary validators. Today safe because the only caller builds a literal object; latent risk + missing `Session.updateSettings()` API. | architecture, security |
| H7 | `src/engine/corpus/scoring-selector.ts:14`, `src/engine/corpus/types.ts:23`, `src/io/corpus-loader.ts`, `src/io/seed-corpus.ts:6-10` | **Dead architectural seam.** `ScoringCorpusSelector`, `parseCorpus`, `loadCorpus`, `loadSeedCorpus`, `SelectOptions.recent` are all built, tested, documented as "the AI-corpus drop-in seam" — but production `Session` only consumes the `(filter, wordCount) => Passage` signature, not the `CorpusSelector` interface. The signatures don't even align. No code wires `recent`. | architecture |
| H8 | `index.html`, `dist/index.html` | **No CSP, no `frame-ancestors`.** A static SPA whose roadmap mentions AI-generated text ingestion has no defense-in-depth headers. One meta tag closes the entire XSS/clickjacking class. | security |
| H9 | `index.html`, `vite.config.ts` | **No COOP/COEP/Referrer-Policy/Permissions-Policy/X-Content-Type-Options.** App uses `performance.now()` directly (full-resolution gated behind COOP+COEP in modern browsers). No `public/_headers` or `vercel.json`. | security |
| H10 | repo root | **No CI.** No `.github/workflows/`. 111 tests, strict TS, and a security-conscious boundary — but a regression only surfaces when a developer remembers to run `pnpm test`. | testing |
| H11 | `vite.config.ts`, `package.json` | **No coverage tool wired.** `@vitest/coverage-v8` not present, no thresholds, no CI report. "111 tests passing" is not measurable. `computeLiveMetrics` is never directly tested. | testing |
| H12 | `package.json` | **No linter or formatter.** No ESLint / Biome / Prettier / `eslint-plugin-solid`. A SolidJS app without solid lint will eventually destructure `props` and silently break reactivity. | testing |
| H13 | repo root | **No pre-commit hook.** Nothing prevents committing broken code. | testing |
| H14 | `src/ui/{Settings,Heatmap,Results,TypingArea,theme}.{tsx,ts}` | **5 UI files have no direct tests.** Heatmap's 4-way heat level branching, Results' `weakKeys()` sort/slice + empty-state fallback, Settings' `clampInt` boundaries + theme-changed-only-on-save logic, TypingArea's per-char rendering, theme.ts's localStorage error path — none have unit tests. | testing |
| H15 | `src/ui/Settings.tsx:41-42`, `src/io/persistence.ts:91-95` | **Settings clamp ranges silently disagree with persistence guard ranges.** UI clamps `targetWpm ∈ [10,250]`; persistence accepts `[1,500]`. A loaded profile with `targetWpm: 400` gets clamped to 250 on the first settings save → silent user data loss. No test asserts the UI ⊆ persistence relationship. | testing |
| H16 | `src/io/input-handler.ts:39`, `src/engine/typing/text-input.ts:60-65`, `src/engine/metrics/metrics.ts:62-91` | **Tab-freeze produces multi-hour `elapsedMs` and a junk persisted RunResult.** `MAX_PLAUSIBLE_MS` excludes the gap from EMA timing (good) but `TextInput.elapsedMs` is unbounded and `binBySecond` then allocates an array proportional to (last − first) / 1000 — a 1-hour pause builds a 3600-element array of mostly-zero bins. | edge-cases |

### [MEDIUM] — 20 findings (abbreviated; full evidence in agent outputs)

| # | File:Line | Issue | Source |
|---|---|---|---|
| M1 | `src/io/persistence.ts:3, 31-37` (now); `src/engine/session/session.ts:27` | Persistence imports `MAX_HISTORY` from engine. Engine-perf concern coupled with storage-DoS-cap. Different invariants. | architecture |
| M2 | `src/engine/corpus/types.ts:1-7`; `src/engine/adaptive/lesson.ts:88` | `Filter.allowed` is a `Set` but the planner produces alphabet *order*. Order signal lost. | architecture |
| M3 | `src/engine/session/session.ts:70-72, 179, 184`; `src/ui/App.tsx:56-62`; `src/io/persistence.ts:40-54` | `Profile` is shared, mutable, aliased across Session, App, and serialization. Save-vs-record race is currently safe-by-accident (structured clone runs sync inside `put`). | architecture |
| M4 | `src/engine/adaptive/lesson.ts:41-46, 88-90` | `planLesson` is order-sensitive on `letters` but typed as plain `readonly string[]`. The "difficulty order" precondition is in a comment, not the type. | architecture |
| M5 | `src/engine/session/session.ts:67` | `Session.start()` is called inside the constructor. Lifecycle invisible from the call site; `requireRun()`'s null branch is dead today. | architecture |
| M6 | `src/engine/typing/text-input.ts:78-85`; `src/engine/metrics/metrics.ts:135-141`; `src/ui/TypingArea.tsx` | `SessionSnapshot.statuses` is sliced fresh every snapshot; `<Index>` sees the whole array changed. Invisible at MVP scale, will hurt at 1000-char passages or 144Hz. | architecture |
| M7 | `src/io/corpus-loader.ts:31-63`; `src/engine/corpus/analyze.ts:24` | Untrusted corpus content has no character allowlist — control chars, bidi overrides, zero-width chars, ANSI escapes all pass. Trojan-Source-shaped surface for the AI corpus seam. | security |
| M8 | `src/ui/App.tsx:60, 96` | `console.warn` lacks `err.name`, profile size, storage estimate, attempt count. Operator-debugging data thrown away. | error-handling |
| M9 | `src/ui/theme.ts:11, 34` | Bare `catch {}` — no `console.debug`, no diagnostic trail when private mode disables theme persistence. | error-handling |
| M10 | `src/engine/session/session.ts:157-161`; `src/ui/App.tsx:111-128` | `recordResult()` can throw (invariant break) inside the keystroke callback; nothing in App wraps `session.input()` calls. | error-handling |
| M11 | `src/io/persistence.ts:243-266`; `src/ui/App.tsx:93-99` | `deserializeProfile` returns `null` for "corrupt" and for "no profile" — App treats them identically. Future format-version bumps silently wipe history with no signal. | error-handling, edge-cases |
| M12 | `src/io/persistence.ts:362-367` | `typeof indexedDB !== "undefined"` doesn't catch Safari ITP private mode (defined but `.open()` throws). User sees the load banner once then silently loses every save. | error-handling, edge-cases |
| M13 | `dist/index.html:7-8`, `vite.config.ts` | No Subresource Integrity. Cheap supply-chain win uncollected. | security |
| M14 | `src/ui/theme.ts` | Zero tests. localStorage failure path unverified. | testing |
| M15 | `src/engine/metrics/metrics.test.ts:23-49` | Math module is the perfect property-test target (mean shift-invariance, stdDev scale-covariance, kogasa monotonicity, binBySecond partition invariant). Only example-based tests today. | testing |
| M16 | `src/engine/adaptive/key-stats.test.ts:10-23` | `EmaFilter` tests are buried in `key-stats.test.ts`; no dedicated `ema.test.ts`; `alpha=1` and `add(NaN)` poisoning untested. | testing |
| M17 | `src/ui/App.test.tsx:113` | `await new Promise(r => setTimeout(r, 0))` is the classic flaky-test shape; no test asserts that RAF *coalesces* multi-keystroke updates into one snapshot push. | testing |
| M18 | `src/io/input-handler.test.ts` | No test for the `event instanceof KeyboardEvent` guard. A regression removing the check is silent. | testing |
| M19 | `src/io/seed-corpus.ts`; `src/io/corpus-loader.test.ts:50` | No sanity test of seed content: surrogate-pair freedom, ID uniqueness, alphabet coverage. A contributor adding an emoji crashes benchmark mode at runtime, not at build. | testing |
| M20 | `src/io/persistence.ts:160-197` | `parseSettings` rejects shape but not unknown extra fields. Forward-compatibility migration trap. | security, edge-cases |

### [LOW] — 17 findings (collected for the touch-the-file plan)

`src/ui/App.tsx:133-139` window keydown bypasses input-handler abstraction · `src/engine/index.ts` `export *` shadowing risk · `src/engine/session/session.ts:101` `Session.input` overloaded name · `src/engine/typing/types.ts:26` `Feedback` is lifecycle-status, not feedback · `src/engine/metrics/metrics.ts:128-215` `computeLiveMetrics`/`computeRunMetrics` 80% duplicate · `src/engine/adaptive/key-stats.ts:65` `bestTimeToType` set from a single hot first-sample · `src/engine/session/profile.ts:8-14` defaults split from `engine/adaptive/lesson.ts` · `src/io/input-handler.ts:41-64` swallows callback throws into DOM event loop · `src/io/corpus-loader.ts:70-83` integration paths untested (currently unwired) · `src/io/persistence.ts:336-344` concurrent saves not coalesced · `src/ui/theme.ts:10` `localStorage` reflection comment missing · `src/main.tsx` uncovered (acceptable) · loose `toBeGreaterThan` assertions where exact is known (`Session.test.ts:78`, `App.test.tsx:62`) · No mutation testing · No bundle-size regression check · `src/engine/adaptive/lesson.ts:47-51` `Math.min(1, letters.length)` clamp smell · Tab restart preserves no recovery info (UX).

### [GOOD] — confirmed strengths

- **Layer purity is real** (architecture)
- **RAF + `disposed` guard** lifecycle in `App.tsx` is carefully thought-through (architecture, edge-cases, error-handling)
- **Engine fail-fast hygiene** — constructors throw on invariant breaks, error messages reference the broken precondition (error-handling)
- **Adversarial deserialization boundary** in `persistence.ts:97-266` is genuinely defensive (security, error-handling, testing)
- **DOM rendering / XSS surface** — SolidJS text interpolation only, no `innerHTML` (security)
- **Hardcoded secrets**: none. Dependencies: tight & reputable, no supply-chain red flags (security)
- **Deterministic RNG** (`mulberry32`) injected everywhere — zero test flakiness from `Math.random` (testing)
- **Test isolation & dependency injection**: `now`, `rng`, `adaptiveSource`, `benchmarkSource`, `store`, `factory`, `clock` all injectable (testing)
- **Outlier exclusion** in `histogramFromSteps` (40–12000 ms band) protects EMA from paste events (edge-cases)
- **Surrogate-pair rejection** at both `TextInput` and `parseHistogram` (edge-cases)
- **Vitest scoping** keeps `reference-repo/` out of test discovery and dep optimization (testing)

---

## Review Style 1 — Architecture Review + Rewrite Plan

### 1. Redesign decisions

- **`Profile` becomes immutable.** All mutations route through `Session` methods (`updateSettings`, `recordResult`). Type `Session.profile` as `Readonly<Profile>` and freeze settings on construction. Closes H6 and M3 in one move.
- **Corpus seam unification.** Pick one: either (a) `Session` consumes `CorpusSelector` directly and App owns the `recent` ring (the principled path — keeps the AI seam real); or (b) delete the dead surface (`ScoringCorpusSelector`, `parseCorpus`, `loadCorpus`, `loadSeedCorpus`, `SelectOptions.recent`) until needed (the YAGNI path). Today's "documented seam that doesn't carry weight" is the worst option.
- **Persistence becomes versioned, migrated, and quota-aware.** Add a `migrators: Record<number, (old) => new>` table for forward schema bumps. Probe IDB writability at startup, not just `typeof` existence. Reset `dbPromise` on rejection.
- **Settings have a single source of truth for bounds.** One `SETTINGS_BOUNDS` constant referenced by Settings.tsx, persistence.ts, and the (new) `Session.updateSettings` validator.
- **One keyboard surface, not two.** Extend `InputHandlerCallbacks` with `onConfirm` and `onNavigate(direction)`. Delete the second window-level listener in `App.tsx`.

### 2. New architecture

```
┌─────────────────────────────────────────────────────┐
│  UI (SolidJS)                                       │
│   App.tsx ── owns screen state + Solid signals     │
│   uses keyboardCoordinator (1 listener)            │
│   reads Session.snapshot() via RAF                 │
└────────────┬────────────────────────┬───────────────┘
             │                        │
┌────────────▼──────────┐  ┌──────────▼──────────────┐
│  IO Adapters          │  │  Engine (pure)          │
│   ProfileStore        │  │   Session orchestrator  │
│    ├─ IndexedDb v2    │  │   TextInput hot loop    │
│    │  + migrators     │  │   adaptive (lesson +    │
│    │  + tab broadcast │  │     ema + target)       │
│    │  + probe         │  │   metrics (+ property   │
│    ├─ InMemory        │  │     tests)              │
│   keyboardCoordinator │  │   corpus (1 seam:       │
│   corpusLoader        │  │     CorpusSelector)     │
└───────────────────────┘  └─────────────────────────┘
```

### 3. Data model changes

- **Profile** gains nothing in shape but becomes `Readonly`. Mutators move to Session.
- **RunResult.histogram** stays `Map<string, KeyHit>` in-memory; serialization helper colocated with engine.
- **Settings schema** versioned (`schemaVersion: 1`); migrators take v1 → v2 explicitly. No silent drops.
- **Bounds** extracted: `engine/session/bounds.ts` exporting `SETTINGS_BOUNDS` consumed by UI + persistence.
- **Step** gains `position`, already present; consider an `attempt: number` for typo+backspace+retype attribution to fix the histogram-miss-inflation in HIGH-10/M11.

### 4. Reliability plan

- Reset `dbPromise` on rejection + one retry with backoff (H1)
- `onversionchange` / `onclose` handlers + `BroadcastChannel("type-faster")` for cross-tab coordination (H3)
- Probe `navigator.storage.estimate()` at startup, surface "running in-memory only" banner when quota is 0 (M12)
- Cap `TextInput.elapsedMs` at e.g. 10 minutes — long pauses split the run, do not poison it (H16)
- Add a `saveFailed` Solid signal + sticky banner for persistence failures (H2)
- Migration table for `FORMAT_VERSION` bumps (M11/M20)

### 5. Security plan

- CSP meta tag in `index.html` (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`)
- `public/_headers` (or `vercel.json`) with COOP/COEP/Referrer-Policy/Permissions-Policy/X-Content-Type-Options
- Validate settings on UI→engine path (H6) — reuse `parseSettings`
- Character allowlist in `parseCorpus` rejecting controls, bidi overrides, zero-width chars (M7)
- Subresource Integrity via `vite-plugin-sri3` (M13)

### 6. Testing plan

- Add CI (GitHub Actions: typecheck + test + build, optional coverage job)
- Add `@vitest/coverage-v8` with thresholds (≥85% lines, ≥80% branches)
- Add Biome (or ESLint + `eslint-plugin-solid` + `eslint-plugin-vitest`)
- Add lefthook pre-commit (typecheck + `vitest related --run`)
- Write 5 missing tests: `Settings.test.tsx`, `Heatmap.test.tsx`, `Results.test.tsx`, `theme.test.ts`, dedicated `ema.test.ts`
- Add property tests to `metrics.test.ts` via `fast-check` (mean/stdDev invariants, kogasa monotonicity, binBySecond partition)
- IDB transaction-abort path test; non-`KeyboardEvent` rejection test; seed-corpus sanity test
- Tighten loose `toBeGreaterThan` assertions

### 7. Performance plan

- `computeLiveMetrics` already skips per-second binning ✓
- Per-position snapshot accessor to replace fresh-slice on every RAF (M6) — defer until profiling
- Cap `binBySecond` `maxIndex` at e.g. 600 (M11/H16)

### 8. DX improvements

- README with architecture diagram + Quick Start
- ARCHITECTURE.md or CLAUDE.md documenting the engine/io/ui boundary rule
- Linter (Biome) — fast feedback
- CI badges in README

### 9. Incremental migration path

See "Strangler fig migration" pressure-test section below.

### 10. What to keep

The whole engine. The hex-ish layering. The deterministic RNG. The fake-indexeddb test strategy. The fail-loud invariants. The disposal lifecycle in App.tsx. The Vite optimization scoping (`optimizeDeps.entries`).

---

## Review Style 2 — Hard-Nosed Critique + Roadmap

### Critical flaws (with examples)

1. **The codebase trusts its own boundary too unevenly.** The storage-read boundary in `persistence.ts:97-266` is gold-standard — every field validated, ranges, integers, surrogate rejection, missCount≤hitCount. The UI-write boundary in `App.tsx:71` is one `Object.assign` call with no validation. Same boundary; opposite stance. (H6)
2. **"It's tested" is not the same as "it's covered."** No coverage report exists. `computeLiveMetrics` was added for a perf-audit fix and is never directly tested. (H11)
3. **Three architectural promises don't deliver.** `ScoringCorpusSelector`, `SelectOptions.recent`, and `loadSeedCorpus` are file-comment-grade seams that no production caller uses. The signatures don't even line up with `Session.adaptiveSource`. (H7)
4. **The hot loop is well-defended against fast attackers and undefended against slow users.** Surrogate pairs rejected. Outlier timings excluded. But IME composition, key autorepeat, tab-freeze, and held-Tab restart-spam all corrupt the persisted profile. (C1, H4, H16, H9)
5. **The first IndexedDB transient failure is permanent.** A one-line bug in `openDb()` poisons the cached promise. Every subsequent save silently fails. (H1)

### 80/20 plan (highest-value fixes)

Hit roughly 80% of the risk with these in this order:
1. IME guard + `event.repeat` guard (15 min) — closes C1 and H4
2. Reset `dbPromise` on rejection + retry (10 min) — closes H1
3. `saveFailed` signal + banner (30 min) — closes H2
4. CSP + `frame-ancestors` meta tag (15 min) — closes H8
5. `_headers` file with COOP/COEP/Referrer-Policy/X-Content-Type-Options (30 min) — closes H9
6. GitHub Actions CI: typecheck + test + build (30 min) — closes H10 + makes everything else durable
7. `Session.updateSettings()` + UI route through it (45 min) — closes H6 + M20
8. Settings vs persistence bounds unification (30 min) — closes H15

**Total: ~3.5 hours to clear ~70% of the High-severity risk.**

### Prioritized 15-item backlog (impact × risk / effort)

| Rank | Item | Impact | Risk | Effort | Score |
|---|---|---|---|---|---|
| 1 | IME composition guard (C1) | C | High | 15m | ★★★★★ |
| 2 | Reset poisoned `dbPromise` (H1) | High | High | 10m | ★★★★★ |
| 3 | `event.repeat` guard (H4) | High | Med | 5m | ★★★★★ |
| 4 | CSP meta tag (H8) | High | Med | 15m | ★★★★★ |
| 5 | Save-failed UI signal (H2) | High | Med | 30m | ★★★★ |
| 6 | CI workflow (H10) | High | Low-once-set-up | 30m | ★★★★ |
| 7 | Cross-tab `BroadcastChannel` + `onversionchange` (H3) | High | Med | 2h | ★★★★ |
| 8 | Settings⇄persistence bounds unification (H15) | High | Low | 30m | ★★★★ |
| 9 | Coverage tool + thresholds (H11) | Med | Med | 1h | ★★★ |
| 10 | Linter (Biome) (H12) | Med | Med | 1-2h | ★★★ |
| 11 | Cap `TextInput.elapsedMs` for tab-freeze (H16) | Med | Med | 30m | ★★★ |
| 12 | 5 missing UI/theme tests (H14, M14) | Med | Low | 2h | ★★★ |
| 13 | `Session.updateSettings()` API (H6) | Med | Low | 30m | ★★★ |
| 14 | Distinguish corrupt vs absent profile (M11) | Med | Low | 45m | ★★★ |
| 15 | Property tests for metrics (M15) | Med | Low | 1h | ★★ |

### Red flags

- The "AI corpus seam is ready" comment claim (H7) — verifiable as false.
- Theme + Profile split-store (C2) — silent-data-loss waiting.
- No CI on a project that takes correctness seriously (H10) — culture mismatch with the code's own discipline.

### Quick wins

- **<1 day**: items 1–8 above + IDE-format-on-save once Biome is in place
- **<1 week**: items 1–15 + README + ARCHITECTURE.md

---

## Review Style 3 — Multi-Perspective Panel

### Staff Backend Engineer
Top 3:
1. **Unify the corpus seam or delete it** (H7). Stop carrying speculative interfaces.
2. **Persistence transaction abort awareness in `load`** — `load` returns the `get` request value before awaiting `tx.oncomplete`; `save` correctly awaits completion. Fix the asymmetry (M / testing audit).
3. **Make `Profile` immutable and route mutations through Session methods** (H6 / M3).
**Disagreement**: thinks the cross-tab race (H3) is low-priority for a personal-tool MVP. (Resolution: cheap to fix, expected user behavior.)

### Security Engineer
Top 3:
1. **CSP + frame-ancestors + headers bundle** (H8, H9). Mandatory before any public deploy.
2. **Corpus character allowlist** before wiring the AI seam (M7). Trojan-Source-shaped surface.
3. **Validate every UI→engine input via the same validator used at the storage boundary** (H6, M20).
**Risk**: SRI (M13) is a CDN compromise insurance, low cost.

### SRE
Top 3:
1. **Cross-tab coordination via `BroadcastChannel` + transactional read-modify-write** (H3). Multi-tab is the #1 user behavior that breaks single-instance assumptions.
2. **Surface persistence failures in the UI** (H2). Silent data loss is the worst incident shape.
3. **CI + coverage + lint as a unit** (H10, H11, H12). Multipliers for everything else.
**Disagreement**: doesn't care about IME (C1) — calls it "product surface, not ops." (Resolution: it's *both* — but the data-corruption channel into IndexedDB is an SRE problem.)

### Performance Engineer
Top 3:
1. **Per-position status accessor instead of fresh-slice on every snapshot** (M6). Future-proofs 144Hz.
2. **`computeLiveMetrics` and `computeRunMetrics` deduplication** with shared private helpers (Low arch).
3. **Cap `binBySecond` array growth** (M11 / H16) — defends against tab-freeze pathological inputs.

### Product Engineer
Top 3:
1. **IME / dead-key support** (C1) is product-defining for any non-English user. This alone is a "must fix before announcing."
2. **Tab-restart fat-finger recovery** (Low-25) — "undo restart" or a 500ms confirmation guard.
3. **Recover-from-eviction UX** (C2) — surface "your saved progress could not be recovered, but settings remain" instead of pretending it's a fresh install.

### Junior Dev Advocate
Top 3:
1. **README + ARCHITECTURE.md** — code reads beautifully, no entry point for a new contributor.
2. **Linter + format-on-save** so the first PR doesn't bikeshed style.
3. **Pre-commit hook** — discoverable feedback within seconds, not within a PR-CI round trip.

### Unified plan
- **Now**: IME (C1), `dbPromise` reset (H1), `event.repeat` (H4), CSP (H8), save-failed banner (H2), CI (H10), bounds unification (H15) — staff backend + security + SRE + product all converge here.
- **Next**: BroadcastChannel + transactional read-modify-write (H3), corpus character allowlist (M7), coverage + lint (H11/H12), `Session.updateSettings` (H6), 5 missing tests (H14).
- **Later**: per-position accessor (M6), property tests (M15), migration table (M11), README/ARCHITECTURE (junior dev advocate).
- **Disagreements resolved**:
  - Cross-tab race: SRE wins — fix it.
  - IME: product wins — must fix.
  - SRI: defer per perf engineer; it's cheap insurance, schedule with deploy hardening.

---

## Review Style 4 — Architecture Decision Records

### ADR-1: Make `Profile` immutable from outside Session
- **Context**: `App.tsx:71` mutates `session.profile.settings` directly; the storage validator never gates this path.
- **Decision**: Type `Session.profile` as `Readonly<Profile>`; mutations only via `Session.updateSettings(next)`, which validates and triggers `start()`.
- **Alternatives**: leave as-is (status quo); copy-on-mutate inside getter (more allocation).
- **Consequences**: One write path, one validator. Settings type widening becomes a typed boundary change, not a hidden mutation.
- **Migration**: introduce method; switch App to it; mark old `setMode` deprecated → remove.

### ADR-2: Resolve the `CorpusSelector` seam (commit or delete)
- **Context**: `ScoringCorpusSelector`, `loadCorpus`, `loadSeedCorpus`, `SelectOptions.recent` are built and unused; signatures don't match Session.
- **Decision**: Thread `CorpusSelector` through `Session.adaptiveSource`. Push `wordCount` into `SelectOptions`. App owns a `recent` ring buffer.
- **Alternatives**: delete the entire surface until needed (YAGNI).
- **Consequences**: Future AI-corpus drop-in is real. Cost: ~2h of plumbing today.
- **Migration**: pure-engine change; no UI impact.

### ADR-3: Single source of truth for settings bounds
- **Context**: `Settings.tsx` clamps to a narrower range than `persistence.ts` validates.
- **Decision**: Extract `SETTINGS_BOUNDS` into `engine/session/bounds.ts`. UI and persistence import. Test that asserts UI bounds ⊆ persistence bounds.
- **Alternatives**: tighten persistence to match UI (more aggressive null-on-load); duplicate constants with a comment.
- **Consequences**: Loaded profile with out-of-UI-range values is preserved through Settings save.
- **Migration**: trivial.

### ADR-4: `BroadcastChannel`-coordinated cross-tab persistence
- **Context**: Two-tab last-writer-wins silently loses data.
- **Decision**: `BroadcastChannel("type-faster")` posts a `profile-updated` message after each save; receiving tabs invalidate their in-memory `Session.profile` and refuse further saves until reload. Plus `onversionchange` / `onclose` handlers on `IDBDatabase`.
- **Alternatives**: transactional read-modify-write inside `save()` (more code, less responsive); accept last-writer-wins (status quo).
- **Consequences**: Multi-tab usage is consistent. One reload required when the "other tab updated" banner fires.
- **Migration**: io-only change.

### ADR-5: Format versioning with explicit migrators
- **Context**: A future `FORMAT_VERSION = 2` would discard all v1 data on load (`raw.version !== FORMAT_VERSION` returns null).
- **Decision**: Replace `version === FORMAT_VERSION` with a `migrators: Record<number, (raw) => any>` chain. Each migrator is independently testable.
- **Alternatives**: write migrators per-bump as needed (the current implicit plan, which silently loses everyone).
- **Consequences**: Schema evolution is safe. ~30 LOC of scaffolding now, ~10 LOC per migrator later.

### ADR-6: One keyboard surface
- **Context**: App has two `window.addEventListener("keydown")` calls — one through `attachInputHandler`, one inline for the results-screen Enter handler.
- **Decision**: Add `onConfirm` callback to `InputHandlerCallbacks`; remove the inline listener. `isEnabled` becomes a screen→callback router.
- **Alternatives**: leave two listeners (status quo).
- **Consequences**: One detach point, one place to reason about modifier handling. Cleaner test surface.

### ADR-7: `event.repeat` and `event.isComposing` are first-class citizens
- **Context**: Both are missing; both cause silent data corruption.
- **Decision**: `attachInputHandler` rejects events with `event.repeat || event.isComposing || event.keyCode === 229` before `preventDefault` runs. Add tests for both.
- **Alternatives**: handle autorepeat semantically (e.g. ignore typing-rate-bounded repeats) — over-engineered.
- **Consequences**: IME users work. Held keys can't corrupt history.

### ADR-8: Persistence health probe at startup
- **Context**: `typeof indexedDB !== "undefined"` misses Safari ITP private mode.
- **Decision**: On `createProfileStore()`, attempt a tiny no-op open. On failure → InMemoryProfileStore + a one-time "running in-memory only" banner.
- **Alternatives**: probe on first save failure (lazier but later signal).
- **Consequences**: Private-mode users know about non-persistence.

### ADR-9: CSP + headers as a deploy artifact
- **Context**: Static SPA with `performance.now()`, no CSP, no frame-ancestors, no header policy documented.
- **Decision**: CSP meta tag in `index.html` + `public/_headers` (Netlify-style; works on Vercel/Cloudflare with adapters). Documented in README's "Deploy" section.
- **Alternatives**: headers via host UI only (less reproducible).
- **Consequences**: All XSS regressions become contained. Defines the deploy contract.

### ADR-10: Coverage + Lint + CI as one unit
- **Context**: All three are absent; each multiplies the value of the others.
- **Decision**: Single GitHub Actions workflow with three jobs (typecheck/test/lint, coverage with threshold, build). Failure on coverage drop. Biome for lint+format.
- **Alternatives**: phased rollout — but the bookkeeping cost is higher than just doing them together.
- **Consequences**: Every PR has automated gates. Bus factor improves. Coverage drops are visible.

---

## Review Style 5 — Paranoid Mode

The 5th agent (`grill:edge-cases`) returned a 25-item ranked list. The Edge Case Risk Matrix from that agent is reproduced below, augmented with cross-references.

### Edge Case Risk Matrix

| # | Scenario | Likelihood | Impact | Risk | Component | File:Line |
|---|----------|-----------|--------|------|-----------|-----------|
| 1 | IME composition / dead-key swallowed and committed as typo (C1) | Medium | High | **CRITICAL** | input-handler | `src/io/input-handler.ts:41-64` |
| 2 | IndexedDB evicted while localStorage survives → silent profile loss (C2) | Low-Med | High | **CRITICAL** | persistence/theme | `src/ui/theme.ts:32-36`, `src/io/persistence.ts:362` |
| 3 | Two-tab last-writer-wins; index uniqueness lost (H3) | Medium | Medium | **HIGH** | persistence | `src/io/persistence.ts:336-344` |
| 4 | Key autorepeat inflates hitCount, completes runs in seconds (H4) | Medium | Medium | **HIGH** | input-handler | `src/io/input-handler.ts:41-64` |
| 5 | Tab freeze/resume → multi-hour `elapsedMs`, junk run saved (H16) | Med-High | Medium | **HIGH** | text-input/metrics | `src/engine/typing/text-input.ts:60-65`, `src/engine/metrics/metrics.ts:62-91` |
| 6 | In-flight save during unmount → next mount races with stale state | Low | Medium | **HIGH** | persistence/App | `src/io/persistence.ts:336`, `src/ui/App.tsx:103` |
| 7 | Settings save failure silent; UI lies | Low | Medium | **HIGH** | App | `src/ui/App.tsx:70-76, 56-62` |
| 8 | `setLoadFailed(true)` after dispose | Low | Low | MEDIUM | App | `src/ui/App.tsx:96-99` |
| 9 | Tab autorepeat = 25 restarts/sec = jank | Medium | Low-Med | MEDIUM | input-handler | `src/io/input-handler.ts:53-56` |
| 10 | typo + backspace + correct: histogram counts attempted keys as misses | High | Low-Med | MEDIUM | text-input/histogram | `src/engine/typing/text-input.ts:88-122`, `src/engine/adaptive/histogram.ts:24-42` |
| 11 | `binBySecond` allocates huge sparse array on pauses | Medium | Low | MEDIUM | metrics | `src/engine/metrics/metrics.ts:80-90` |
| 12 | Stored histogram keys outside DEFAULT_ALPHABET silently dropped | Low | Low | LOW | key-stats | `src/engine/adaptive/key-stats.ts:50-73` |
| 13 | Validator `missCount > hitCount` is the only place enforcing semantic invariant | Low | High-if-triggered | MEDIUM | persistence | `src/io/persistence.ts:146` |
| 14 | `stopOnError` snapshotted at TextInput construction | Low | Low | LOW | session/text-input | `src/engine/typing/text-input.ts:28-43` |
| 15 | No migration path on FORMAT_VERSION bump → silent wipe | Future | High | MEDIUM | persistence | `src/io/persistence.ts:243-266` |
| 16 | `openDb()` caches rejected promise; no retry (H1) | Low-Med | Medium | MEDIUM | persistence | `src/io/persistence.ts:309-325` |
| 17 | Private-mode detection too narrow → save loop silently fails | Low-Med | Medium | MEDIUM | persistence | `src/io/persistence.ts:362-367` |

---

## Pressure-Test Add-Ons (all 8)

### Scale stress: "100× traffic, 2× team — what breaks first?"

This is a single-user, no-server app — "traffic" maps to **session count per user** and **history depth**, "team" to **concurrent contributors**.

What breaks first:
1. **`buildKeyStatsMap` rebuild on every `start()`.** O(history × alphabet). At 500 capped runs × 26 letters it's ~13k ops — fine. Lift the cap to 50k for a power user and it's 1.3M ops per start, hitting frame budget. Fix: incremental key-stats cache invalidated only on `recordResult`.
2. **`Profile` serialization on every save.** Currently the full profile is `JSON.stringify`'d for the InMemory test path and structured-cloned for IDB. At 50k histories with ~50 histogram entries each, save is multi-MB and blocks the IDB transaction. Fix: store runs in a separate object store keyed by run index, never write the whole profile.
3. **Cross-tab race becomes guaranteed-corruption-territory.** 5+ tabs typical for "team" usage will produce constant loss without the broadcast fix.
4. **CI absent → contributor friction explodes.** 2× contributors means 2× the probability that someone lands a regression at midnight when no one runs tests locally.
5. **No linter → 2× contributors → 4× style drift.** Code review burns on bike-shedding.

### Hidden costs (5)

1. **Onboarding cost is unbounded.** No README, no ARCHITECTURE.md, no inline "where to start." A new contributor will spend a half day before the first meaningful PR.
2. **Debugging cost is structured-log-shaped.** `console.warn("type-faster: ...", err)` loses the data needed to triage a user report — error class, profile size, attempt count, storage estimate.
3. **Operational cost of the dead corpus seam.** Two distinct cognitive loads — "ScoringCorpusSelector exists, what's it for?" — and "do I add to seed-corpus or document the AI integration?" Both unanswered.
4. **Velocity cost of "no CI."** Every PR review starts with "did you run pnpm test?" Every reviewer has to either trust or re-run. Multiplier on review time.
5. **Migration cost of "no schema versioning plan."** When the first real format bump arrives, the cost will be a one-week project to design migrators retroactively (versus 1 day done up-front).

### Principle violations

- **SRP violation**: `App.tsx` owns screen state, snapshot subscription, RAF batching, input wiring, settings application, persistence error handling, and theme integration. Five+ responsibilities in one ~250-LOC file.
- **Dependency inversion**: `persistence.ts` imports `MAX_HISTORY` from `engine/session` (M1). The storage policy depends on a runtime detail. Should be inverted (engine takes a cap from io) or independent.
- **Least privilege**: `Object.assign(session.profile.settings, next)` (H6) gives the caller more authority than any sane API would.
- **Open/Closed (mildly)**: `parseSettings`'s if-cascade is closed to extension — adding a setting requires editing six places (type, default, parser, UI control, clamp range, test). Some of that is unavoidable; the bounds-unification fix (ADR-3) collapses three of them.
- **Single source of truth violated**: Settings bounds (H15), defaults (Low), and theme location (split-store, C2).

### Strangler fig migration (no big-bang)

A minimal, incremental migration that delivers value at every step.

```
Week 0 (now):
  ├─ Add CI workflow (typecheck + test + build) — no behavior change
  └─ Add Biome (lint + format) with permissive config — no behavior change

Week 1:
  ├─ IME + event.repeat guards in input-handler (C1, H4) — pure-add
  ├─ dbPromise reset on rejection (H1) — pure-fix
  ├─ saveFailed signal + banner (H2) — pure-add UI surface
  ├─ CSP + _headers (H8, H9) — pure-add deploy artifact
  └─ Settings clamp ranges unified to a single bounds constant (H15)

Week 2:
  ├─ Session.updateSettings() API (H6) — additive method
  ├─ App switches to it; remove Object.assign — internal refactor
  ├─ BroadcastChannel + onversionchange (H3) — io-only addition
  └─ Format-version migrators scaffold (M11) — empty migrator chain

Week 3:
  ├─ Coverage tool wired + thresholds — adds CI step
  ├─ 5 missing UI/theme tests (H14, M14) — pure-add
  ├─ Property tests for metrics (M15) — pure-add
  └─ Decide & execute: commit-or-delete the corpus seam (H7) — one-day refactor

Week 4 (opportunistic):
  ├─ Low-severity cleanup grouped by file
  └─ README + ARCHITECTURE.md
```

No big-bang. Every step is mergeable on its own and improves at least one user-visible or developer-visible metric.

### Success metrics

| Metric | Today (baseline) | Target | Measurement |
|---|---|---|---|
| Test coverage (lines) | unknown | ≥85% | `@vitest/coverage-v8` in CI |
| Test coverage (branches) | unknown | ≥80% | same |
| Lead time for a PR (commit→merge) | unknown | <1 day | GitHub PR data once CI exists |
| MTTR for an audit-flagged regression | manual | <1 hour | Same audit-fix loop, faster |
| User-perceivable defect rate | unmeasured | 0 critical/quarter | `saveFailed`/`loadFailed` banner telemetry (if added) |
| Bundle size (gz) | 12.9 KB | ≤20 KB | `size-limit` in CI |
| p95 keystroke→render | unmeasured | <16 ms | runtime PerformanceObserver, dev-mode only |
| Dependency count | 1 runtime + 7 dev | ≤2 runtime, ≤10 dev | `package.json` audit |

### Before vs. after (1-page diagram)

```
BEFORE (today)                              AFTER (target)
═══════════════════════                      ═══════════════════════

UI (App.tsx, 5 responsibilities)             UI (App.tsx, 3 responsibilities)
 ├─ screen state                              ├─ screen state machine
 ├─ snapshot sub + RAF                        ├─ snapshot sub + RAF
 ├─ input wire (1 listener)                   └─ single keyboard coordinator
 ├─ second window listener (Enter)                via Coordinator service
 ├─ settings via Object.assign
 ├─ persistence error swallow                Coordinator (io)
 └─ theme glue                                ├─ attachInputHandler
                                              ├─ onConfirm callback
IO                                             └─ isEnabled gated by screen
 ├─ ProfileStore (poisoned cache)
 ├─ no cross-tab                             IO (hardened)
 ├─ typeof check for IDB                      ├─ ProfileStore
 └─ corpus loader unwired                     │   ├─ dbPromise reset on fail
                                              │   ├─ probe at startup
Engine                                        │   ├─ BroadcastChannel
 ├─ Session.start in ctor                     │   ├─ onversionchange/onclose
 ├─ Profile mutable from outside              │   └─ migrators table
 └─ CorpusSelector seam unused                ├─ corpusLoader (wired or removed)
                                              └─ inputHandler
                                                  ├─ + isComposing guard
                                                  └─ + repeat guard

Hardening                                    Hardening
 ├─ no CSP                                    ├─ CSP + frame-ancestors
 ├─ no headers                                ├─ _headers / vercel.json
 ├─ no CI                                     ├─ GH Actions CI
 ├─ no lint                                   ├─ Biome
 ├─ no coverage                               ├─ Coverage thresholds
 └─ no pre-commit                             └─ lefthook
```

Data flow stays the same: DOM keydown → InputHandler → Session.input → mutate TextInput → RAF-batched setSnapshot → Solid render. The change is in **where mutations are allowed**, **how saves and load failures are surfaced**, and **how the environment is hardened**.

### Assumptions audit

| Assumption | Where assumed | How to validate | Risk if wrong |
|---|---|---|---|
| Users have IndexedDB available | `createProfileStore` | Probe with no-op open; surface InMemory banner | Silent persistence loss |
| Users have one tab open | `IndexedDbProfileStore.save` | Add `BroadcastChannel`; assert in test with two stores | Last-writer-wins data loss |
| Keystrokes are Latin/BMP | `TextInput`, `histogramFromSteps` | Already rejected at TextInput boundary; verified | IME corruption (C1) — not validated |
| `performance.now()` is monotonic across tab freeze | `TextInput.elapsedMs`, `binBySecond` | Test with `vi.useFakeTimers` simulating freeze; cap in code | Junk RunResult (H16) |
| Saved profile schema doesn't change | `parseSettings`, `parseResult` | Migrators with each schema version | Silent wipe |
| `event.key.length === 1` ⇒ typeable char | `attachInputHandler` | Test composition events, dead keys, `Process` | IME corruption (C1) |
| `Math.random` is unused | Engine determinism contract | Grep + add lint rule banning `Math.random` in engine/ | Test flakiness |
| Corpus content is safe to render | `TypingArea` (text interpolation) | Already escaped by Solid; flagged untrusted (M7) | Trojan-Source rendering |
| `MAX_HISTORY = 500` is enough | engine cap | Telemetry on actual user history depth (none today) | Power-user perf cliff |
| The AI corpus seam will work as designed | `ScoringCorpusSelector` + Session signature | Wire end-to-end before announcing the seam (H7) | Promised feature doesn't materialize |

### Compact & optimize

- **`computeLiveMetrics` and `computeRunMetrics` are 80% duplicate** (Low arch). Extract shared `countSteps()` and `countStatuses()` helpers.
- **`InMemoryProfileStore.save` uses `JSON.parse(JSON.stringify(...))`** for defensive cloning — equivalent to `structuredClone(...)` (native, faster, handles `Map`). Switch.
- **`engine/index.ts` `export *`** can be slimmer — UI consumers import from sub-barrels.
- **`parseSettings` if-cascade** can be collapsed to a table-driven validator with one schema object per setting key.
- **`DEFAULT_ALPHABET` literal in `lesson.ts`** is fine; consider moving to a `data/` subfolder if more alphabet maps land.
- **`reference-repo/` checks** — Vite + Vitest both have explicit fences. Single-source via a `paths.ts` constant if a third tool ever needs the exclusion.

---

## Executive Summary

### One-paragraph verdict

This is unusually disciplined code for its size: 1989 LOC of production TypeScript with a strict-typed, framework-free engine, a properly isolated persistence boundary, principled disposal lifecycle, and a 0.70 test-to-prod ratio. It survived a 9-dimension Codex audit with 22 of 23 findings closed. **The biggest risk is not in the code that exists — it's at the seams the code doesn't yet defend**: the keyboard input boundary that doesn't know IME composition exists, the IndexedDB store that caches a poisoned promise forever after the first transient failure, the cross-tab persistence that silently loses data, and the deploy artifact that ships with no CSP. Compounding all of those: no CI, no linter, no coverage tool. The codebase has a high *floor* and a low *ceiling on operational confidence*. About four hours of focused work closes the critical and most-of-high tier; about two days closes everything material.

### Top 3 actions (if you could only do 3)

1. **Add the IME-composition + `event.repeat` guards in `src/io/input-handler.ts`** (15 min). One four-line change closes the single scariest finding (C1: persistent profile corruption for every non-English user) and the related autorepeat amplifier (H4). Without this, the rest of the engine's polish is delivering a corrupted experience to a meaningful share of users.
2. **Reset the poisoned `dbPromise` on rejection + add a `saveFailed` UI banner** (45 min combined). One transient IndexedDB failure currently breaks all persistence permanently with no user signal. This is a silent-data-loss channel with no fix path during a session.
3. **Wire CI + Biome + coverage tool together** (~3 hours total). Multiplies the value of every existing test, makes every future PR safer, and is the only way the next iteration's audits won't keep finding the same kind of debt — because lint/coverage will catch the pre-commit version of it.

### Confidence levels

| Recommendation | Confidence | What would raise it |
|---|---|---|
| IME guard | **High** | A jsdom test with a synthetic `KeyboardEvent` setting `isComposing: true` (cheap; do it with the fix) |
| `dbPromise` reset | **High** | Test that simulates a failing factory then a working one; verify recovery |
| Save-failed banner | **High** | Manual smoke test in Safari private mode + Chrome with quota artificially reduced |
| Cross-tab `BroadcastChannel` | **Medium** | Real two-tab manual test + e2e with Playwright |
| CSP + headers | **High** | Built artifact tested with [Mozilla Observatory](https://observatory.mozilla.org) |
| `Session.updateSettings` API | **High** | Static — straightforward refactor |
| Corpus seam decision (commit vs delete) | **Medium** | Depends on product direction on AI corpus; decide before adding more code in the area |
| Property tests for metrics | **High** | They're additive; no risk |
| CI + lint + coverage | **High** | These are commodity DX moves; ample reference |
| Per-position snapshot accessor | **Low** (don't fix yet) | Real profiling data on 144Hz devices with 1000-char passages |
| Migration table | **Medium** | Implement before the first real schema bump |
| Tab-freeze elapsedMs cap | **High** | Repro by literally closing a laptop lid mid-run; verify the cap kicks in |

### Paranoid Verdict — the single scariest thing

**IME composition unawareness in `attachInputHandler`** (`src/io/input-handler.ts:41-64`). Any user with a non-Latin keyboard layout, or a macOS user using option-key dead keys for accented characters, will see every keystroke committed as the pre-composition raw key. The IME's composed character is suppressed by `preventDefault`; the raw key is logged as a typo. Because the corruption flows straight through `onResult → persist()` into IndexedDB, the broken state is written to disk on every run and **survives across sessions**. Combined with the IDB-eviction-without-recovery story (C2), an internationalized user can permanently lock themselves into a degraded profile and have no way to know it happened. Fix is four lines: `if (event.isComposing || event.repeat || event.keyCode === 229) return;`.

---

## Fixing Plan

### Phase 1: Critical fixes (do immediately)

#### C1 — IME composition + dead-key guard
- **Finding**: `event.key` committed during IME composition, polluting the persisted profile (`src/io/input-handler.ts:41-64`).
- **Fix**: Add `if (event.isComposing || event.keyCode === 229) return;` after the `instanceof` + `isEnabled` checks. Test with a synthesized `KeyboardEvent` whose `isComposing` is true (set via the constructor's init dict).
- **Effort**: 15 min
- **Files**: `src/io/input-handler.ts`, `src/io/input-handler.test.ts`

#### C2 — Distinguish IDB-evicted-but-localStorage-survives
- **Finding**: After IDB eviction, the load-null path is indistinguishable from "fresh install" (`src/ui/theme.ts:32-36`, `src/io/persistence.ts:362`).
- **Fix**: Write a "user-known marker" to localStorage on first save. On load, if `store.load() === null && marker exists`, surface a "could not recover your saved profile" banner. Alternative: move theme into Profile so the two move together.
- **Effort**: 30 min
- **Files**: `src/io/persistence.ts`, `src/ui/App.tsx`, `src/ui/theme.ts`

### Phase 2: High-priority fixes (this sprint)

#### H1 — Reset poisoned `dbPromise`
- **Fix**: In `openDb()`, on rejection do `this.dbPromise = null; throw err;` so the next call retries. Add one backoff retry for transient codes.
- **Effort**: 10 min · **Files**: `src/io/persistence.ts`, `src/io/persistence.test.ts`

#### H2 — `saveFailed` UI signal
- **Fix**: Add a Solid signal alongside `loadFailed`. Set it inside `persist()`'s `.catch`. Render a sticky banner with `err?.name`-driven copy.
- **Effort**: 30 min · **Files**: `src/ui/App.tsx`, `src/ui/App.test.tsx`, `src/ui/styles.css`

#### H3 — Cross-tab consistency
- **Fix**: `db.onversionchange = () => { db.close(); this.dbPromise = null; }`. `db.onclose = () => { this.dbPromise = null; }`. `BroadcastChannel("type-faster")` posts a `profile-updated` message on save; receivers set a `staleProfile` signal that shows a "data updated in another tab — reload" banner.
- **Effort**: 1–2 h · **Files**: `src/io/persistence.ts`, `src/ui/App.tsx`, new test

#### H4 — `event.repeat` guard
- **Fix**: `if (event.repeat) return;` after the modifier checks in `attachInputHandler`.
- **Effort**: 5 min · **Files**: `src/io/input-handler.ts`, `src/io/input-handler.test.ts`

#### H5 — Global `unhandledrejection` / `error` handlers
- **Fix**: Register both in `main.tsx`; route to `console.warn` for now (structured logger when added).
- **Effort**: 20 min · **Files**: `src/main.tsx`

#### H6 — `Session.updateSettings()` API
- **Fix**: Add method that validates `next` via `parseSettings` (extracted as `validateSettings(unknown): ProfileSettings | null`), replaces `_profile.settings` by reference (not Object.assign), calls `start()`. App routes through it. Type `Session.profile` as `Readonly<Profile>`.
- **Effort**: 45 min · **Files**: `src/engine/session/session.ts`, `src/engine/session/types.ts`, `src/ui/App.tsx`, `src/io/persistence.ts` (export validator)

#### H7 — Resolve the corpus seam
- **Decide**: commit (thread `CorpusSelector` through `Session`, give App a `recent` ring, ~2 h) or delete (`ScoringCorpusSelector`, `loadCorpus`, `loadSeedCorpus`, `parseCorpus`, `SelectOptions.recent`, ~15 min).
- **Effort**: 15 min OR 2 h · **Files**: across `engine/corpus/`, `io/`, `engine/session/`

#### H8 — CSP meta tag
- **Fix**: Add `<meta http-equiv="Content-Security-Policy" ...>` to `index.html` with `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`. Verify `pnpm build && pnpm preview`.
- **Effort**: 15 min · **Files**: `index.html`

#### H9 — Headers bundle
- **Fix**: `public/_headers` (or `vercel.json`) with `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`.
- **Effort**: 30 min · **Files**: `public/_headers` (new)

#### H10 — CI workflow
- **Fix**: `.github/workflows/ci.yml` with one job: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`. Node 20+, pnpm 10.
- **Effort**: 30 min · **Files**: `.github/workflows/ci.yml` (new)

#### H11 — Coverage tool
- **Fix**: Add `@vitest/coverage-v8`. Configure `test.coverage` in `vite.config.ts` (`provider: "v8"`, `reporter: ["text", "html", "lcov"]`, thresholds 85/80/85). Add `test:coverage` script. CI job runs it.
- **Effort**: 1 h · **Files**: `package.json`, `vite.config.ts`, `.github/workflows/ci.yml`

#### H12 — Linter
- **Fix**: Add Biome (`pnpm add -D @biomejs/biome`, `pnpm biome init`). Or ESLint + `eslint-plugin-solid`. Add `lint` script. CI runs it.
- **Effort**: 1–2 h (some auto-fixable findings will surface) · **Files**: `package.json`, `biome.json` (new), various `*.ts`/`*.tsx` formatting

#### H13 — Pre-commit hook
- **Fix**: Add `lefthook`. Hook runs `pnpm typecheck` + `pnpm exec vitest related --run` on staged files.
- **Effort**: 30 min · **Files**: `package.json`, `lefthook.yml` (new)

#### H14 — Missing UI/theme tests
- **Fix**: `Settings.test.tsx` (clampInt boundaries, theme-only-applied-on-save, cancel doesn't onSave), `Heatmap.test.tsx` (all 4 heat levels render, focused class applied), `Results.test.tsx` (stat values render, weakKeys 6-cap, empty-state fallback), `theme.test.ts` (loadTheme default, persists, gracefully handles `localStorage.setItem` throw), dedicated `ema.test.ts` (alpha=1, NaN poisoning).
- **Effort**: 2.5 h · **Files**: 5 new test files

#### H15 — Bounds unification
- **Fix**: Create `src/engine/session/bounds.ts` exporting `SETTINGS_BOUNDS`. Import from `Settings.tsx` and `persistence.ts`. Add a test asserting UI clamps are within persistence ranges.
- **Effort**: 30 min · **Files**: `src/engine/session/bounds.ts` (new), `src/ui/Settings.tsx`, `src/io/persistence.ts`, new test

#### H16 — Cap `TextInput.elapsedMs` for tab-freeze
- **Fix**: Cap inter-keystroke `timeToType` at `MAX_PLAUSIBLE_MS` (12000) when computing elapsed. Sum-of-capped, not last−first. Document the contract.
- **Effort**: 30 min · **Files**: `src/engine/typing/text-input.ts`, `src/engine/metrics/metrics.ts`, tests

### Phase 3: Medium-priority improvements (next sprint)

(Abbreviated — see findings table for evidence.)

| # | Fix | Effort | Files |
|---|---|---|---|
| M1 | Decouple `MAX_HISTORY` (duplicate constant with comment, or invert dependency) | 10 min | `src/io/persistence.ts`, `src/engine/session/session.ts` |
| M2 | `Filter.allowed` → `readonly string[]` | 15 min | `src/engine/corpus/types.ts`, callers |
| M3 | `serializeProfile` returns owned copies; `Session.profile` is `Readonly` | 30 min (with H6) | `src/io/persistence.ts`, `src/engine/session/session.ts` |
| M4 | Rename `letters` → `lettersInDifficultyOrder` or brand-typed | 10 min | `src/engine/adaptive/lesson.ts` |
| M5 | Drop implicit `start()` in Session constructor; require explicit start | 15 min | `src/engine/session/session.ts`, callers, tests |
| M6 | Per-position status accessor (defer until profiled) | 1 h | `src/engine/typing/text-input.ts`, `src/ui/TypingArea.tsx` |
| M7 | Corpus character allowlist (controls, bidi, zero-width) | 1 h | `src/io/corpus-loader.ts`, `src/engine/typing/text-input.ts`, tests |
| M8 | Structured-log helper | 20 min | `src/ui/App.tsx`, new `src/ui/log.ts` |
| M9 | `theme.ts` `console.debug` in catch | 5 min | `src/ui/theme.ts` |
| M10 | Try/catch around `session.input()` calls + `runCrashed` signal | 30 min | `src/ui/App.tsx` |
| M11 | `loadFailed` distinguishes corrupt vs absent; introduce migrators table | 1 h | `src/io/persistence.ts`, `src/ui/App.tsx` |
| M12 | Probe IDB writability at startup | 45 min | `src/io/persistence.ts` |
| M13 | SRI plugin in Vite | 30 min | `vite.config.ts`, `package.json` |
| M14 | (covered by H14) | — | — |
| M15 | Property tests with `fast-check` | 1 h | `src/engine/metrics/metrics.test.ts`, `package.json` |
| M16 | (covered by H14 dedicated `ema.test.ts`) | — | — |
| M17 | Replace `setTimeout(0)` in App.test with proper marker-waited assertion + RAF coalescing test | 1 h | `src/ui/App.test.tsx` |
| M18 | Add non-`KeyboardEvent` rejection test | 5 min | `src/io/input-handler.test.ts` |
| M19 | Seed corpus sanity test (surrogate-free, unique ids, alphabet coverage) | 15 min | `src/io/corpus-loader.test.ts` |
| M20 | `parseSettings` rejects unknown extra fields (strict mode) | 20 min | `src/io/persistence.ts`, tests |

### Phase 4: Low-priority cleanup (when touching these files)

Grouped by file so a developer touching that file picks up nearby lows.

**`src/ui/App.tsx`**: extend `InputHandlerCallbacks` with `onConfirm` and remove the inline window listener (Low arch). When fixing C1/H4 in `input-handler.ts`, do this at the same time.

**`src/engine/index.ts`**: enumerate exports explicitly instead of `export *` (Low arch). Drop the root barrel if every internal consumer already uses sub-barrels.

**`src/engine/session/session.ts`**: rename `Session.input` → `Session.keystroke` (Low naming). Touch when doing H6.

**`src/engine/typing/types.ts`**: rename `Feedback` → `RunStatus` (Low naming).

**`src/engine/metrics/metrics.ts`**: deduplicate `computeLiveMetrics` / `computeRunMetrics` via shared private `countSteps()` / `countStatuses()` helpers (Low duplication). Touch when adding property tests (M15).

**`src/engine/adaptive/key-stats.ts:65`**: gate `bestTimeToType` updates on N≥3 samples to avoid single-lucky-hit lock-in (Low edge case).

**`src/engine/session/profile.ts`** + **`src/engine/adaptive/lesson.ts`**: consolidate default settings into one constant/module (Low duplication).

**`src/io/input-handler.ts`**: try/catch each callback invocation; pass exceptions to an optional `onError` callback (Low robustness). Touch with H4.

**`src/io/corpus-loader.ts`**: add `AbortController` + timeout + non-JSON guard, when the loader is actually wired (if H7 takes the commit path) (Low).

**`src/io/persistence.ts`**: serialize concurrent saves into a chain (Low robustness).

**`src/ui/theme.ts:10`**: comment why strict equality matters (Low tripwire).

**`src/ui/Settings.tsx:6`** + **`Settings.tsx:41-42`**: covered by H15.

**`src/main.tsx`**: covered by H5.

**`src/ui/App.test.tsx`** + **`src/engine/session/session.test.ts`**: tighten loose `toBeGreaterThan` to exact `toEqual` where the post-condition is known (Low).

**Repo-wide**: add `size-limit` budget on `dist/assets/*.js` (Low).

**Repo-wide**: add `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` (Low). Predict survivors: `Heatmap.heatLevel` `>=` vs `>`, `Results.weakKeys` `< 1` vs `<= 1`, `Settings.clampInt` `Math.round` vs `Math.floor`, `histogram.ts` outlier bounds.

### Dependency graph

- **H6 (`Session.updateSettings`) depends on H11/H15** (validator extraction is cleaner with the bounds constant).
- **H11 (Coverage) depends on H10 (CI)** — coverage that no one sees doesn't change behavior.
- **H12 (Lint) depends on H10 (CI)** — same.
- **H13 (Pre-commit) depends on H12 (Lint)** — pre-commit hook runs lint among other things.
- **H14 (UI tests) is independent** but easier after H10 (CI to enforce).
- **M3 depends on H6** (Profile becomes readonly once mutations route through Session).
- **M11 (corrupt vs absent) depends on H2** (the saveFailed banner pattern provides the UI affordance).
- **M17 depends on H17** (no — M17 is independent).
- **Phase 1 (C1, C2) are independent of everything else.**

### Estimated total effort

| Phase | Items | Effort |
|---|---|---|
| Phase 1 (Critical) | 2 | ~45 min |
| Phase 2 (High) | 16 | ~9–11 hours |
| Phase 3 (Medium) | 20 | ~9–11 hours |
| Phase 4 (Low) | 17 (opportunistic) | ~6 hours bundled with other work |
| **Total focused** (Phases 1–3) | 38 | **~2.5 working days** |
| **Total incl. opportunistic** | 55 | **~3 working days** |

---

_Generated by `/grill:roast` (plugin grill@xiaolai v1.2.5)._
