import type { JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { Profile, RunResult } from "../engine/session";
import { CHANNEL_LABELS } from "../io";
import {
  aggregatePerFinger,
  aggregatePerKey,
  byChannel,
  type ChannelAggregate,
  type ChannelTag,
  channelOf,
  dailyCounts,
  type FingerStat,
  labelForFinger,
  milestones,
  slowestBigrams,
  streak,
  topRuns,
  topWords,
  wpmDistribution,
} from "./stats/aggregations";
import { Calendar } from "./stats/Calendar";
import { Heatmap } from "./stats/Heatmap";

export interface StatsViewProps {
  profile: Profile;
  /** Called when the user clicks the empty-state CTA. */
  onStart: () => void;
  /**
   * Dev-only: replace the profile with realistic seeded data. When
   * provided, a small "populate sample data" button appears next to
   * the empty-state CTA and as a subtle action above the recent-runs
   * table. App.tsx only wires this in `import.meta.env.DEV` builds.
   */
  onSeed?: () => void;
}

interface AggregateStats {
  count: number;
  bestWpm: number;
  avgWpm: number;
  totalMinutes: number;
}

function aggregate(results: readonly RunResult[]): AggregateStats {
  if (results.length === 0) {
    return { count: 0, bestWpm: 0, avgWpm: 0, totalMinutes: 0 };
  }
  let best = 0;
  let sum = 0;
  let totalMs = 0;
  for (const r of results) {
    if (r.metrics.netWpm > best) best = r.metrics.netWpm;
    sum += r.metrics.netWpm;
    totalMs += r.metrics.durationMs;
  }
  return {
    count: results.length,
    bestWpm: Math.round(best),
    avgWpm: Math.round(sum / results.length),
    totalMinutes: Math.round(totalMs / 60_000),
  };
}

/**
 * SVG sparkline of `values`. Hand-rolled — no chart library. Renders a filled
 * area below a stroked line, scaled to viewBox 0..100 x 0..30. Returns null
 * for empty input so the caller can show an empty-state.
 */
function Sparkline(props: { values: readonly number[] }): JSX.Element {
  if (props.values.length < 2) {
    return <div class="empty-note">need at least two sessions for a trend</div>;
  }
  const values = props.values;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const W = 100;
  const H = 30;
  const stepX = W / (values.length - 1);
  const points = values.map((v, i) => {
    const x = (i * stepX).toFixed(2);
    const y = (H - ((v - min) / span) * H).toFixed(2);
    return `${x},${y}`;
  });
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `M 0,${H} L ${points.join(" L ")} L ${W},${H} Z`;
  return (
    <svg class="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path class="spark__area" d={areaPath} />
      <path class="spark__line" d={linePath} />
    </svg>
  );
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

/**
 * Translate a stats `ChannelTag` (which includes "unknown") to its
 * picker label. `CHANNEL_LABELS` is keyed by `ChannelName` only, so
 * "unknown" needs an explicit fallback — anything not in a registered
 * channel surfaces as "other" in the source breakdown.
 */
function labelForChannel(tag: ChannelTag): string {
  if (tag === "unknown") return "other";
  return CHANNEL_LABELS[tag];
}

/**
 * Stats screen — long-term performance dashboard. Reads from the
 * persisted local profile (results array). No new data fetch; everything
 * is in memory. The route is `#/stats`; the legacy `#/profile` URL is
 * aliased here for back-compat (see router.ts).
 */
export function StatsView(props: StatsViewProps): JSX.Element {
  // `props.profile` is a plain object (mutated by Session, not a signal),
  // so reads of `props.profile.results` are not reactive. But each panel
  // calls its derived getter ≥1× per render, and several call it inside
  // `<For>` / `<Show>` bodies — without memoization the same aggregation
  // runs 3–5× per route entry. `createMemo` caches each result for the
  // component's lifetime; on profile updates (route re-entry → re-mount)
  // the whole tree is rebuilt and the memos recompute once.
  const results = createMemo(() => props.profile.results);
  const stats = createMemo<AggregateStats>(() => aggregate(results()));
  const recentSessions = createMemo<RunResult[]>(() => [...results()].reverse().slice(0, 10));
  const sparkValues = createMemo<number[]>(() =>
    results()
      .slice(-30)
      .map((r) => r.metrics.netWpm),
  );
  const perKey = createMemo(() => aggregatePerKey(results()));
  const perFinger = createMemo(() => aggregatePerFinger(perKey()));
  const days = createMemo(() => dailyCounts(results()));
  const streaks = createMemo(() => streak(results()));
  const top5 = createMemo(() => topRuns(results(), 5));
  const channels = createMemo(() => byChannel(results()));
  const distribution = createMemo(() => wpmDistribution(results(), 5));
  const slowBigrams = createMemo(() => slowestBigrams(results(), 5));
  const top10Words = createMemo(() => topWords(results(), 10));
  const achievements = createMemo(() => milestones(results()));

  return (
    <main class="stage profile-view">
      <h1 class="sr-only">Stats</h1>

      <div class="profile-id">
        <div class="avatar">YOU</div>
        <div class="profile-id__text">
          <div class="profile-id__name">your stats</div>
          <div class="profile-id__meta">
            <span>{stats().count} sessions</span>
            <span class="profile-id__sep">·</span>
            <span>{stats().totalMinutes} min typing</span>
          </div>
        </div>
      </div>

      <Show
        when={stats().count > 0}
        fallback={<EmptyState onStart={() => props.onStart()} onSeed={props.onSeed} />}
      >
        <HeroRow stats={stats()} />
        <Show when={props.onSeed}>
          <p class="empty-note" style={{ "margin-top": "calc(-1 * var(--space-4))" }}>
            <button type="button" class="link" onClick={() => props.onSeed?.()}>
              regenerate sample data (dev)
            </button>
          </p>
        </Show>

        {/* Row 1 — diagnostic + behavioral */}
        <div class="stats-grid stats-grid--2col">
          <PanelSection label="your slow keys">
            <Heatmap stats={perKey()} />
          </PanelSection>
          <PanelSection label="last 60 days">
            <Calendar dailyCounts={days()} streak={streaks()} />
          </PanelSection>
        </div>

        {/* Row 2 — hall of fame + WPM by source */}
        <div class="stats-grid stats-grid--2col">
          <TopRunsPanel runs={top5()} />
          <PanelSection label="wpm by source">
            <ChannelBars channels={channels()} />
          </PanelSection>
        </div>

        {/* Row 3 — distribution + slowest bigrams */}
        <div class="stats-grid stats-grid--2col">
          <PanelSection label="wpm distribution">
            <Distribution bins={distribution()} />
          </PanelSection>
          <SlowBigramsPanel bigrams={slowBigrams()} />
        </div>

        {/* Row 4 — per-finger bars + word frequency */}
        <div class="stats-grid stats-grid--2col">
          <PanelSection label="by finger">
            <FingerBars fingers={perFinger()} />
          </PanelSection>
          <TopWordsPanel words={top10Words()} />
        </div>

        <MilestonesPanel achievements={achievements()} />

        {/* Recent runs + sparkline */}
        <div class="stats-grid stats-grid--2col">
          <PanelSection label="recent · wpm" labelSpacing="space-4">
            <Sparkline values={sparkValues()} />
          </PanelSection>
          <RecentSessionsPanel sessions={recentSessions()} />
        </div>
      </Show>
    </main>
  );
}

/**
 * Generic single-panel wrapper — a label above the panel body. Extracted
 * to spare every section a copy-pasted `<section>` + label `<div>` pair.
 */
function PanelSection(props: {
  label: string;
  /** Defaults to `space-3`; the sparkline panel uses `space-4`. */
  labelSpacing?: "space-3" | "space-4";
  children: JSX.Element;
}): JSX.Element {
  const spacing = props.labelSpacing ?? "space-3";
  return (
    <section>
      <div class="label" style={{ "margin-bottom": `var(--${spacing})` }}>
        {props.label}
      </div>
      {props.children}
    </section>
  );
}

function EmptyState(props: { onStart: () => void; onSeed?: () => void }): JSX.Element {
  return (
    <div class="empty-note">
      no sessions yet —{" "}
      <button type="button" class="link" onClick={() => props.onStart()}>
        start typing
      </button>
      <Show when={props.onSeed}>
        {" · "}
        <button type="button" class="link" onClick={() => props.onSeed?.()}>
          populate sample data (dev)
        </button>
      </Show>
    </div>
  );
}

function HeroRow(props: { stats: AggregateStats }): JSX.Element {
  return (
    <div class="profile-hero">
      <Cell label="best wpm" value={props.stats.bestWpm} accent />
      <Cell label="avg wpm" value={props.stats.avgWpm} />
      <Cell label="sessions" value={props.stats.count} />
      <Cell label="minutes" value={props.stats.totalMinutes} />
    </div>
  );
}

function TopRunsPanel(props: { runs: RunResult[] }): JSX.Element {
  return (
    <section>
      <div id="lbl-top" class="label" style={{ "margin-bottom": "var(--space-3)" }}>
        top 5 runs
      </div>
      <Show when={props.runs.length > 0} fallback={<p class="empty-note">no runs yet.</p>}>
        <table class="sessions" aria-labelledby="lbl-top">
          <thead>
            <tr class="session-row session-row--head">
              <th scope="col">when</th>
              <th scope="col">source</th>
              <th scope="col">acc</th>
              <th scope="col">wpm</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.runs}>
              {(s) => (
                <tr class="session-row">
                  <td style={{ color: "var(--color-muted)" }}>{formatDate(s.timestamp)}</td>
                  <td style={{ color: "var(--color-dim)" }}>
                    {labelForChannel(channelOf(s.passageId))}
                  </td>
                  <td style={{ color: "var(--color-dim)" }}>{s.metrics.accuracy.toFixed(0)}%</td>
                  <td
                    style={{
                      color: "var(--color-accent)",
                      "font-weight": "var(--fw-medium)",
                    }}
                  >
                    {Math.round(s.metrics.netWpm)}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

function SlowBigramsPanel(props: { bigrams: ReturnType<typeof slowestBigrams> }): JSX.Element {
  return (
    <section>
      <div id="lbl-slow-bg" class="label" style={{ "margin-bottom": "var(--space-3)" }}>
        slowest bigrams
      </div>
      <Show
        when={props.bigrams.length > 0}
        fallback={<p class="empty-note">not enough data yet.</p>}
      >
        <table class="sessions" aria-labelledby="lbl-slow-bg">
          <thead>
            <tr class="session-row session-row--head">
              <th scope="col">pair</th>
              <th scope="col">hits</th>
              <th scope="col">avg ms</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.bigrams}>
              {(b) => (
                <tr class="session-row">
                  <td>
                    <code class="bigram">{b.bigram}</code>
                  </td>
                  <td style={{ color: "var(--color-dim)" }}>{b.hits.toLocaleString()}</td>
                  <td style={{ color: "var(--color-text)" }}>{Math.round(b.avgMs)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

function TopWordsPanel(props: { words: ReturnType<typeof topWords> }): JSX.Element {
  return (
    <section>
      <div id="lbl-top-words" class="label" style={{ "margin-bottom": "var(--space-3)" }}>
        most-typed words
      </div>
      <Show when={props.words.length > 0} fallback={<p class="empty-note">not enough data yet.</p>}>
        <table class="sessions" aria-labelledby="lbl-top-words">
          <thead>
            <tr class="session-row session-row--head">
              <th scope="col">word</th>
              <th scope="col">count</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.words}>
              {(w) => (
                <tr class="session-row">
                  <td>
                    <code class="bigram">{w.word}</code>
                  </td>
                  <td style={{ color: "var(--color-text)" }}>{w.count.toLocaleString()}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

function MilestonesPanel(props: { achievements: ReturnType<typeof milestones> }): JSX.Element {
  return (
    <section style={{ "margin-bottom": "var(--space-8)" }}>
      <div class="label" style={{ "margin-bottom": "var(--space-3)" }}>
        milestones
      </div>
      <div class="milestones">
        <For each={props.achievements}>
          {(m) => (
            <span
              classList={{
                milestone: true,
                "milestone--reached": m.reached,
              }}
              title={m.reached ? "reached" : "not yet"}
            >
              {m.label}
            </span>
          )}
        </For>
      </div>
    </section>
  );
}

function RecentSessionsPanel(props: { sessions: RunResult[] }): JSX.Element {
  return (
    <section>
      <div id="lbl-recent" class="label" style={{ "margin-bottom": "var(--space-3)" }}>
        recent sessions
      </div>
      <table class="sessions" aria-labelledby="lbl-recent">
        <thead>
          <tr class="session-row session-row--head">
            <th scope="col">when</th>
            <th scope="col">mode</th>
            <th scope="col">wpm</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.sessions}>
            {(s) => (
              <tr class="session-row">
                <td style={{ color: "var(--color-muted)" }}>{formatTimestamp(s.timestamp)}</td>
                <td style={{ color: "var(--color-dim)" }}>{s.mode}</td>
                <td style={{ color: "var(--color-text)" }}>{Math.round(s.metrics.netWpm)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </section>
  );
}

function Cell(props: { label: string; value: number; accent?: boolean }): JSX.Element {
  return (
    <div class="profile-hero__cell">
      <div class="label">{props.label}</div>
      <div
        classList={{
          "profile-hero__value": true,
          "profile-hero__value--accent": props.accent ?? false,
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

/**
 * Horizontal bar chart of avg WPM per channel, with a tick mark at
 * the channel's best WPM. Bars share an x-axis that's the max best
 * across channels, so the user reads "this bar is bigger" as "I'm
 * faster on this source."
 */
function ChannelBars(props: { channels: ChannelAggregate[] }): JSX.Element {
  // Hoist the bar-axis maximum out of the For body — was recomputing
  // `Math.max(...channels.map(bestWpm))` per row.
  const max = createMemo(() => Math.max(...props.channels.map((x) => x.bestWpm), 1));
  return (
    <Show
      when={props.channels.length > 0}
      fallback={<p class="empty-note">not enough data yet.</p>}
    >
      <div class="channel-bars">
        <For each={props.channels}>
          {(c) => {
            const avgPct = Math.round((c.avgWpm / max()) * 100);
            const bestPct = Math.round((c.bestWpm / max()) * 100);
            return (
              <div class="channel-bars__row">
                <div class="channel-bars__label">{labelForChannel(c.channel)}</div>
                <div class="channel-bars__track">
                  <div class="channel-bars__fill" style={{ width: `${avgPct}%` }} />
                  <div class="channel-bars__best" style={{ left: `calc(${bestPct}% - 1px)` }} />
                </div>
                <div class="channel-bars__value">
                  {Math.round(c.avgWpm)}
                  <span class="channel-bars__count"> · {c.count}</span>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

/**
 * Bar-chart histogram of WPM bins. Each bar's height is the
 * count-relative ratio so the shape is comparable regardless of how
 * many runs the user has. Bar labels: bin floor (e.g. "45").
 */
function Distribution(props: { bins: ReturnType<typeof wpmDistribution> }): JSX.Element {
  // Same hoist as ChannelBars — bar-height normalization was recomputing
  // its max per For iteration.
  const max = createMemo(() => Math.max(...props.bins.map((x) => x.count), 1));
  return (
    <Show when={props.bins.length > 0} fallback={<p class="empty-note">not enough data yet.</p>}>
      <div class="distribution">
        <For each={props.bins}>
          {(b) => {
            const h = b.count === 0 ? 4 : Math.round((b.count / max()) * 100);
            return (
              <div
                class="distribution__col"
                title={`${b.floor}-${b.floor + 4} wpm · ${b.count} runs`}
              >
                <div
                  class="distribution__bar"
                  classList={{ "distribution__bar--empty": b.count === 0 }}
                  style={{ height: `${h}%` }}
                />
                <div class="distribution__label">{b.floor}</div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

/**
 * Horizontal bar chart of avg ms per finger. Each bar is the finger's
 * avg keystroke time relative to the slowest finger; faster fingers
 * read as shorter bars. Inline so the Stats page stays self-contained.
 */
function FingerBars(props: { fingers: FingerStat[] }): JSX.Element {
  const max = createMemo(() => Math.max(...props.fingers.map((f) => f.avgMs), 1));
  return (
    <Show when={props.fingers.length > 0} fallback={<p class="empty-note">not enough data yet.</p>}>
      <div class="channel-bars">
        <For each={props.fingers}>
          {(f) => {
            const pct = Math.round((f.avgMs / max()) * 100);
            return (
              <div class="channel-bars__row">
                <div class="channel-bars__label">{labelForFinger(f.finger)}</div>
                <div class="channel-bars__track">
                  <div class="channel-bars__fill" style={{ width: `${pct}%` }} />
                </div>
                <div class="channel-bars__value">
                  {Math.round(f.avgMs)} ms<span class="channel-bars__count"> · {f.hits}</span>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
