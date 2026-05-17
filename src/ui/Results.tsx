import type { JSX } from "solid-js";
import { createSignal, For, onCleanup, Show } from "solid-js";
import type { LessonKey, LessonPlan } from "../engine/adaptive";
import type { CorpusEntry } from "../engine/corpus";
import type { RunResult } from "../engine/session";
import type { Milestone } from "./stats/aggregations";

function Stat(props: { label: string; value: string | number; big?: boolean }): JSX.Element {
  return (
    <div classList={{ stat: true, "stat--big": props.big ?? false }}>
      <span class="stat__value">{props.value}</span>
      <span class="stat__label">{props.label}</span>
    </div>
  );
}

/**
 * SVG line + area sparkline of per-second WPM values. Same shape as the
 * one on the Stats page; reused via inline render rather than imported
 * to avoid a circular dep with the stats/ folder.
 */
function WpmSparkline(props: { values: readonly number[] }): JSX.Element {
  const values = props.values;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const W = 100;
  const H = 40;
  const stepX = W / (values.length - 1);
  const points = values.map((v, i) => {
    const x = (i * stepX).toFixed(2);
    const y = (H - ((v - min) / span) * H).toFixed(2);
    return `${x},${y}`;
  });
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `M 0,${H} L ${points.join(" L ")} L ${W},${H} Z`;
  return (
    <svg
      class="spark spark--tall"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path class="spark__area" d={areaPath} />
      <path class="spark__line" d={linePath} />
    </svg>
  );
}

/**
 * Plays the finished run back at typing speed — animates the text by
 * revealing characters at the original WPM. Uses `durationMs / typed`
 * as the per-char interval, clamped so absurdly slow / fast runs stay
 * watchable. Can't replay actual keystroke timings without keeping the
 * `steps` log (we don't persist them — would bloat the IDB store).
 */
function ReplayButton(props: {
  text: string;
  durationMs: number;
  typedChars: number;
}): JSX.Element {
  const [playing, setPlaying] = createSignal(false);
  const [visible, setVisible] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    setPlaying(false);
  };
  onCleanup(stop);

  const play = (): void => {
    if (playing()) {
      stop();
      return;
    }
    setVisible(0);
    setPlaying(true);
    // Original per-char pace, clamped to a watchable range: 20 ms ≈
    // 600 WPM (way faster than any human, used when timings are
    // missing) and 200 ms ≈ 60 WPM (slow but bearable for very long
    // pauses). Outside that band the replay either flies past or
    // bores; this keeps replay useful as a coaching tool.
    const rawInterval = props.typedChars > 0 ? props.durationMs / props.typedChars : 60;
    const intervalMs = Math.max(20, Math.min(200, rawInterval));
    // Stop at the actually-typed length, not the passage length. Time
    // mode generates a long over-budget passage; replaying past the end
    // of what the user actually produced would scroll auto-generated
    // text they never saw, misrepresenting the run.
    const stopAt = Math.min(props.typedChars, props.text.length);
    timer = setInterval(() => {
      setVisible((v) => {
        const next = v + 1;
        if (next >= stopAt) {
          stop();
          return stopAt;
        }
        return next;
      });
    }, intervalMs);
  };

  return (
    <section class="replay" aria-label="replay">
      <div class="label" style={{ "margin-bottom": "var(--space-2)" }}>
        replay
      </div>
      <pre class="replay__text">{props.text.slice(0, visible())}</pre>
      <button type="button" class="link" onClick={play}>
        {playing() ? "stop" : "play"}
      </button>
    </section>
  );
}

/**
 * Builds a /share/<base64> URL encoding the headline result fields and
 * copies it to clipboard. Lives entirely in the URL — no backend, no
 * account — so users can paste their run into Twitter / Slack / wherever.
 */
