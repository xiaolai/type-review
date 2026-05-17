// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonKey, LessonPlan } from "../engine/adaptive";
import type { RunResult } from "../engine/session";
import { Results } from "./Results";

function key(letter: string, confidence: number | null): LessonKey {
  return {
    letter,
    included: true,
    forced: false,
    focused: false,
    confidence,
    bestConfidence: confidence,
  };
}

function planFrom(keys: LessonKey[]): LessonPlan {
  return { included: keys.map((k) => k.letter), focus: null, keys, weakBigrams: [] };
}

const sampleResult: RunResult = {
  index: 0,
  mode: "adaptive",
  timestamp: Date.now(),
  passageId: "p",
  text: "the cat",
  metrics: {
    netWpm: 75,
    rawWpm: 80,
    accuracy: 95,
    consistency: 88,
    wpmStdDev: 0,
    wpmSeries: [],
    correctChars: 30,
    incorrectChars: 1,
    durationMs: 30000,
  },
  histogram: new Map(),
};

describe("Results", () => {
  let dispose: () => void = () => {};
  afterEach(() => {
    dispose();
    dispose = () => {};
    document.body.innerHTML = "";
  });

  function mount(
    plan: LessonPlan | null,
    callbacks: { onNext?: () => void; onSettings?: () => void } = {},
  ): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(
      () => (
        <Results
          result={sampleResult}
          plan={plan}
          entry={null}
          unlocked={[]}
          onNext={callbacks.onNext ?? (() => {})}
          onSettings={callbacks.onSettings ?? (() => {})}
        />
      ),
      host,
    );
    return host;
  }

  it("renders the four headline stats", () => {
    const host = mount(null);
    const stats = host.querySelectorAll(".stat__value");
    expect(stats).toHaveLength(4);
    expect(host.querySelector(".stat--big .stat__value")?.textContent).toBe("75");
    expect(host.textContent).toContain("95%"); // accuracy
    expect(host.textContent).toContain("88%"); // consistency
  });

  it("lists weak keys sorted slowest first, capped at 6", () => {
    const plan = planFrom([
      key("a", 0.2),
      key("b", 0.4),
      key("c", 0.6),
      key("d", 0.8),
      key("e", 0.5),
      key("f", 0.3),
      key("g", 0.1), // weakest
      key("h", 1.2), // mastered — excluded
    ]);
    const host = mount(plan);
    const weakKeys = Array.from(host.querySelectorAll(".weak-key")).map((el) => el.textContent);
    expect(weakKeys).toHaveLength(6);
    expect(weakKeys[0]).toBe("g"); // lowest confidence first
    expect(weakKeys).not.toContain("h"); // mastered excluded
  });

  it("shows the celebratory fallback when every active key is at target", () => {
    const plan = planFrom([key("a", 1.5), key("b", 1.2)]);
    const host = mount(plan);
    expect(host.querySelector(".weak-keys")).toBeNull();
    expect(host.querySelector(".results__note")?.textContent).toMatch(/at target/);
  });

  it("hides the weak-keys section entirely in benchmark mode (no plan)", () => {
    const host = mount(null);
    expect(host.querySelector(".weak-keys")).toBeNull();
    expect(host.querySelector(".results__note")).toBeNull();
  });

  it("fires onNext and onSettings from the action buttons", () => {
    const onNext = vi.fn();
    const onSettings = vi.fn();
    const host = mount(null, { onNext, onSettings });
    const buttons = host.querySelectorAll<HTMLButtonElement>(".actions .btn");
    buttons[0]?.click();
    buttons[1]?.click();
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(1);
  });
});
