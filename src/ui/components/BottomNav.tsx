import type { JSX } from "solid-js";

export interface BottomNavProps {
  activePractice: boolean;
  activeDet: boolean;
  activeStats: boolean;
  activeLibrary: boolean;
  activeSettings: boolean;
  onPractice: () => void;
  onDet: () => void;
  onStats: () => void;
  onLibrary: () => void;
  onSettings: () => void;
}

/**
 * Primary navigation — minimal text links that flow inline beneath the
 * stage. The viewport bottom carries the meta-link `<Footer>` (about,
 * and what About hubs to), so this is not styled as chrome.
 */
export function BottomNav(props: BottomNavProps): JSX.Element {
  return (
    <nav class="subnav" aria-label="primary navigation">
      <NavLink label="practice" active={props.activePractice} onClick={props.onPractice} />
      <NavLink label="det" active={props.activeDet} onClick={props.onDet} />
      <NavLink label="stats" active={props.activeStats} onClick={props.onStats} />
      <NavLink label="library" active={props.activeLibrary} onClick={props.onLibrary} />
      <NavLink label="settings" active={props.activeSettings} onClick={props.onSettings} />
    </nav>
  );
}

function NavLink(props: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      class="subnav__item"
      classList={{ "subnav__item--active": props.active }}
      aria-current={props.active ? "page" : undefined}
      onClick={() => props.onClick()}
    >
      {props.label}
    </button>
  );
}
