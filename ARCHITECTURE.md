# Architecture

Three layers, one hard rule, two key boundaries.

## Layer rule

```
┌────────────────────────────────────────────────────┐
│  UI (src/ui/, SolidJS)                             │
│   Renders snapshots. Owns screen state and theme.  │
│   ↓ reads engine via RAF-batched snapshot signal   │
├────────────────────────────────────────────────────┤
│  IO (src/io/, DOM/IDB/network adapters)            │
│   Bridges to the browser. The only DOM-aware       │
│   part of the input path; the only place that      │
│   touches IndexedDB.                               │
│   ↓ uses engine                                    │
├────────────────────────────────────────────────────┤
│  Engine (src/engine/, pure TypeScript)             │
│   No DOM, no framework, no async, no Math.random.  │
│   Everything is deterministic given its inputs.    │
└────────────────────────────────────────────────────┘
```

**Engine never imports from `io/` or `ui/`. IO never imports from `ui/`.** Enforced by `src/layer-purity.test.ts`, which walks the source tree at test time and rejects forbidden imports (static, dynamic, `require`, and `@/` aliases).

## Design system + routing

The UI layer is driven by a design system (`src/ui/tokens.css`, `components.css`) — every color, type size, space, radius, and breakpoint is a token. Four themes (`data-theme="dark|light|sepia|high-contrast"`) share the same token surface in `oklch`, with an sRGB fallback block for pre-2023 browsers. Routing is hash-based; the router lives in `src/ui/router.ts` and is consumed by `App.tsx`. Hash routing keeps the deploy story simple (no server rewrites) and matches the prototype's model.

Every route has a parent declared in `ROUTE_PARENT` (in `router.ts`); the central `<BackLink>` component reads from that map so back-button labels and destinations cannot drift. A `routesReach` test walks the map to guarantee no orphan pages.

Routes (today):

| Route | Renders | Notes |
|---|---|---|
| `#/practice` | `PracticeStage` | default; root of the route graph |
| `#/results` | `ResultsStage` | post-run; auto-navigated when a run finishes |
| `#/stats` | `StatsView` | history dashboard; aliased from `#/profile` |
| `#/settings` | `Settings` | four tabs: practice / appearance / sound / data |
| `#/library` | `Library` | user uploads (mine source) |
| `#/about` | `About` | hub that cards into the four info pages |
| `#/features`, `#/guide`, `#/credits`, `#/copyright` | `Features` / `UserGuide` / `Credits` / `Copyright` | prose info pages; `#/help` aliases to `#/guide` |
| `#/articles/<id>` | `ArticleView` | long-form essays from `public/articles/<id>/article.md` |
| `#/share/<payload>` | `ShareView` | recipient-side render of a copied results card |

## The hot-loop principle

A keystroke must travel from DOM to engine state in a single synchronous path with **no reactive-framework involvement**.

```
keydown → InputHandler.handleKeyDown (io)
        → Session.input (engine, plain class mutation)
        → request RAF (once per frame max)
        → setSnapshot(...) (the one reactive write per frame)
        → UI re-renders the few class names that changed
```

Run completion and settings changes are the only events that bypass the RAF and update the signal synchronously — those are rare.

Why: SolidJS reactivity is fast, but a 60 Hz keystroke stream funneled through fine-grained reactivity creates dependency-tracking work proportional to scope. Keeping the engine pure (just plain classes mutating plain arrays) makes the hot path trivial to reason about and trivially fast.

## The two boundaries that need validators

```
┌───────────────────────────────────────────────────────────┐
│   UI                                                      │
│   Settings.tsx — clamps to UI_BOUNDS (narrower)           │
│   App.applySettings                                       │
│   ↓ validates with validateSettings                       │
│   Session.updateSettings — the ONLY write path            │
│   from UI into engine state                               │
└─────────────────────┬─────────────────────────────────────┘
                      │ (engine in-memory state)
┌─────────────────────┴─────────────────────────────────────┐
│   IO                                                      │
│   ProfileStore.save/load                                  │
│   ↑ validates with deserializeProfile                     │
│   (LoadResult: ok | absent | corrupt | evicted)           │
│   ↑ caps to SETTINGS_BOUNDS (wider, defensive)            │
└─────────────────────┬─────────────────────────────────────┘
                      │
                      IndexedDB / localStorage (untrusted)
```

- **Storage boundary** (`src/io/persistence/`): tampered data, oversized arrays, surrogate-pair histogram keys, `missCount > hitCount`, unknown extra fields — all rejected before reaching the engine. `LoadResult` distinguishes "no profile" from "profile got wiped" from "profile exists but unreadable" so the UI can tell the user. Split into focused modules: `types.ts` (LoadResult, ProfileStore), `validators.ts` (predicate helpers + `validateSettings`), `serialization.ts` (parsers + migrators), `marker.ts` (eviction-detection localStorage marker), `stores.ts` (InMemory + IndexedDB).
- **UI→engine boundary** (`src/ui/App.tsx`): every settings update runs through the same `validateSettings`. No `Object.assign`, no partial updates, no extra keys.

`SETTINGS_BOUNDS` defines what the engine and storage will accept; `UI_BOUNDS` defines the narrower friendly ranges the Settings UI clamps to. The test in `src/engine/bounds.test.ts` enforces `UI_BOUNDS ⊆ SETTINGS_BOUNDS` so the UI never produces a value the storage validator would reject. Layer purity (engine never imports io/ui, io never imports ui) is enforced by `src/layer-purity.test.ts`.

