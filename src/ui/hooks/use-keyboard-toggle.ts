import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import { readBooleanPref, writeBooleanPref } from "./persisted-boolean";

const STORAGE_KEY = "type-review:show-keyboard";

export interface KeyboardToggle {
  visible: Accessor<boolean>;
  toggle: () => void;
}

/**
 * Show/hide preference for the on-screen keyboard, persisted in localStorage.
 * Default on — the keyboard surface is part of the practice page's identity
 * (layout + heatmap + key glow), so a first-time visitor should see it
 * without hunting for a toggle. Power users hide it once and the choice
 * sticks.
 *
 * Not in `ProfileSettings` on purpose: a viewport preference doesn't need to
 * round-trip through `validateSettings`, and keeping it out keeps the settings
 * surface narrow. Promote later if it earns the slot.
 */
export function createKeyboardToggle(): KeyboardToggle {
  const [visible, setVisible] = createSignal<boolean>(readBooleanPref(STORAGE_KEY, true));
  return {
    visible,
    toggle: () => {
      setVisible((prev) => {
        const next = !prev;
        writeBooleanPref(STORAGE_KEY, next);
        return next;
      });
    },
  };
}
