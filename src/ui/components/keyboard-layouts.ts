/**
 * Full 6-row ANSI keyboard layouts. Ported from the design drop's
 * `keyboard.jsx`. The two layouts share rows 2-5 (number / tab / caps /
 * shift) and diverge on the function row and the bottom modifier row.
 *
 * Each key is described by a `KeyDef`. `codes` lists the `KeyboardEvent.code`
 * values that should drive its pressed-state (typically one; the Mac arrow
 * cluster's combined ↑↓ cell takes two). Keys with no code (Touch ID,
 * Print Screen) simply never light up.
 */

export type KeyboardLayoutName = "mac" | "windows";

export type KeyVariant = "mod" | "space";
export type KeyIcon = "win-logo" | "fingerprint" | "maximize" | "touch-id";

export interface KeyDef {
  /** Stable per-key handle. For letters/digits this matches the keystroke. */
  id: string;
  /** What renders on the cap. */
  label: string;
  /** Optional smaller subtitle below the label (`⌫`, `⇧`, etc.). */
  sub?: string;
  /**
   * The character produced when Shift is held. Drawn as a smaller line
   * above the main label — `!` above `1`, `<` above `,`, `:` above `;`,
   * etc. Mirrors physical ANSI keycaps where the shifted glyph sits on
   * top and the unshifted glyph sits on the bottom.
   */
  shifted?: string;
  /** Width in `u`. 1u = base cap. */
  width: number;
  /** `KeyboardEvent.code` values that drive pressed-state. */
  codes?: readonly string[];
  /** Lowercase letter for heatmap lookup against `LessonPlan.keys`. */
  letter?: string;
  /** Style hint: `mod` (smaller dim text), `space` (spacebar background). */
  variant?: KeyVariant;
  /** Render an inline SVG instead of the text label. */
  icon?: KeyIcon;
  /**
   * Horizontal alignment of the label + sub stack within the cap.
   * Defaults to centered. Mac modifier keys use `"start"` on the left side
   * of space and `"end"` on the right, matching real Apple caps where the
   * glyph and word hug the outer edge.
   */
  align?: "start" | "end";
}

/* ---- shared rows ------------------------------------------------------- */

const FUNCTION_ROW_BASE: readonly KeyDef[] = [
  { id: "esc", label: "esc", width: 2, codes: ["Escape"], variant: "mod" },
  ...Array.from({ length: 12 }, (_, i): KeyDef => {
    const n = i + 1;
    return {
      id: `f${n}`,
      label: `F${n}`,
      width: 1,
      codes: [`F${n}`],
      variant: "mod",
    };
  }),
];

// `letter` carries the QWERTY identity of each physical position — used
// both for heatmap lookup against `LessonPlan.keys` and as the input to
// the keymap remapper (`mapLetter`). Stationary keys under all keymaps
// (digits, backtick) still need this so they can be remapped under
// Dvorak, which moves `-` `=` and the backtick row layout slightly.
const NUMBER_ROW_LETTERS: readonly KeyDef[] = [
  { id: "`", label: "`", shifted: "~", width: 1, codes: ["Backquote"], letter: "`" },
  { id: "1", label: "1", shifted: "!", width: 1, codes: ["Digit1"], letter: "1" },
  { id: "2", label: "2", shifted: "@", width: 1, codes: ["Digit2"], letter: "2" },
  { id: "3", label: "3", shifted: "#", width: 1, codes: ["Digit3"], letter: "3" },
  { id: "4", label: "4", shifted: "$", width: 1, codes: ["Digit4"], letter: "4" },
  { id: "5", label: "5", shifted: "%", width: 1, codes: ["Digit5"], letter: "5" },
  { id: "6", label: "6", shifted: "^", width: 1, codes: ["Digit6"], letter: "6" },
  { id: "7", label: "7", shifted: "&", width: 1, codes: ["Digit7"], letter: "7" },
  { id: "8", label: "8", shifted: "*", width: 1, codes: ["Digit8"], letter: "8" },
  { id: "9", label: "9", shifted: "(", width: 1, codes: ["Digit9"], letter: "9" },
  { id: "0", label: "0", shifted: ")", width: 1, codes: ["Digit0"], letter: "0" },
  { id: "-", label: "-", shifted: "_", width: 1, codes: ["Minus"], letter: "-" },
  { id: "=", label: "=", shifted: "+", width: 1, codes: ["Equal"], letter: "=" },
];

const TAB_ROW_LETTERS: readonly KeyDef[] = [
  { id: "q", label: "q", width: 1, codes: ["KeyQ"], letter: "q" },
  { id: "w", label: "w", width: 1, codes: ["KeyW"], letter: "w" },
  { id: "e", label: "e", width: 1, codes: ["KeyE"], letter: "e" },
  { id: "r", label: "r", width: 1, codes: ["KeyR"], letter: "r" },
  { id: "t", label: "t", width: 1, codes: ["KeyT"], letter: "t" },
  { id: "y", label: "y", width: 1, codes: ["KeyY"], letter: "y" },
  { id: "u", label: "u", width: 1, codes: ["KeyU"], letter: "u" },
  { id: "i", label: "i", width: 1, codes: ["KeyI"], letter: "i" },
  { id: "o", label: "o", width: 1, codes: ["KeyO"], letter: "o" },
  { id: "p", label: "p", width: 1, codes: ["KeyP"], letter: "p" },
  { id: "[", label: "[", shifted: "{", width: 1, codes: ["BracketLeft"], letter: "[" },
  { id: "]", label: "]", shifted: "}", width: 1, codes: ["BracketRight"], letter: "]" },
];

