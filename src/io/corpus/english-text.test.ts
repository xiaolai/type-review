import { describe, expect, it } from "vitest";
import quotesJson from "./data/quotes.json";
import { ASCII_FOLD_TABLE, sanitize } from "./sanitize";

/**
 * The practice text is typeable on an English keyboard.
 *
 * The app's EnglishTextTests also checks every quote is English with the
 * system language recogniser, which has no counterpart here. The two corpora
 * are the same bytes and the corpus vectors hold them together, so one
 * language check covers both.
 */

function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

const hex = (cp: number): string => `U+${cp.toString(16).toUpperCase()}`;

describe("English-keyboard text", () => {
  // Every character in the basic plane rather than examples. In chunks,
  // because the passage cap would otherwise cut the input short.
  it("no character survives cleaning outside ASCII", () => {
    for (let start = 0x80; start <= 0xffff; start += 500) {
      let chunk = "";
      for (let cp = start; cp < Math.min(start + 500, 0x10000); cp++) {
        if (cp >= 0xd800 && cp <= 0xdfff) continue;
        chunk += `${String.fromCharCode(cp)} `;
      }
      expect(isAscii(sanitize(chunk).text), `a character from ${hex(start)} survived`).toBe(true);
    }
  });

  // An entry for a character NFKD already decomposes can never run, because
  // decomposition happens first: a table that looks like coverage and is not.
  it("every fold entry is reachable and lands on ASCII", () => {
    for (const [cp, replacement] of ASCII_FOLD_TABLE) {
      const character = String.fromCharCode(cp);
      expect(character.normalize("NFKD"), `${hex(cp)} decomposes, so its entry is dead`).toBe(
        character,
      );
      expect(isAscii(replacement), `${hex(cp)} folds to non-ASCII`).toBe(true);
    }
  });

  it("every bundled quote is ASCII once cleaned", () => {
    const entries = (quotesJson as { entries: { id: string; text: string }[] }).entries;
    expect(entries.length).toBeGreaterThan(100);
    for (const entry of entries) {
      expect(isAscii(sanitize(entry.text).text), entry.id).toBe(true);
    }
  });

  // Cleaning is a net for pasted text, not what makes this corpus English. A
  // quote it has to cut, or cuts away entirely, should not be in the file, and
  // one cut to nothing used to vanish at load along with any check of it.
  it("no bundled quote loses a character to cleaning", () => {
    const entries = (quotesJson as { entries: { id: string; text: string }[] }).entries;
    for (const entry of entries) {
      const cleaned = sanitize(entry.text);
      expect(cleaned.droppedChars, `${entry.id} loses characters to cleaning`).toBe(0);
      expect(cleaned.text.length, `${entry.id} cleans to nothing`).toBeGreaterThan(0);
    }
  });
});
