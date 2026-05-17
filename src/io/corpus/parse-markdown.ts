/**
 * Markdown → plain text. Strips formatting markers without invoking a heavy
 * parser — for typing practice we want the visible reading text, not the
 * source markup.
 *
 * Imported lazily from `parse-text.ts` so this code only enters the bundle
 * when the user uploads a `.md` file.
 *
 * Rules applied, in order:
 *   1. Strip fenced code blocks (``` ... ```) entirely — typing them is not
 *      useful prose, and they include language tags + backticks.
 *   2. Strip ATX heading markers (`# `, `## `, ...) keeping the heading text.
 *   3. Strip blockquote markers (`> ` at line start).
 *   4. Strip unordered list markers (`- `, `* `, `+ `).
 *   5. Convert links `[text](url)` → `text`.
 *   6. Drop image syntax `![alt](url)` entirely (alt text is metadata, not
 *      reading text).
 *   7. Drop bold/italic/strike markers (`**`, `__`, `*`, `_`, `~~`).
 *   8. Drop inline code backticks but keep the contents.
 *   9. Drop horizontal-rule lines (`---`, `***`, `___`).
 *  10. Drop any remaining HTML tags.
 *  11. Hand off to `sanitize` (whitespace + control chars + cap).
 */

import { sanitize } from "./sanitize";

export function parseMarkdown(input: string): string {
  let s = input;

  // 1. Fenced code blocks — drop entirely.
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/~~~[\s\S]*?~~~/g, " ");

  // 6. Images — drop. Must run BEFORE the link rule so `![alt](url)` isn't
  //    converted to "alt" by the link rule.
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, " ");

  // 5. Links — keep the text.
  s = s.replace(/\[([^\]]+)]\([^)]*\)/g, "$1");

  // Strip per-line markers.
  s = s
    .split("\n")
    .map((line) => {
      let t = line.replace(/^\s{0,3}>+\s?/, ""); // blockquote
      t = t.replace(/^\s*[-*+]\s+/, ""); // unordered list
      t = t.replace(/^\s{0,3}#{1,6}\s+/, ""); // ATX heading
      if (/^\s*([-*_])\1{2,}\s*$/.test(t)) return ""; // horizontal rule
      return t;
    })
    .join("\n");

  // 7. Emphasis markers.
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/~~(.*?)~~/g, "$1");

  // 8. Inline code — keep the contents.
  s = s.replace(/`+([^`]+)`+/g, "$1");

  // 10. Any leftover HTML — drop tags.
  s = s.replace(/<[^>]+>/g, "");

  return sanitize(s).text;
}
