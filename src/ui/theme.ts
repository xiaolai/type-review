import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";

export type Theme = "dark" | "light" | "sepia" | "high-contrast";

const STORAGE_KEY = "type-review:theme";
const VALID_THEMES: readonly Theme[] = ["dark", "light", "sepia", "high-contrast"];

/**
 * Reads the theme from localStorage. Strict membership check against the
 * known set — anything else (including unknown / tampered) falls back to
 * the OS-preference auto-pick. Loose `?? "dark"` would let a malicious or
 * buggy writer get an arbitrary string into `dataset.theme` later.
 */
function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && (VALID_THEMES as readonly string[]).includes(raw)) {
      return raw as Theme;
    }
  } catch (err) {
    console.debug("type-review: theme storage unavailable (read)", err);
  }
  return defaultFromOs();
}

/** OS-preference auto-pick when no explicit user choice is stored. */
function defaultFromOs(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  // High-contrast preference is the strongest signal — honour it first.
  if (window.matchMedia("(prefers-contrast: more)").matches) {
    return "high-contrast";
  }
  if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export interface ThemeController {
  theme: Accessor<Theme>;
  setTheme: (theme: Theme) => void;
}

/**
 * Theme state, persisted to localStorage and reflected onto the document root
 * as `data-theme`. Kept out of the Profile: a display preference, not typing
 * data.
 */
export function createTheme(): ThemeController {
  const [theme, set] = createSignal<Theme>(loadTheme());

  const apply = (next: Theme): void => {
    set(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      // Persistence is best-effort; private mode and quota limits are non-fatal.
      console.debug("type-review: theme storage unavailable (write)", err);
    }
  };

  document.documentElement.dataset.theme = theme();
  return { theme, setTheme: apply };
}
