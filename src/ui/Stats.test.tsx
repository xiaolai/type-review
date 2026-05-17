// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, RunResult } from "../engine/session";
import { StatsView } from "./Stats";

function makeResult(index: number, netWpm: number, durationMs = 30_000): RunResult {
  return {
    index,
    mode: "adaptive",
    timestamp: 1_700_000_000_000 + index * 60_000,
    passageId: `p${index}`,
    text: "the cat sat",
    metrics: {
      netWpm,
      rawWpm: netWpm + 2,
      accuracy: 95,
      consistency: 80,
      wpmStdDev: 0,
      wpmSeries: [],
      correctChars: 30,
      incorrectChars: 1,
      durationMs,
    },
    histogram: new Map([["t", { hitCount: 5, missCount: 0, timeToType: 180 }]]),
  };
}

function profile(results: RunResult[]): Profile {
  return {
    settings: {
      mode: "adaptive",
      targetWpm: 50,
      wordCount: 30,
      stopOnError: false,
      adaptive: { minAlphabetSize: 6, alphabetExpansion: 0 },
      includeNumbers: false,
      includePunctuation: false,
      testMode: "words" as const,
      testDurationSec: 30,
      noBackspace: false,
      passageLength: "any",
    },
    results,
  };
}

describe("StatsView", () => {
  let dispose: () => void = () => {};
  afterEach(() => {
    dispose();
    dispose = () => {};
    document.body.innerHTML = "";
  });

  function mount(p: Profile, onStart: () => void = () => {}): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(() => <StatsView profile={p} onStart={onStart} />, host);
    return host;
  }

  it("shows the empty state when there are no sessions", () => {
    const host = mount(profile([]));
    expect(host.querySelector(".empty-note")?.textContent).toMatch(/no sessions/i);
    expect(host.querySelector(".profile-hero")).toBeNull();
  });

  it("renders the four hero cells with computed stats", () => {
    const host = mount(profile([makeResult(0, 50), makeResult(1, 70), makeResult(2, 60)]));
    const cells = host.querySelectorAll(".profile-hero__cell");
    expect(cells).toHaveLength(4);
    const values = Array.from(host.querySelectorAll(".profile-hero__value")).map(
      (el) => el.textContent,
    );
    // best=70, avg=60, count=3, minutes = sum(30000ms*3)/60000 = 1.5 → rounded 2
    expect(values).toEqual(["70", "60", "3", "2"]);
  });

  it("renders a sparkline when there are at least 2 sessions", () => {
    const host = mount(profile([makeResult(0, 50), makeResult(1, 70)]));
    expect(host.querySelector(".spark")).not.toBeNull();
    // Both the area and the line paths are drawn.
    expect(host.querySelector(".spark__area")).not.toBeNull();
    expect(host.querySelector(".spark__line")).not.toBeNull();
  });

  it("shows a 'need at least two sessions' note for a single session", () => {
    const host = mount(profile([makeResult(0, 50)]));
    // Hero still renders, but the spark area renders the empty note instead of an SVG.
    expect(host.querySelector(".spark")).toBeNull();
    expect(host.textContent).toMatch(/at least two/i);
  });

  it("renders recent sessions newest-first, capped at 10", () => {
    const many = Array.from({ length: 15 }, (_, i) => makeResult(i, 50 + i));
    const host = mount(profile(many));
    // Multiple panels on the page render `.session-row` (top-5,
    // slowest-bigrams, recent). Scope to the recent table by its
    // aria-labelledby so the assertion isn't fragile to row layout.
    const table = host.querySelector('table[aria-labelledby="lbl-recent"]');
    expect(table).not.toBeNull();
    const rows = table?.querySelectorAll(".session-row") ?? [];
    expect(rows.length).toBe(1 + 10);
    // First data row shows the highest index (newest) — 50 + 14 = 64.
    const firstDataRow = rows[1];
    expect(firstDataRow?.textContent).toContain("64");
  });

  it("fires onStart when the empty-state link is clicked", () => {
    const onStart = vi.fn();
    const host = mount(profile([]), onStart);
    host.querySelector<HTMLButtonElement>(".link")?.click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
