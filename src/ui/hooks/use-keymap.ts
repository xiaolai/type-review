import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import type { KeyMap } from "../components/keymaps";

const STORAGE_KEY = "type-review:keymap";
const DEFAULT_KEYMAP: KeyMap = "qwerty";

function readStored(): KeyMap {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_KEYMAP;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "qwerty" || v === "colemak" || v === "dvorak" ? v : DEFAULT_KEYMAP;
  } catch {
    return DEFAULT_KEYMAP;
  }
}

function write(value: KeyMap): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Best-effort: ignore.
  }
}

export interface KeymapPref {
  keymap: Accessor<KeyMap>;
  setKeymap: (next: KeyMap) => void;
}

/**
 * Persisted choice of character keymap — `qwerty` (default) or
 * `colemak`. Purely visual: the engine consumes whatever the OS sends.
 * The on-screen keyboard uses this to draw the correct letter at each
 * physical position for users whose OS is set to a non-QWERTY layout.
 */
export function createKeymap(): KeymapPref {
  const [keymap, setSignal] = createSignal<KeyMap>(readStored());
  return {
    keymap,
    setKeymap: (next) => {
      setSignal(next);
      write(next);
    },
  };
}
