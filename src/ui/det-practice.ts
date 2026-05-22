import type { DetPracticeItem } from "./det-practice-data";

export type DetAnswerState = "empty" | "correct" | "wrong";
export type DetTargetLevel = "105" | "115" | "125";

const TARGET_PREFIX_OFFSET: Record<DetTargetLevel, number> = {
  "105": 1,
  "115": 0,
  "125": -1,
};

export function normalizeDetAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function detPrefixForTarget(item: DetPracticeItem, target: DetTargetLevel = "115"): string {
  const word = item.word;
  const minPrefixLength = Math.min(2, Math.max(1, word.length - 1));
  const maxPrefixLength = Math.max(minPrefixLength, word.length - 1);
  const requested = item.prefix.length + TARGET_PREFIX_OFFSET[target];
  const length = Math.min(Math.max(requested, minPrefixLength), maxPrefixLength);
  return word.slice(0, length);
}

export function detMissingPart(item: DetPracticeItem, target: DetTargetLevel = "115"): string {
  return item.word.slice(detPrefixForTarget(item, target).length);
}

export function detSlotCount(item: DetPracticeItem, target: DetTargetLevel = "115"): number {
  return detMissingPart(item, target).replace(/[^A-Za-z]/g, "").length;
}

export function detAcceptedAnswers(
  item: DetPracticeItem,
  target: DetTargetLevel = "115",
): ReadonlySet<string> {
  const missing = normalizeDetAnswer(detMissingPart(item, target));
  const prefix = normalizeDetAnswer(detPrefixForTarget(item, target));
  const word = normalizeDetAnswer(item.word);
  return new Set([missing, prefix + missing, word].filter(Boolean));
}

export function checkDetAnswer(
  item: DetPracticeItem,
  rawValue: string,
  target: DetTargetLevel = "115",
): DetAnswerState {
  const value = normalizeDetAnswer(rawValue);
  if (value.length === 0) return "empty";
  return detAcceptedAnswers(item, target).has(value) ? "correct" : "wrong";
}

export function detDisplayLetters(
  item: DetPracticeItem,
  rawValue: string,
  target: DetTargetLevel = "115",
): string {
  const value = normalizeDetAnswer(rawValue);
  const prefix = normalizeDetAnswer(detPrefixForTarget(item, target));
  const word = normalizeDetAnswer(item.word);
  const missing = normalizeDetAnswer(detMissingPart(item, target));
  if (value === word) return missing;
  if (prefix.length > 0 && value.startsWith(prefix)) {
    return value.slice(prefix.length, prefix.length + missing.length);
  }
  return value.slice(0, missing.length);
}
