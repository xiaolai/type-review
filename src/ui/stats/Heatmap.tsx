import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import type { PerKeyStat } from "./aggregations";

/**
 * Three rows of QWERTY letters. We render the *characters*, not the
 * physical keys — the histogram is keyed by character, and a typist
 * who reads their slowness as "the letter k is slow" thinks the
 * truth regardless of which physical key they pressed.
 *
 * Layout choice: QWERTY rows even for Colemak/Dvorak typists, because
 * (a) we'd otherwise need to re-aggregate per layout, and (b) the
 * QWERTY visual is the universally familiar one. A future enhancement
 * could pivot this to the user's keymap.
 */
const ROWS: ReadonlyArray<ReadonlyArray<string>> = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

/** Indent each row by half a key so the visual hints at staggered keys. */
const ROW_OFFSETS = ["0", "calc(var(--hm-key) * 0.5)", "calc(var(--hm-key) * 1.5)"];

export interface HeatmapProps {
  stats: ReadonlyMap<string, PerKeyStat>;
}

export function Heatmap(props: HeatmapProps): JSX.Element {
  // Pre-compute the timing scale across keys with data — independent
  // per render so the gradient stays comparable within this view.
  const withData = (): PerKeyStat[] =>
    [...props.stats.values()].filter((s) => s.hits >= 5 && s.avgMs > 0);

  const range = (): { lo: number; hi: number } => {
    const ds = withData();
    if (ds.length === 0) return { lo: 0, hi: 1 };
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const s of ds) {
      if (s.avgMs < lo) lo = s.avgMs;
      if (s.avgMs > hi) hi = s.avgMs;
    }
    if (hi <= lo) hi = lo + 1;
    return { lo, hi };
  };

  return (
    <div class="heatmap">
      <For each={ROWS}>
        {(row, rowIdx) => (
          <div class="heatmap__row" style={{ "margin-left": ROW_OFFSETS[rowIdx()] ?? "0" }}>
            <For each={row}>
              {(letter) => {
                const stat = props.stats.get(letter);
                const r = range();
                const hasData = stat !== undefined && stat.hits >= 5;
                const t = hasData ? (stat.avgMs - r.lo) / (r.hi - r.lo) : 0;
                const hot = Math.max(0, Math.min(1, t));
                const errRate = hasData ? stat.errorRate : 0;
                const title = hasData
                  ? `${letter} · ${Math.round(stat.avgMs)} ms · ${(errRate * 100).toFixed(1)}% errors · ${stat.hits.toLocaleString()} hits`
                  : `${letter} · no data`;
                return (
                  <div
                    class="heatmap__key"
                    classList={{
                      "heatmap__key--empty": !hasData,
                      "heatmap__key--error": hasData && errRate > 0.04,
                    }}
                    style={{
                      // Mix toward accent for hot keys; cool keys stay near surface.
                      // Token-only colors, so themes work automatically.
                      "background-color": hasData
                        ? `color-mix(in oklch, var(--color-accent) ${Math.round(hot * 70)}%, var(--color-surface-2))`
                        : "transparent",
                    }}
                    title={title}
                  >
                    <span class="heatmap__letter">{letter}</span>
                    <Show when={hasData && stat !== undefined}>
                      <span class="heatmap__ms">{Math.round(stat?.avgMs ?? 0)}</span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        )}
      </For>
      <div class="heatmap__legend" aria-hidden="true">
        <span class="heatmap__legend-label">fast</span>
        <div class="heatmap__legend-bar" />
        <span class="heatmap__legend-label">slow</span>
        <span class="heatmap__legend-error">
          <span class="heatmap__legend-dot" /> &gt; 4% errors
        </span>
      </div>
    </div>
  );
}
