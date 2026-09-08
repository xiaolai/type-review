import { describe, expect, it } from "vitest";
import { histogramFromSteps } from "../../engine/adaptive";
import { SETTINGS_BOUNDS } from "../../engine/bounds";
import { generatePlainWords } from "../../engine/corpus";
import { mulberry32 } from "../../engine/rng";
import { createDefaultProfile, Session } from "../../engine/session";
import type { Step } from "../../engine/typing";
import quotesJson from "../corpus/data/quotes.json";
import { MAX_PASSAGE_CHARS } from "../corpus/sanitize";
import { MAX_HISTOGRAM_ENTRIES } from "./constants";
import { deserializeProfile, serializeProfile } from "./serialization";

/**
 * The writer-fits-reader invariant, in the spirit of `bounds.test.ts`
 * (`UI_BOUNDS ⊆ SETTINGS_BOUNDS`): whatever a legitimate run can *produce*
 * must be something storage will *accept*. It was not — `MAX_HISTOGRAM_ENTRIES`
 * sat at 256 while a punctuated benchmark run or any prose passage over ~900
 * characters produces more than that, and the deserializer escalated the
 * over-cap histogram to `status: "corrupt"` for the entire profile. One long
 * run therefore discarded a 500-run history on the next load.
 */

/** Steps for a clean, error-free run over `text` — one per character. */
function cleanSteps(text: string): readonly Step[] {
  return [...text].map((ch, i) => ({
    position: i,
    timeStamp: (i + 1) * 150,
    typed: ch,
    expected: ch,
    timeToType: 150,
    typo: false,
  }));
}

/**
 * Deterministic prose of `chars` length, built from the shipped quote corpus —
 * real text with real variety, which is the point: a synthetic string repeated
 * to length saturates its bigram set and would hide the very bug this pins.
 */
function prose(chars: number): string {
  const texts = (quotesJson as { entries: { text: string }[] }).entries.map((e) => e.text);
  let text = "";
  for (let i = 0; text.length < chars; i++) {
    text += `${texts[i % texts.length]} `;
  }
  return text.slice(0, chars);
}

describe("a legitimate run's histogram always fits what storage accepts", () => {
  it("the longest passage the corpus can serve", () => {
    const size = histogramFromSteps(cleanSteps(prose(MAX_PASSAGE_CHARS))).size;
    expect(size).toBeGreaterThan(256); // the old ceiling — this is the regression
    expect(size).toBeLessThanOrEqual(MAX_HISTOGRAM_ENTRIES);
  });

  it("the generator at the widest settings the profile allows", () => {
    for (const includePunctuation of [false, true]) {
      const passage = generatePlainWords({
        wordCount: SETTINGS_BOUNDS.wordCount.hi,
        rng: mulberry32(20260903),
        includeNumbers: includePunctuation,
        includePunctuation,
      });
      const size = histogramFromSteps(cleanSteps(passage.text)).size;
      expect(size).toBeLessThanOrEqual(MAX_HISTOGRAM_ENTRIES);
    }
  });

  it("survives a full session → save → load round trip", () => {
    const text = prose(1_200);
    const session = new Session(createDefaultProfile(), { now: () => 1_700_000_000_000 });
    session.startWithText(text);
    let clock = 0;
    for (const ch of text) {
      clock += 150;
      session.input(ch, clock);
    }
    const written = session.profile.results.at(-1)?.histogram;
    expect(written?.size).toBeGreaterThan(256);

    const reloaded = deserializeProfile(
      JSON.parse(JSON.stringify(serializeProfile(session.profile))),
    );
    expect(reloaded.status).toBe("ok");
    if (reloaded.status !== "ok") return;
    expect(reloaded.profile.results).toHaveLength(1);
    expect(reloaded.profile.results[0]?.histogram).toEqual(written);
  });
});
