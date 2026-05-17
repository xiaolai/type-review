import type { JSX } from "solid-js";
import { Show } from "solid-js";
import type { SessionSnapshot } from "../../engine/session";

export interface TopbarProps {
  snap: SessionSnapshot;
  /** Show the live-metrics block only when the practice view is active. */
  showLive: boolean;
  onHomeClick: () => void;
}

/** Application top bar: brand button + (in practice view) live WPM / accuracy / mode. */
export function Topbar(props: TopbarProps): JSX.Element {
  return (
    <header class="topbar">
      <button
        type="button"
        class="logo logo--button"
        onClick={() => props.onHomeClick()}
        aria-label="home"
      >
        <BrandMark />
        <b>TYPE</b>
        <small>.review</small>
      </button>
      <Show when={props.showLive}>
        <div class="live">
          <span class="live__stat">{props.snap.liveMetrics.netWpm} wpm</span>
          <span class="live__stat">{props.snap.liveMetrics.accuracy}%</span>
          <span class="live__mode">{props.snap.mode}</span>
        </div>
      </Show>
    </header>
  );
}

/**
 * Same keyboard outline used by the favicon + apple-touch icon — bundled
 * inline so it inherits `currentColor` from the surrounding `.logo b`
 * (the accent-coloured "TYPE" word), and sized via 1em so it scales with
 * the logo's font size across the responsive type scale.
 */
function BrandMark(): JSX.Element {
  return (
    <svg
      class="logo__mark"
      viewBox="0 0 24 24"
      width="1.15em"
      height="1.15em"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8h.01" />
      <path d="M10 8h.01" />
      <path d="M14 8h.01" />
      <path d="M18 8h.01" />
      <path d="M8 12h.01" />
      <path d="M12 12h.01" />
      <path d="M16 12h.01" />
      <path d="M7 16h10" />
    </svg>
  );
}