## Data flow: one practice run

```
1. App mounts
   → createProfileStore()  (probes IDB writability; falls back to in-memory)
   → store.load() → LoadResult
   → new Session(profile)
   → setSnapshot(session.snapshot())
2. User types
   → window keydown → attachInputHandler filters (IME / repeat / modifiers)
   → Session.input(char, performance.now())
   → TextInput.appendChar updates internal state + appends a Step
   → RAF schedules one setSnapshot call per frame
3. Run completes
   → Session.recordResult → push RunResult to profile, trim to MAX_HISTORY
   → persist() — async, .catch surfaces saveBanner if storage rejects
   → view.syncNow() (synchronous snapshot read), router.navigate("results")
4. User presses Enter
   → InputHandler.onConfirm (gated by shouldConfirm: is("results"))
   → Session.start() → next adaptive plan, new passage, new TextInput
```

## The adaptive engine

A per-letter mastery model that unlocks one new letter at a time:

1. Replay every `RunResult.histogram` to build `KeyStatsMap` (per-letter EMA timing + best-ever timing).
2. Compute per-letter confidence as `targetTime / actualTime`.
3. `planLesson` decides which letters this run covers, in difficulty order:
   - Always include at least `minAlphabetSize` letters.
   - Include up to `maxSize` (`alphabetExpansion` controls this).
   - Keep any letter already mastered (`bestConfidence ≥ 1`) included regardless of size.
   - **Unlock exactly one new letter** once every included letter has ever been mastered.
4. Focus = the weakest *currently active* letter (`confidence < 1`). Text generators over-represent it.

Unlock uses best-ever confidence (curriculum never backslides); focus uses current confidence (drill today's weakness). The two-axis split is deliberate.

## The corpus seam

Six sources flow through one composite selector behind `Session`. The two engine-level generators (`generatePseudoWords`, `generatePlainWords`) are the universal fallbacks; the rest are bundled or user-supplied corpora.

| Channel | Implementation | Used for |
|---|---|---|
| `user` | `createUserSource` over IndexedDB-backed `IndexedDbUserCorpusStore` | the user's own `.txt` / `.md` uploads |
| `quote` | `createQuotesSource` → `createStaticSource` over `quotes.json` | curated literary snippets |
| `code` | `createCodeSource` → `createStaticSource` over `code/*.json` | single-line code passages |
| `difficult` | `createDifficultSource` | hard-letter drills |
| `drills` | `createDrillsSource` (pseudo-words) | always-available fallback |
| (engine) | `generatePseudoWords`, `generatePlainWords` | adaptive lessons + plain-words benchmark when no corpus pick is appropriate |

`createCompositeCorpus` picks the active channel's source first and falls back to drills when nothing fits the lesson alphabet. `createCorpusSessionAdapter` bridges that to the shape `Session` expects: `(filter, wordCount, opts: { includeNumbers, includePunctuation, passageLength, testMode }) => Passage`. Attribution for the most-recent pick flows back to the UI via an `onEntryPicked` callback so the Results card can credit the source.

A future AI-generated corpus is a drop-in at the same seam — generate passages offline, tag each with its `keyHistogram`, register a new channel.

## Determinism and testability

- **No `Math.random` in `src/engine/`.** Use the `mulberry32` PRNG from `src/engine/rng.ts`. Production seeds it from current time; tests pass a fixed seed and get reproducible runs.
- **All non-pure dependencies are injectable.** `Session` accepts `now`, `rng`, `adaptiveSource`, `benchmarkSource`, `onResult`; `attachInputHandler` accepts `clock` and `isEnabled`; `IndexedDbProfileStore` accepts an `IDBFactory`; `App` accepts a `store` prop.
- **Engine tests run in node env** (fast, no DOM). UI tests opt into jsdom per-file. IO tests use `fake-indexeddb` to exercise the real IndexedDB code path.

## Failure modes the code defends against

| Failure | Defense |
|---|---|
| IME / dead-key composition typed as raw key | `event.isComposing`/`keyCode === 229` guard in `attachInputHandler` |
| Held key autorepeating into the engine | `event.repeat` guard |
| First IDB open fails → cache rejection forever | `dbPromise` reset on rejection |
| Tab freeze produces multi-hour `elapsedMs` | Inter-keystroke interval capped at `PAUSE_CAP_MS`; `binBySecond` capped at `MAX_BINS` |
| Another tab saves while we're idle | `BroadcastChannel("type-review")` → `stale-other-tab` banner |
| Another tab upgrades the schema | `onversionchange` closes the connection cleanly |
| IDB evicted but localStorage survives | Marker on save → `LoadResult.status: "evicted"` on next load, banner |
| Profile JSON tampered or corrupted | `deserializeProfile` returns `corrupt`, banner |
| Schema bumps in the future | `MIGRATORS` table; missing migrator returns `corrupt` (not silent wipe) |
| Engine throws on invariant break | App `try/catch` around `session.input`, `runCrashed` banner with Tab-to-restart |
| Non-`KeyboardEvent` synthesised by browser extensions | `instanceof KeyboardEvent` guard |
| Modifier-shortcut chords (Ctrl+C, Cmd+R) | Modifier check at the top of the input handler |
| Empty-string corpus passage | `TextInput` constructor throws — fail loud at the boundary |
| Non-BMP characters (emoji, surrogate pairs) in corpus | `TextInput` constructor throws; for the custom-text path, `Session.startWithText` pre-strips surrogates so a pasted emoji can't crash the run |

Every defense is exercised by at least one test.
