import { describe, expect, it } from "vitest";
import { TextInput } from "./text-input";

describe("TextInput", () => {
  it("rejects empty expected text", () => {
    expect(() => new TextInput("")).toThrow();
  });

  it("tracks a clean run to completion", () => {
    const ti = new TextInput("ab");
    expect(ti.appendChar("a", 1000)).toBe("running");
    expect(ti.completed).toBe(false);
    expect(ti.appendChar("b", 1100)).toBe("completed");
    expect(ti.completed).toBe(true);
    expect(ti.count("correct")).toBe(2);
    expect(ti.count("incorrect")).toBe(0);
  });

  it("records timeToType: 0 for the first keystroke, delta thereafter", () => {
    const ti = new TextInput("abc");
    ti.appendChar("a", 1000);
    ti.appendChar("b", 1150);
    ti.appendChar("c", 1400);
    expect(ti.steps.map((s) => s.timeToType)).toEqual([0, 150, 250]);
    expect(ti.elapsedMs).toBe(400);
  });

  it("marks a typo, still advances in default (forgiving) mode", () => {
    const ti = new TextInput("ab");
    expect(ti.appendChar("x", 1000)).toBe("running");
    expect(ti.pos).toBe(1);
    expect(ti.count("incorrect")).toBe(1);
    const [step] = ti.steps;
    expect(step).toMatchObject({ typed: "x", expected: "a", typo: true });
  });

  it("blocks advance on typo when stopOnError is set", () => {
    const ti = new TextInput("ab", { stopOnError: true });
    expect(ti.appendChar("x", 1000)).toBe("running");
    expect(ti.pos).toBe(0);
    expect(ti.appendChar("a", 1100)).toBe("running");
    expect(ti.pos).toBe(1);
    // Both the mistyped and the corrected keystroke are logged.
    expect(ti.steps).toHaveLength(2);
    expect(ti.steps.map((s) => s.typo)).toEqual([true, false]);
  });

  it("backspace clears a position and allows correction", () => {
    const ti = new TextInput("ab");
    ti.appendChar("x", 1000);
    expect(ti.count("incorrect")).toBe(1);
    ti.backspace();
    expect(ti.pos).toBe(0);
    expect(ti.count("incorrect")).toBe(0);
    expect(ti.count("untyped")).toBe(2);
    ti.appendChar("a", 1100);
    expect(ti.count("correct")).toBe(1);
  });

  it("backspace is a no-op at the start", () => {
    const ti = new TextInput("ab");
    ti.backspace();
    expect(ti.pos).toBe(0);
  });

  it("keeps the steps log append-only across backspace and retype", () => {
    const ti = new TextInput("a");
    ti.appendChar("x", 1000); // wrong
    ti.backspace();
    ti.appendChar("a", 1200); // corrected
    expect(ti.steps).toHaveLength(2);
    expect(ti.steps.map((s) => s.typed)).toEqual(["x", "a"]);
    expect(ti.completed).toBe(true);
  });

  it("ignores input after completion", () => {
    const ti = new TextInput("a");
    ti.appendChar("a", 1000);
    expect(ti.appendChar("b", 1100)).toBe("completed");
    expect(ti.steps).toHaveLength(1);
  });

  it("reset restores the initial state", () => {
    const ti = new TextInput("ab");
    ti.appendChar("a", 1000);
    ti.appendChar("b", 1100);
    ti.reset();
    expect(ti.pos).toBe(0);
    expect(ti.completed).toBe(false);
    expect(ti.steps).toHaveLength(0);
    expect(ti.count("untyped")).toBe(2);
    expect(ti.elapsedMs).toBe(0);
  });

  it("snapshot reflects current state and is detached from internals", () => {
    const ti = new TextInput("ab");
    ti.appendChar("a", 1000);
    const snap = ti.snapshot();
    expect(snap).toEqual({
      expected: "ab",
      statuses: ["correct", "untyped"],
      pos: 1,
      completed: false,
    });
    ti.appendChar("b", 1100);
    // Earlier snapshot must not mutate.
    expect(snap.statuses).toEqual(["correct", "untyped"]);
  });

  describe("paragraph-break auto-skip", () => {
    // Sanitize emits `\n\n` between paragraphs. The typist can't type a
    // newline (Enter is reserved for "next run"), so the engine must
    // auto-advance past `\n` runs and not record them as keystrokes.

    it("skips past `\\n\\n` between paragraphs without consuming a keystroke", () => {
      const ti = new TextInput("ab\n\ncd");
      ti.appendChar("a", 1000);
      ti.appendChar("b", 1100);
      // After typing 'b', the engine auto-advances past both `\n` chars
      // and lands on 'c' (position 4).
      expect(ti.pos).toBe(4);
      expect(ti.completed).toBe(false);
      ti.appendChar("c", 1200);
      ti.appendChar("d", 1300);
      expect(ti.completed).toBe(true);
      // Only 4 actual keystrokes recorded — the two `\n`s produce no Step.
      expect(ti.steps).toHaveLength(4);
      expect(ti.steps.map((s) => s.expected)).toEqual(["a", "b", "c", "d"]);
    });

    it("skips at construction time when expected starts with `\\n`", () => {
      // sanitize() would never produce a leading `\n`, but the engine
      // shouldn't assume that.
      const ti = new TextInput("\n\nab");
      expect(ti.pos).toBe(2);
      ti.appendChar("a", 1000);
      ti.appendChar("b", 1100);
      expect(ti.completed).toBe(true);
    });

    it("treats a passage ending with `\\n\\n` as completed", () => {
      const ti = new TextInput("ab\n\n");
      ti.appendChar("a", 1000);
      ti.appendChar("b", 1100);
      expect(ti.completed).toBe(true);
    });

    it("backspace from the start of a new paragraph lands on the prior paragraph's last char", () => {
      const ti = new TextInput("ab\n\ncd");
      ti.appendChar("a", 1000);
      ti.appendChar("b", 1100);
      // After typing 'b' the cursor auto-skipped past `\n\n` and is now
      // at pos 4 (on 'c'), but the user hasn't typed 'c' yet. Pressing
      // backspace here is intuitively "undo the last typed char" — the
      // cursor should walk back through the invisible newlines and land
      // on 'b'.
      expect(ti.pos).toBe(4);
      ti.backspace();
      expect(ti.pos).toBe(1);
      expect(ti.snapshot().statuses[1]).toBe("untyped");
    });
  });
});
