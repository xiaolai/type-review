import { MAX_PASSAGE_CHARS } from "./sanitize";

/**
 * What cleaning did to a passage, or null if it changed nothing worth saying.
 * Mirrors the app's `LibraryImportReport.cleaningNote`: a truncation, and a
 * count of characters with no ASCII form that were removed rather than typed
 * around. Out of the Library component so it can be tested without one.
 */
export function cleaningNote(result: { truncated: boolean; droppedChars: number }): string | null {
  const parts: string[] = [];
  if (result.truncated) parts.push(`truncated to ${MAX_PASSAGE_CHARS.toLocaleString()} chars`);
  if (result.droppedChars > 0) parts.push(`${result.droppedChars} unusable characters removed`);
  return parts.length === 0 ? null : parts.join(", ");
}
