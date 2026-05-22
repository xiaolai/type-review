import { describe, expect, it } from "vitest";
import {
  checkDetAnswer,
  detAcceptedAnswers,
  detDisplayLetters,
  detMissingPart,
  detPrefixForTarget,
  detSlotCount,
  normalizeDetAnswer,
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

  it("adjusts visible clue length by target level", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "requirements");
    expect(item).toBeDefined();
    if (!item) return;

    expect(detPrefixForTarget(item, "105")).toBe("requir");
    expect(detMissingPart(item, "105")).toBe("ements");
    expect(detSlotCount(item, "105")).toBe(6);

    expect(detPrefixForTarget(item, "115")).toBe("requi");
    expect(detMissingPart(item, "115")).toBe("rements");
    expect(detSlotCount(item, "115")).toBe(7);

    expect(detPrefixForTarget(item, "125")).toBe("requ");
    expect(detMissingPart(item, "125")).toBe("irements");
    expect(detSlotCount(item, "125")).toBe(8);
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
    expect(checkDetAnswer(item, "irements", "125")).toBe("correct");
    expect(checkDetAnswer(item, "rements", "125")).toBe("wrong");
  });

  it("maps full-word input back into visible slots", () => {
    const item = DET_READ_COMPLETE_ITEMS.find((q) => q.word === "cognitive");
    expect(item).toBeDefined();
    if (!item) return;
    expect(detDisplayLetters(item, "cognitive")).toBe("itive");
    expect(detDisplayLetters(item, "itive")).toBe("itive");
    expect(detDisplayLetters(item, "cognit")).toBe("it");
  });
});
