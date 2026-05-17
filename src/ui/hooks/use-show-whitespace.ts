import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import { readBooleanPref, writeBooleanPref } from "./persisted-boolean";

const STORAGE_KEY = "type-review:show-whitespace";

export interface ShowWhitespaceControl {
  visible: Accessor<boolean>;
  setVisible: (next: boolean) => void;
}

/**
 * Persisted "show whitespace markers" preference. Drives the `·`/`→`/`↵`
 * pseudo-element overlays on the typing surface (see styles.css, the
 * `.char--space::before` block). Toggle lives in Settings → Appearance.
 *
 * Default on. Stored as `"1"` / `"0"` in localStorage. Theme-style
 * preference, not session state — outside `ProfileSettings` for the
 * same reasons `createKeyboardToggle` is.
 */
export function createShowWhitespace(): ShowWhitespaceControl {
  const [visible, setSignal] = createSignal<boolean>(readBooleanPref(STORAGE_KEY, true));
  return {
    visible,
    setVisible: (next) => {
      setSignal(next);
      writeBooleanPref(STORAGE_KEY, next);
    },
  };
}
