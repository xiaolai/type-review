/**
 * Character mappings for non-QWERTY keyboards. Independent of the
 * physical layout (`mac` / `windows`) — physical layout governs the
 * modifier-key arrangement, keymap governs which character each
 * letter cap actually produces on the user's OS.
 *
 * The mapping is purely visual: our engine consumes whatever
 * `KeyboardEvent.key` the OS sends. If the user has Colemak set at the
 * OS level, the engine receives Colemak characters automatically — this
 * file just tells the on-screen keyboard widget what to draw at each
 * physical position so the visual matches the user's mental model.
 */

export type KeyMap = "qwerty" | "colemak" | "dvorak";

/**
 * Standard Colemak mapping. 17 keys move relative to QWERTY; the rest
 * (q, w, a, z, x, c, v, b, m, h, plus all digits and punctuation) stay
 * put. Reference: https://colemak.com/Layout
 */
const COLEMAK_MAP: ReadonlyMap<string, string> = new Map([
  // top-row letters
  ["e", "f"],
  ["r", "p"],
  ["t", "g"],
  ["y", "j"],
  ["u", "l"],
  ["i", "u"],
  ["o", "y"],
  ["p", ";"],
  // home-row letters
  ["s", "r"],
  ["d", "s"],
  ["f", "t"],
  ["g", "d"],
  ["j", "n"],
  ["k", "e"],
  ["l", "i"],
  [";", "o"],
  // bottom-row letters
  ["n", "k"],
]);

/**
 * Dvorak Simplified Keyboard (US). Roughly 30 positions change relative
 * to QWERTY — vowels move to the home row's left half, common
 * consonants to the home row's right half. `a` and `m` are the only
 * letters that stay put. Reference: https://en.wikipedia.org/wiki/Dvorak_keyboard_layout
 */
const DVORAK_MAP: ReadonlyMap<string, string> = new Map([
  // number-row tail: `-` and `=` become `[` and `]`
  ["-", "["],
  ["=", "]"],
  // top-row positions q…p plus the two brackets
  ["q", "'"],
  ["w", ","],
  ["e", "."],
  ["r", "p"],
  ["t", "y"],
  ["y", "f"],
  ["u", "g"],
  ["i", "c"],
  ["o", "r"],
  ["p", "l"],
  ["[", "/"],
  ["]", "="],
  // home-row positions a…; plus the apostrophe
  ["s", "o"],
  ["d", "e"],
  ["f", "u"],
  ["g", "i"],
  ["j", "h"],
  ["k", "t"],
  ["l", "n"],
  [";", "s"],
  ["'", "-"],
  // bottom-row positions z…/
  ["z", ";"],
  ["x", "q"],
  ["c", "j"],
  ["v", "k"],
  ["b", "x"],
  ["n", "b"],
  [",", "w"],
  [".", "v"],
  ["/", "z"],
]);

/**
 * Resolve the effective character at a physical position for a given
 * keymap. Returns the QWERTY letter unchanged when the keymap is
 * `qwerty` or when the position doesn't move under the chosen layout.
 *
 * `qwertyLetter` is the value of `KeyDef.letter` (the QWERTY identity
 * of this physical position — `"e"`, `"1"`, `";"`, etc.).
 */
export function mapLetter(qwertyLetter: string, keymap: KeyMap): string {
  if (keymap === "qwerty") return qwertyLetter;
  const map = keymap === "colemak" ? COLEMAK_MAP : DVORAK_MAP;
  return map.get(qwertyLetter) ?? qwertyLetter;
}