function ShareButton(props: { result: RunResult; entry: CorpusEntry | null }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  const payload = (): string => {
    const data = {
      v: 1,
      wpm: Math.round(props.result.metrics.netWpm),
      acc: Math.round(props.result.metrics.accuracy),
      raw: Math.round(props.result.metrics.rawWpm),
      dur: Math.round(props.result.metrics.durationMs / 1000),
      m: props.result.mode,
      // Attribution if we have it — fits in URL even at max length.
      title: props.entry?.attribution?.title ?? null,
      author: props.entry?.attribution?.author ?? null,
    };
    // URL-safe base64 of UTF-8 — TextEncoder + btoa avoids the
    // deprecated unescape() trick. Payload is ASCII anyway (numbers +
    // short Latin author/title strings) so encoding rarely matters.
    const json = JSON.stringify(data);
    if (typeof btoa === "undefined") return json;
    const bytes = new TextEncoder().encode(json);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const url = (): string => {
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}/#/share/`
        : "https://type.review/#/share/";
    return `${base}${payload()}`;
  };
  const copy = (): void => {
    const u = url();
    const promptFallback = (): void => {
      if (typeof window !== "undefined" && typeof window.prompt === "function") {
        window.prompt("Copy this link:", u);
      }
    };
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(u).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        },
        // Permission denied / non-secure context / clipboard unavailable
        // — fall back to a prompt rather than crash on an unhandled
        // rejection (which surfaces as a noisy console error).
        () => promptFallback(),
      );
    } else {
      promptFallback();
    }
  };
  return (
    <p class="empty-note" style={{ "margin-top": "var(--space-3)" }}>
      <button type="button" class="link" onClick={copy}>
        {copied() ? "copied!" : "copy share link"}
      </button>
    </p>
  );
}

/** The weakest included keys, slowest first — keys still below the target threshold. */
function weakKeys(plan: LessonPlan): LessonKey[] {
  return plan.keys
    .filter((key) => key.included && key.confidence !== null && key.confidence < 1)
    .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))
    .slice(0, 6);
}

/**
 * Post-run summary: headline metrics plus the weak keys the adaptive engine
 * will focus next. Shown on the transition to a completed run.
 */
export function Results(props: {
  result: RunResult;
  plan: LessonPlan | null;
  /** Corpus entry of the run that just completed; null for generated text. */
  entry: CorpusEntry | null;
  /**
   * Achievements unlocked by this run. Rendered as a celebratory banner
   * at the top of the results card. Empty array = no banner.
   */
  unlocked: readonly Milestone[];
  onNext: () => void;
  onSettings: () => void;
}): JSX.Element {
  const metrics = (): RunResult["metrics"] => props.result.metrics;
  const attribution = (): CorpusEntry["attribution"] | null => props.entry?.attribution ?? null;

  return (
    <div class="results">
      <Show when={props.unlocked.length > 0}>
        <section class="achievement" role="status" aria-live="polite">
          <span class="achievement__title">achievement unlocked</span>
          <For each={props.unlocked}>{(m) => <span class="achievement__chip">{m.label}</span>}</For>
        </section>
      </Show>

      <Show when={attribution()}>
        {(attr) => (
          <p class="results__attribution">
            <Show when={attr().title}>
              <em>{attr().title}</em>
            </Show>
            <Show when={attr().author}>
              {attr().title ? " " : ""}— {attr().author}
            </Show>
            <span class="results__attribution-license"> · {attr().license}</span>
          </p>
        )}
      </Show>

      <div class="stat-grid">
        <Stat
          label={metrics().wpmStdDev > 0 ? `wpm · ±${metrics().wpmStdDev}` : "wpm"}
          value={metrics().netWpm}
          big
        />
        <Stat label="accuracy" value={`${metrics().accuracy}%`} />
        <Stat label="raw" value={metrics().rawWpm} />
        <Stat label="consistency" value={`${metrics().consistency}%`} />
      </div>

      <Show when={metrics().wpmSeries.length >= 2}>
        <section class="run-graph" aria-label="raw wpm per second">
          <div class="label" style={{ "margin-bottom": "var(--space-3)" }}>
            raw wpm per second
          </div>
          <WpmSparkline values={metrics().wpmSeries} />
        </section>
      </Show>

      <Show when={props.result.text.length > 0}>
        <ReplayButton
          text={props.result.text}
          durationMs={props.result.metrics.durationMs}
          typedChars={props.result.metrics.correctChars + props.result.metrics.incorrectChars}
        />
      </Show>

      <ShareButton result={props.result} entry={props.entry} />

      <Show when={props.plan}>
        {(plan) => (
          <Show
            when={weakKeys(plan()).length > 0}
            fallback={<p class="results__note">every active key is at target — nice.</p>}
          >
            <div class="weak-keys">
              <span class="weak-keys__label">still weak</span>
              <For each={weakKeys(plan())}>
                {(key) => (
                  <span
                    class="weak-key"
                    title={`${Math.round((key.confidence ?? 0) * 100)}% of target`}
                  >
                    {key.letter}
                  </span>
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>

      <div class="actions">
        <button type="button" class="btn btn--primary" onClick={() => props.onNext()}>
          next <kbd>↵</kbd>
        </button>
        <button type="button" class="btn" onClick={() => props.onSettings()}>
          settings
        </button>
      </div>
    </div>
  );
}