const CAPS_ROW_LETTERS: readonly KeyDef[] = [
  { id: "a", label: "a", width: 1, codes: ["KeyA"], letter: "a" },
  { id: "s", label: "s", width: 1, codes: ["KeyS"], letter: "s" },
  { id: "d", label: "d", width: 1, codes: ["KeyD"], letter: "d" },
  { id: "f", label: "f", width: 1, codes: ["KeyF"], letter: "f" },
  { id: "g", label: "g", width: 1, codes: ["KeyG"], letter: "g" },
  { id: "h", label: "h", width: 1, codes: ["KeyH"], letter: "h" },
  { id: "j", label: "j", width: 1, codes: ["KeyJ"], letter: "j" },
  { id: "k", label: "k", width: 1, codes: ["KeyK"], letter: "k" },
  { id: "l", label: "l", width: 1, codes: ["KeyL"], letter: "l" },
  { id: ";", label: ";", shifted: ":", width: 1, codes: ["Semicolon"], letter: ";" },
  { id: "'", label: "'", shifted: '"', width: 1, codes: ["Quote"], letter: "'" },
];

const SHIFT_ROW_LETTERS: readonly KeyDef[] = [
  { id: "z", label: "z", width: 1, codes: ["KeyZ"], letter: "z" },
  { id: "x", label: "x", width: 1, codes: ["KeyX"], letter: "x" },
  { id: "c", label: "c", width: 1, codes: ["KeyC"], letter: "c" },
  { id: "v", label: "v", width: 1, codes: ["KeyV"], letter: "v" },
  { id: "b", label: "b", width: 1, codes: ["KeyB"], letter: "b" },
  { id: "n", label: "n", width: 1, codes: ["KeyN"], letter: "n" },
  { id: "m", label: "m", width: 1, codes: ["KeyM"], letter: "m" },
  { id: ",", label: ",", shifted: "<", width: 1, codes: ["Comma"], letter: "," },
  { id: ".", label: ".", shifted: ">", width: 1, codes: ["Period"], letter: "." },
  { id: "/", label: "/", shifted: "?", width: 1, codes: ["Slash"], letter: "/" },
];

/* ---- mac-specific ------------------------------------------------------ */

const MAC_FUNCTION_ROW: readonly KeyDef[] = [
  ...FUNCTION_ROW_BASE,
  // Touch ID — a large outlined circle, centered. Mirrors the physical
  // round button on real Apple keyboards. Rendered as an SVG so its
  // diameter and centering are pixel-perfect across browsers / fonts.
  { id: "touchid", label: "", width: 1, variant: "mod", icon: "touch-id" },
];

const MAC_BOTTOM_ROW: readonly KeyDef[] = [
  { id: "fn", label: "fn", width: 1, variant: "mod" },
  {
    id: "ctrl",
    label: "⌃",
    sub: "control",
    width: 1,
    codes: ["ControlLeft"],
    variant: "mod",
    align: "start",
  },
  {
    id: "opt",
    label: "⌥",
    sub: "option",
    width: 1,
    codes: ["AltLeft"],
    variant: "mod",
    align: "start",
  },
  {
    id: "cmd",
    label: "⌘",
    sub: "command",
    width: 1.25,
    codes: ["MetaLeft"],
    variant: "mod",
    align: "start",
  },
  // Space is 6u; right-side mods carry the remaining 4.75u. Each one is its
  // left-side mirror + 0.5u, preserving the "cmd widest closest to space"
  // rhythm. Row math: fn(1) + ctrl(1) + opt(1) + cmd(1.25) + space(6) +
  //                   cmd2(1.75) + opt2(1.5) + ctrl2(1.5) = 15u.
  { id: "space", label: " ", width: 6, codes: ["Space"], letter: " ", variant: "space" },
  {
    id: "cmd2",
    label: "⌘",
    sub: "command",
    width: 1.75,
    codes: ["MetaRight"],
    variant: "mod",
    align: "end",
  },
  {
    id: "opt2",
    label: "⌥",
    sub: "option",
    width: 1.5,
    codes: ["AltRight"],
    variant: "mod",
    align: "end",
  },
  {
    id: "ctrl2",
    label: "⌃",
    sub: "control",
    width: 1.5,
    codes: ["ControlRight"],
    variant: "mod",
    align: "end",
  },
];

/* ---- windows-specific -------------------------------------------------- */

