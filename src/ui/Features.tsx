import type { JSX } from "solid-js";
import { BackLink } from "./components/BackLink";
import type { RouteName } from "./router";

export interface FeaturesProps {
  onNavigate: (to: RouteName) => void;
}

/**
 * Feature catalog — a one-screen scan of what TYPE does, grouped by
 * the natural read order: how it teaches, how you run it, what the
 * inputs and outputs feel like, what gets persisted. The user guide
 * (`/guide`) is the deep reference; this page is the scan.
 */
export function Features(props: FeaturesProps): JSX.Element {
  return (
    <main class="stage page page--narrow">
      <header class="page__head">
        <div class="label">features</div>
        <h2 class="page__title">Everything TYPE does.</h2>
      </header>

      <section class="page__body">
        <h3>How it teaches</h3>
        <ul>
          <li>
            <b>Adaptive lessons</b> — per-key mastery model; new letters unlock when the slowest
            current letter clears your target WPM.
          </li>
          <li>
            <b>Benchmark runs</b> — timed reads on real prose; no alphabet filter.
          </li>
          <li>
            <b>Per-key + per-finger stats</b> — every keystroke feeds the same model regardless of
            mode.
          </li>
          <li>
            <b>Live on-screen keyboard heatmap</b> — colour codes mastery (locked / new / slow / mid
            / mastered) and highlights the letter the adaptive engine has flagged as currently
            weakest.
          </li>
        </ul>

        <h3>How runs end</h3>
        <ul>
          <li>
            <b>Words mode</b> — finish at the end of a fixed-length passage.
          </li>
          <li>
            <b>Time mode</b> — finish after N seconds; passage is sized so fast typists won't run
            out.
          </li>
          <li>
            <b>Passage length filter</b> — short (~150 chars), medium (~400), long (~800), or any.
          </li>
        </ul>

        <h3>How typing feels</h3>
        <ul>
          <li>
            <b>Stop on error</b> — wrong keystrokes don't advance the cursor.
          </li>
          <li>
            <b>Confidence mode</b> — backspace disabled; every keystroke commits.
          </li>
          <li>
            <b>Whitespace markers</b> — faint <code>·</code>, <code>→</code>, <code>↵</code> for
            space, tab, newline.
          </li>
          <li>
            <b>Numbers + punctuation toggles</b> — sprinkle digits and symbols into plain-word
            passages.
          </li>
          <li>
            <b>Custom text</b> — paste a paragraph and run it once without saving.
          </li>
          <li>
            <b>Blinking caret</b> — conventional text-input caret at the typing position.
          </li>
        </ul>

        <h3>Input options</h3>
        <ul>
          <li>
            <b>Keymaps</b> — QWERTY, Colemak, Dvorak (visual mapping on the on-screen keyboard).
          </li>
          <li>
            <b>Layouts</b> — Mac and Windows physical layouts.
          </li>
          <li>
            <b>Sound packs</b> — off, mechvibe (synth), typewriter (real samples), soft. Generated
            on-device with Web Audio.
          </li>
          <li>
            <b>Mobile soft-keyboard support</b> — hidden input captures iOS/Android keystrokes.
          </li>
        </ul>

        <h3>Sources of text</h3>
        <ul>
          <li>
            <b>Quotes</b> — public-domain and short fair-use literary snippets.
          </li>
          <li>
            <b>Codes</b> — real source code, languages bundled in.
          </li>
          <li>
            <b>Mine</b> — your own <code>.txt</code> / <code>.md</code> uploads (local).
          </li>
          <li>
            <b>Difficult</b> — curated hard-letter passages.
          </li>
          <li>
            <b>Drills</b> — pseudo-words from your unlocked letters; always available.
          </li>
          <li>
            <b>Auto</b> — smart fallback through the above.
          </li>
        </ul>

        <h3>What you see after a run</h3>
        <ul>
          <li>
            <b>Net + raw WPM, accuracy, consistency</b> on every Results card.
          </li>
          <li>
            <b>In-run WPM sparkline</b> — per-second raw WPM, so you can see your pace shape.
          </li>
          <li>
            <b>Achievement banner</b> — celebratory chips when a run unlocks new milestones.
          </li>
          <li>
            <b>Share link</b> — <code>#/share/&lt;payload&gt;</code> copy-link button; recipient
            sees a read-only card.
          </li>
        </ul>

        <h3>Stats dashboard</h3>
        <ul>
          <li>
            <b>Per-source breakdown</b> — WPM averages and run counts by quotes / codes / mine /
            etc.
          </li>
          <li>
            <b>Per-finger speed and error rate</b> — which fingers are pulling weight, which are
            dragging.
          </li>
          <li>
            <b>Streaks and milestones</b> — daily-run streak, per-key WPM milestones.
          </li>
          <li>
            <b>History sparkline</b> — long-term WPM trend.
          </li>
        </ul>

        <h3>Appearance</h3>
        <ul>
          <li>
            <b>Four themes</b> — dark, light, sepia, high-contrast.
          </li>
          <li>
            <b>sRGB fallbacks</b> for pre-2023 browsers without oklch.
          </li>
          <li>
            <b>Monospace typing surface</b> capped at ~72 chars for comfortable line returns.
          </li>
        </ul>

        <h3>Privacy and data</h3>
        <ul>
          <li>
            <b>Local only</b> — no analytics, no telemetry, no account, no server.
          </li>
          <li>
            <b>IndexedDB</b> for profile + uploads; localStorage for UI prefs.
          </li>
          <li>
            <b>Export / import</b> — your profile as plain-text JSON.
          </li>
          <li>
            <b>Reset</b> — wipe everything from Settings → Data.
          </li>
        </ul>
      </section>

      <div class="actions">
        <BackLink from="features" onNavigate={props.onNavigate} />
      </div>
    </main>
  );
}
