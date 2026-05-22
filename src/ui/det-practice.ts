import type { DetPracticeItem } from "./det-practice-data";

export type DetAnswerState = "empty" | "correct" | "wrong";
export type DetLetterState = "empty" | "correct" | "incorrect";
export type DetTargetBand = "105" | "115" | "125";
export type DetTargetScore = number;
export type DetDrillMode = "all" | "missed";

export interface DetMistakeRecord {
  readonly id: string;
  readonly targetScore: DetTargetScore;
  readonly misses: number;
  readonly lastMissedAt: number;
  readonly lastPracticedAt: number;
}

export const DET_MISTAKES_STORAGE_KEY = "type-review:det-mistakes";
export const DET_MISTAKES_LIMIT = 50;

const TARGET_RANK: Record<DetTargetBand, number> = {
  "105": 1,
  "115": 2,
  "125": 3,
};

const ACADEMIC_TOPICS = new Set(["biology", "law", "politics", "technology"]);

export function normalizeDetAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function detTargetBand(targetScore: DetTargetScore): DetTargetBand {
  if (targetScore >= 125) return "125";
  if (targetScore >= 110) return "115";
  return "105";
}

export function detVisiblePrefix(item: DetPracticeItem): string {
  return item.prefix;
}

export function detItemId(item: DetPracticeItem): string {
  return [
    item.topic,
    normalizeDetAnswer(item.word),
    normalizeDetAnswer(item.prefix),
    normalizeDetAnswer(item.before).slice(0, 24),
  ].join(":");
}

export function detItemDifficulty(item: DetPracticeItem): DetTargetBand {
  const wordLength = normalizeDetAnswer(item.word).length;
  const missingLetters = Math.max(0, wordLength - normalizeDetAnswer(item.prefix).length);
  const academicBonus = ACADEMIC_TOPICS.has(item.topic) ? 1 : 0;
  const score = wordLength + missingLetters + academicBonus;
  if (score >= 20) return "125";
  if (score >= 15) return "115";
  return "105";
}

export function detItemsForTarget(
  items: readonly DetPracticeItem[],
  targetScore: DetTargetScore,
): readonly DetPracticeItem[] {
  const target = detTargetBand(targetScore);
  const targetRank = TARGET_RANK[target];
  const filtered = items.filter((item) => {
    const rank = TARGET_RANK[detItemDifficulty(item)];
    if (target === "105") return rank <= targetRank + 1;
    if (target === "125") return rank >= targetRank - 1;
    return true;
  });
  return filtered.length > 0 ? filtered : items;
}

export function detMistakeItems(
  items: readonly DetPracticeItem[],
  mistakes: readonly DetMistakeRecord[],
): readonly DetPracticeItem[] {
  const byId = new Map(mistakes.map((mistake) => [mistake.id, mistake]));
  return items
    .filter((item) => byId.has(detItemId(item)))
    .sort((a, b) => {
      const left = byId.get(detItemId(a));
      const right = byId.get(detItemId(b));
      if (!left || !right) return 0;
      return right.misses - left.misses || right.lastMissedAt - left.lastMissedAt;
    });
}

export function detMissingPart(item: DetPracticeItem): string {
  return item.word.slice(detVisiblePrefix(item).length);
}

export function detSlotCount(item: DetPracticeItem): number {
  return detMissingPart(item).replace(/[^A-Za-z]/g, "").length;
}

export function detAcceptedAnswers(item: DetPracticeItem): ReadonlySet<string> {
  const missing = normalizeDetAnswer(detMissingPart(item));
  const prefix = normalizeDetAnswer(detVisiblePrefix(item));
  const word = normalizeDetAnswer(item.word);
  return new Set([missing, prefix + missing, word].filter(Boolean));
}

export function checkDetAnswer(item: DetPracticeItem, rawValue: string): DetAnswerState {
  const value = normalizeDetAnswer(rawValue);
  if (value.length === 0) return "empty";
  return detAcceptedAnswers(item).has(value) ? "correct" : "wrong";
}

export function detDisplayLetters(item: DetPracticeItem, rawValue: string): string {
  const value = normalizeDetAnswer(rawValue);
  const prefix = normalizeDetAnswer(detVisiblePrefix(item));
  const word = normalizeDetAnswer(item.word);
  const missing = normalizeDetAnswer(detMissingPart(item));
  if (value === word) return missing;
  if (prefix.length > 0 && value.startsWith(prefix)) {
    return value.slice(prefix.length, prefix.length + missing.length);
  }
  return value.slice(0, missing.length);
}

export function detLetterStates(
  item: DetPracticeItem,
  rawValue: string,
): readonly DetLetterState[] {
  const missing = normalizeDetAnswer(detMissingPart(item));
  const display = detDisplayLetters(item, rawValue);
  return Array.from({ length: missing.length }, (_, index) => {
    const typed = display[index];
    if (!typed) return "empty";
    return typed === missing[index] ? "correct" : "incorrect";
  });
}

export function updateDetMistakes(
  mistakes: readonly DetMistakeRecord[],
  item: DetPracticeItem,
  targetScore: DetTargetScore,
  outcome: DetAnswerState,
  now = Date.now(),
  limit = DET_MISTAKES_LIMIT,
): readonly DetMistakeRecord[] {
  const id = detItemId(item);
  if (outcome === "correct") {
    return mistakes.filter((mistake) => mistake.id !== id);
  }
  const previous = mistakes.find((mistake) => mistake.id === id);
  const next: DetMistakeRecord = {
    id,
    targetScore,
    misses: (previous?.misses ?? 0) + 1,
    lastMissedAt: now,
    lastPracticedAt: now,
  };
  return [next, ...mistakes.filter((mistake) => mistake.id !== id)]
    .sort((a, b) => b.misses - a.misses || b.lastMissedAt - a.lastMissedAt)
    .slice(0, limit);
}
