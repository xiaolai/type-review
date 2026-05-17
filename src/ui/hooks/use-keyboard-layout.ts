import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import type { KeyboardLayoutName } from "../components/keyboard-layouts";

const STORAGE_KEY = "type-review:keyboard-layout";

function isMacUserAgent(): boolean {
  try {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent ?? "";
    return /Mac|iPhone|iPad|iPod/i.test(ua);
  } catch {
    return false;
  }
}

function readStored(): KeyboardLayoutName | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "mac" || v === "windows" ? v : null;
  } catch {
    return null;
  }
}

function write(value: KeyboardLayoutName): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Best-effort: ignore.
  }
}

export interface KeyboardLayoutPref {
  layout: Accessor<KeyboardLayoutName>;
  setLayout: (next: KeyboardLayoutName) => void;
}

/**
 * Persisted choice between the Mac and Windows on-screen keyboard layouts.
 * If the user has never picked one, we fall back to a userAgent sniff.
 * (Auto-detection wrong? They can flip it once in Settings.)
 */
export function createKeyboardLayout(): KeyboardLayoutPref {
  const stored = readStored();
  const initial: KeyboardLayoutName = stored ?? (isMacUserAgent() ? "mac" : "windows");
  const [layout, setLayoutSignal] = createSignal<KeyboardLayoutName>(initial);
  return {
    layout,
    setLayout: (next) => {
      setLayoutSignal(next);
      write(next);
    },
  };
}
