import type { JSX } from "solid-js";
import { BackLink } from "./components/BackLink";
import type { RouteName } from "./router";

export interface UserGuideProps {
  onNavigate: (to: RouteName) => void;
}

/**
 * Long-form user guide — the canonical "how to use TYPE" reference.
 * Replaces the previous inline Help cheatsheet; the `help` route still
 * resolves here via the router alias so old bookmarks keep working.
 */
export function UserGuide(props: UserGuideProps): JSX.Element {
  return (
    <main class="stage page page--narrow">
      <header class="page__head">
        <div class="label">guide</div>
        <h2 class="page__title">How to use TYPE.</h2>
      </header>

      <section class="page__body">
        <h3>Adaptive vs benchmark</h3>
        <p>
          <b>Adaptive mode</b> drills your weakest keys. It starts with a small alphabet (about 5–6
          letters) and unlocks one new letter each time you reach the target speed on the slowest
          current letter. Letters in your adaptive text are restricted to your unlocked set; digits
          and punctuation in curated content (quotes, code, your library) pass through regardless —
          see Numbers and punctuation below.
        </p>
        <p>
          <b>Benchmark mode</b> is a run on a passage from the configured source (quotes / codes /
          mine / difficult / drills). No alphabet filter — anything goes.
        </p>

        <h3>DET Read and Complete drills</h3>
        <p>
          DET means Duolingo English Test. The <a href="#/det">DET page</a> trains its Read and
          Complete item type: each item shows a sentence and the first few letters of one target
          word. Fill the remaining letters through the end of the word; one underline means one
          missing letter. You can type just the missing tail or the full word, then press Enter to
          check. The custom target score chooses a matching item bank; it does not simply hide more
          of the same word.
        </p>
        <p>
          These drills do not feed the typing-speed stats model. They are for vocabulary,
          morphology, and grammar-in-context practice — useful for learners preparing for
          prefix-only completion tasks. Missed items are saved into a local weak bank under the
          app's own <code>type-review:</code> localStorage namespace and can be retried in weak
          mode.
        </p>

        <h3>Words vs time</h3>
        <p>
          A benchmark run can end in two ways. <b>Words mode</b> (the default) finishes when you
          reach the end of a fixed-length passage. <b>Time mode</b> finishes after a configured
          number of seconds — the passage is long enough that even fast typists won't run out.
          Switch in Settings → Practice.
        </p>

        <h3>Target speed</h3>
        <p>
          The WPM a single key must clear before adaptive considers it "mastered". Lower targets
          unlock new letters faster; higher targets dig in longer on each key. 50 is a comfortable
          default; raise to 70+ once you're comfortable at speed.
        </p>

        <h3>Stop on error</h3>
        <p>
          When on, a wrong keystroke does not advance the cursor — you must hit the right key to
          proceed. When off (the default), you can plough through with mistakes and backspace to
          fix; the cursor advances on every keystroke.
        </p>

        <h3>Confidence mode</h3>
        <p>
          Backspace is disabled — every keystroke commits, mistakes and all. Trains the habit of
          typing forward rather than micro-correcting. Combine with <b>stop on error</b> off for
          maximum honesty about your real accuracy.
        </p>

        <h3>Passage length</h3>
        <p>
          Corpus-backed sources (quotes, your library) honour a length hint: <code>short</code>{" "}
          (~150 chars, a tweet), <code>medium</code> (~400 chars, a paragraph),
          <code>long</code> (~800 chars, a few paragraphs), or <code>any</code> for "follow{" "}
          <code>wordCount</code>". Drill-style sources ignore the hint.
        </p>

        <h3>Numbers and punctuation</h3>
        <p>
          The two toggles in Settings → Practice → Alphabet control how the curriculum and the drill
          generators treat digits and punctuation:
        </p>
        <ul>
          <li>
            <b>Drill content</b> (the <code>drills</code> pseudo-word generator and the
            <code>difficult</code> word list) honours these toggles. Off ⇒ no digits or punctuation
            in generated text.
          </li>
          <li>
            <b>Curated content</b> (<b>quotes</b>, <b>codes</b>, <b>mine</b>) always passes through
            with its natural digits and punctuation regardless of the toggle — a quote with commas
            is still a quote.
          </li>
          <li>
            <b>Curriculum tracking</b> — when on, the adaptive engine adds digits / punctuation to
            its unlock sequence and tracks per-key speed for them. When off, those keys are not part
            of your curriculum but you'll still see them in natural prose.
          </li>
        </ul>

        <h3>Custom text</h3>
        <p>
          The <code>custom text</code> button on the practice page opens a textarea. Paste a
          paragraph, hit run, and the run uses your text once. Nothing is saved to your library —
          it's a one-off scratchpad for "I want to type this <em>right now</em>".
        </p>

        <h3>Source picker</h3>
        <p>
          The inline <code>source:</code> control below the practice text chooses which corpus feeds
          your next passage:
        </p>
        <ul>
          <li>
            <b>auto</b> — smart fallback: your own texts first, then quotes, then codes, then
            difficult, then drills. Whatever fits the current alphabet wins.
          </li>
          <li>
            <b>quotes / codes / mine / difficult</b> — limit to that source. If nothing fits the
            current alphabet, falls back to drills.
          </li>
          <li>
            <b>drills</b> — pseudo-words built only from your unlocked letters. Always available.
          </li>
        </ul>

        <h3>The on-screen keyboard's colours</h3>
        <p>Each letter key carries your mastery as a background colour:</p>
        <ul>
          <li>
            <b>Faint / outline</b> — locked (not yet unlocked in adaptive mode).
          </li>
          <li>
            <b>Muted</b> — new (unlocked but never typed).
          </li>
          <li>
            <b>Warm (red→amber)</b> — slow. Your speed on this key is well below target.
          </li>
          <li>
            <b>Mid (green)</b> — getting there.
          </li>
          <li>
            <b>Cool (cyan)</b> — at or above target. Mastered for now.
          </li>
        </ul>
        <p>
          The single weakest active letter is marked with a subtle accent fill — that's the letter
          the adaptive engine has flagged as currently weakest. The label below the keyboard echoes
          it as <code>weakest: x</code>. It's a status indicator, not a content filter — the passage
          you read isn't biased toward that letter. In <b>auto</b> mode the LETTERS in your passage
          are restricted to your unlocked alphabet (digits and punctuation always pass — see Numbers
          and punctuation above); in <b>quotes</b>, <b>codes</b>, <b>mine</b> and the other explicit
          sources the alphabet filter is dropped entirely and you read whatever the source serves.
        </p>

        <h3>Keystroke sounds</h3>
        <p>
          Four packs: <b>off</b>, <b>mechvibe</b> (synthesised), <b>typewriter</b> (real mechanical
          typewriter samples), and <b>soft</b>. The synthesised packs are generated on-device with
          the Web Audio API. Modifier keys (Shift, Ctrl, Alt, Cmd) are silent; Tab / Enter / Esc /
          Space each get their own click.
        </p>

        <h3>Whitespace markers</h3>
        <p>
          Space, tab, and newline characters render as faint <code>·</code>, <code>→</code>, and{" "}
          <code>↵</code> glyphs in the typing surface so you can verify you're hitting the right
          invisible key. Toggle off in Settings → Appearance if the markers feel busy.
        </p>

        <h3>Stats and milestones</h3>
        <p>
          The <a href="#/stats">stats</a> page rolls up your run history into per-source WPM trends,
          a per-finger speed/error breakdown, and a streak/milestone tracker. The same milestone
          logic powers the achievement banner that pops on the Results card when a run unlocks
          something new.
        </p>

        <h3>Sharing a run</h3>
        <p>
          The <b>copy share link</b> button on Results builds a <code>#/share/&lt;payload&gt;</code>{" "}
          URL that encodes the headline numbers and the passage snippet. The recipient sees a
          read-only card — nothing about your full profile is shared.
        </p>

        <h3>Your library</h3>
        <p>
          Drop <code>.txt</code> or <code>.md</code> files into the <a href="#/library">library</a>{" "}
          and they appear under the <b>mine</b> source. Everything stays in your browser; nothing
          uploads. Long files get auto-chunked into typeable paragraphs.
        </p>
      </section>

      <div class="actions">
        <BackLink from="guide" onNavigate={props.onNavigate} />
      </div>
    </main>
  );
}