const WIN_FUNCTION_ROW: readonly KeyDef[] = [
  ...FUNCTION_ROW_BASE,
  { id: "prtsc", label: "PrtSc", width: 1, variant: "mod", icon: "maximize" },
];

const WIN_BOTTOM_ROW: readonly KeyDef[] = [
  { id: "ctrl", label: "Ctrl", width: 1.25, codes: ["ControlLeft"], variant: "mod" },
  {
    id: "win",
    label: "",
    width: 1.25,
    codes: ["MetaLeft"],
    variant: "mod",
    icon: "win-logo",
  },
  { id: "alt", label: "Alt", width: 1.25, codes: ["AltLeft"], variant: "mod" },
  { id: "space", label: " ", width: 6.25, codes: ["Space"], letter: " ", variant: "space" },
  { id: "altgr", label: "Alt", width: 1.25, codes: ["AltRight"], variant: "mod" },
  {
    id: "win2",
    label: "",
    width: 1.25,
    codes: ["MetaRight"],
    variant: "mod",
    icon: "win-logo",
  },
  {
    id: "menu",
    label: "≡",
    width: 1.25,
    codes: ["ContextMenu"],
    variant: "mod",
  },
  { id: "ctrl2", label: "Ctrl", width: 1.25, codes: ["ControlRight"], variant: "mod" },
];

/* ---- per-layout edge labels for rows 2-5 ------------------------------ */

interface EdgeKeys {
  backspace: KeyDef;
  tab: KeyDef;
  backslash: KeyDef;
  caps: KeyDef;
  enter: KeyDef;
  lshift: KeyDef;
  rshift: KeyDef;
}

function macEdges(): EdgeKeys {
  // Mac edge keys carry their glyph only — no spelled-out word. Glyphs hug
  // the outer edge of the keyboard: left-row caps (tab / caps / lshift)
  // align-start; right-row caps (backspace / enter / rshift) align-end.
  return {
    backspace: {
      id: "backspace",
      label: "⌫",
      width: 2,
      codes: ["Backspace"],
      variant: "mod",
      align: "end",
    },
    tab: {
      id: "tab",
      label: "⇥",
      width: 1.5,
      codes: ["Tab"],
      variant: "mod",
      align: "start",
    },
    backslash: {
      id: "\\",
      label: "\\",
      shifted: "|",
      width: 1.5,
      codes: ["Backslash"],
      letter: "\\",
    },
    caps: {
      id: "caps",
      label: "⇪",
      width: 1.75,
      codes: ["CapsLock"],
      variant: "mod",
      align: "start",
    },
    enter: {
      id: "enter",
      label: "⏎",
      width: 2.25,
      codes: ["Enter"],
      variant: "mod",
      align: "end",
    },
    lshift: {
      id: "lshift",
      label: "⇧",
      width: 2.25,
      codes: ["ShiftLeft"],
      variant: "mod",
      align: "start",
    },
    rshift: {
      id: "rshift",
      label: "⇧",
      width: 2.75,
      codes: ["ShiftRight"],
      variant: "mod",
      align: "end",
    },
  };
}

function winEdges(): EdgeKeys {
  return {
    backspace: {
      id: "backspace",
      label: "Backspace",
      width: 2,
      codes: ["Backspace"],
      variant: "mod",
    },
    tab: { id: "tab", label: "Tab", width: 1.5, codes: ["Tab"], variant: "mod" },
    backslash: {
      id: "\\",
      label: "\\",
      shifted: "|",
      width: 1.5,
      codes: ["Backslash"],
      letter: "\\",
    },
    caps: {
      id: "caps",
      label: "Caps",
      sub: "⇪",
      width: 1.75,
      codes: ["CapsLock"],
      variant: "mod",
    },
    enter: {
      id: "enter",
      label: "Enter",
      width: 2.25,
      codes: ["Enter"],
      variant: "mod",
    },
    lshift: {
      id: "lshift",
      label: "Shift",
      width: 2.25,
      codes: ["ShiftLeft"],
      variant: "mod",
    },
    rshift: {
      id: "rshift",
      label: "Shift",
      width: 2.75,
      codes: ["ShiftRight"],
      variant: "mod",
    },
  };
}

function buildLayout(
  functionRow: readonly KeyDef[],
  bottomRow: readonly KeyDef[],
  edges: EdgeKeys,
): readonly (readonly KeyDef[])[] {
  return [
    functionRow,
    [...NUMBER_ROW_LETTERS, edges.backspace],
    [edges.tab, ...TAB_ROW_LETTERS, edges.backslash],
    [edges.caps, ...CAPS_ROW_LETTERS, edges.enter],
    [edges.lshift, ...SHIFT_ROW_LETTERS, edges.rshift],
    bottomRow,
  ];
}

export const KEYBOARD_LAYOUTS: Record<KeyboardLayoutName, readonly (readonly KeyDef[])[]> = {
  mac: buildLayout(MAC_FUNCTION_ROW, MAC_BOTTOM_ROW, macEdges()),
  windows: buildLayout(WIN_FUNCTION_ROW, WIN_BOTTOM_ROW, winEdges()),
};
