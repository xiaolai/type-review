import { describe, expect, it } from "vitest";
import {
  checkDetAnswer,
  detAcceptedAnswers,
  detDisplayLetters,
  detItemDifficulty,
  detItemId,
  detItemsForTarget,
  detLetterStates,
  detMissingPart,
  detMistakeItems,
  detSlotCount,
  detTargetBand,
  detVisiblePrefix,
  normalizeDetAnswer,
  updateDetMistakes,
} from "./det-practice";
import { DET_READ_COMPLETE_ITEMS } from "./det-practice-data";

describe("det practice helpers", () => {
  it("normalizes learner input before checking", () => {
    expect(normalizeDetAnswer("  REQ__UI.RE ")).toBe("require");
  });

  it("uses prefix-only blanks with no trailing suffix reveal", () => {
    for (const item of DET_READ_COMPLETE_ITEMS) {
      expect(item.word.toLowerCase().startsWith(item.prefix.toLowerCase())).toBe(true);
      expect(detMissingPart(item).length).toBeGreaterThan(0);
      expect(detSlotCount(item)).toBe(item.word.length - item.prefix.length);
    }
  });

  it("keeps clue length attached to the item, not the target score", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "requirements");
    expect(item).toBeDefined();
    if (!item) return;

    expect(detVisiblePrefix(item)).toBe("requi");
    expect(detMissingPart(item)).toBe("rements");
    expect(detSlotCount(item)).toBe(7);
  });

  it("uses custom target scores to choose a matching practice bank", () => {
    const easy = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "license");
    const hard = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "constitutional");
    expect(easy).toBeDefined();
    expect(hard).toBeDefined();
    if (!easy || !hard) return;

    expect(detItemDifficulty(easy)).toBe("105");
    expect(detItemDifficulty(hard)).toBe("125");
    expect(detTargetBand(107)).toBe("105");
    expect(detTargetBand(118)).toBe("115");
    expect(detTargetBand(130)).toBe("125");
    expect(detItemsForTarget(DET_READ_COMPLETE_ITEMS, 105)).not.toContain(hard);
    expect(detItemsForTarget(DET_READ_COMPLETE_ITEMS, 130)).not.toContain(easy);
    expect(detItemsForTarget(DET_READ_COMPLETE_ITEMS, 115)).toContain(easy);
    expect(detItemsForTarget(DET_READ_COMPLETE_ITEMS, 115)).toContain(hard);
  });

  it("accepts missing letters, prefix plus missing letters, and the full word", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "requirements");
    expect(item).toBeDefined();
    if (!item) return;

    expect(detAcceptedAnswers(item)).toEqual(new Set(["rements", "requirements"]));
    expect(checkDetAnswer(item, "rements")).toBe("correct");
    expect(checkDetAnswer(item, "requirements")).toBe("correct");
    expect(checkDetAnswer(item, "requi rements")).toBe("correct");
    expect(checkDetAnswer(item, "require")).toBe("wrong");
  });

  it("maps full-word input back into visible slots", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "cognitive");
    expect(item).toBeDefined();
    if (!item) return;
    expect(detDisplayLetters(item, "cognitive")).toBe("itive");
    expect(detDisplayLetters(item, "itive")).toBe("itive");
    expect(detDisplayLetters(item, "cognit")).toBe("it");
  });

  it("marks each missing letter as correct or incorrect", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "requirements");
    expect(item).toBeDefined();
    if (!item) return;

    expect(detLetterStates(item, "remants")).toEqual([
      "correct",
      "correct",
      "correct",
      "incorrect",
      "correct",
      "correct",
      "correct",
    ]);
    expect(detLetterStates(item, "requirements")).toEqual([
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ]);
  });

  it("builds a rolling mistake bank and removes items after a correct retry", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "requirements");
    expect(item).toBeDefined();
    if (!item) return;

    const first = updateDetMistakes([], item, 115, "wrong", 10);
    expect(first).toEqual([
      {
        id: detItemId(item),
        targetScore: 115,
        misses: 1,
        lastMissedAt: 10,
        lastPracticedAt: 10,
      },
    ]);
    const second = updateDetMistakes(first, item, 125, "empty", 20);
    expect(second[0]).toMatchObject({ targetScore: 125, misses: 2, lastMissedAt: 20 });
    expect(detMistakeItems(DET_READ_COMPLETE_ITEMS, second)).toEqual([item]);
    expect(updateDetMistakes(second, item, 125, "correct", 30)).toEqual([]);
  });
});
