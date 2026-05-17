import type { JSX } from "solid-js";
import { createMemo, Index } from "solid-js";
import type { TypingSnapshot } from "../engine/typing";

export interface TypingAreaProps {
  typing: TypingSnapshot;
  /**
   * Show faint glyphs in place of invisible chars (space → ·, tab → →,
   * newline → ↵). Controlled by the Appearance → "Show whitespace
   * markers" toggle. When false the markers are suppressed via a
   * single CSS rule (`.typing-area--no-ws .char::before { content: none }`),
   * so toggling is just a class flip — no re-render of the char grid.
   */
  showWhitespace: boolean;
}

/**
 * Renders the text to type, one span per character. The span list is
 * length-stable for a run, so `<Index>` keeps the DOM nodes and only the
 * `classList` accessors re-run when the snapshot changes — keystroke updates
 * touch the minimum amount of DOM.
 *
 * The char array is memoised on `expected`: a per-keystroke snapshot tick must
 * not recreate the array, only the per-position class accessors should re-run.
 */
export function TypingArea(props: TypingAreaProps): JSX.Element {
  // Outer memo emits only when the expected *string* changes (Solid memos
  // dedupe by Object.is on the output), so the inner memo only re-runs
  // — and the spread only allocates — on a new run, not on every snapshot.
  const expected = createMemo(() => props.typing.expected);
  const chars = createMemo(() => [...expected()]);
  return (
    <section
      class="typing-area"
      classList={{ "typing-area--no-ws": !props.showWhitespace }}
      aria-label="typing area"
    >
      <Index each={chars()}>
        {(char, index) => (
          <span
            classList={{
              char: true,
              "char--correct": props.typing.statuses[index] === "correct",
              "char--incorrect": props.typing.statuses[index] === "incorrect",
              "char--current": index === props.typing.pos,
              "char--space": char() === " ",
              "char--tab": char() === "\t",
              "char--newline": char() === "\n",
            }}
          >
            {char()}
          </span>
        )}
      </Index>
    </section>
  );
}
