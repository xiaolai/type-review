import { describe, expect, it } from "vitest";
import { createQuotesSource, type RawQuote } from "./quotes";

const SEED: RawQuote[] = [
  { id: "q1", text: "abc", license: "PD" },
  { id: "q2", text: "abcde", license: "PD" },
  { id: "q3", text: "xyz", license: "PD" },
  { id: "q4", text: "  whitespace  paste   ", license: "PD" },
  { id: "q5", text: "", license: "PD" }, // empty → dropped
];

describe("createQuotesSource", () => {
  it("returns null when no entry fits the filter", () => {
    const src = createQuotesSource(SEED);
    expect(src.pick({ filter: new Set(["x"]), wantedChars: 3, rng: () => 0.5 })).toBeNull();
  });

  it("returns an entry whose alphabet ⊆ filter", () => {
    const src = createQuotesSource(SEED);
    const result = src.pick({
      filter: new Set(["a", "b", "c", "d", "e"]),
      wantedChars: 3,
      rng: () => 0,
    });
    expect(result).not.toBeNull();
    expect(["q1", "q2"]).toContain(result?.id);
  });

  it("picks across all entries when filter is undefined (benchmark mode)", () => {
    const src = createQuotesSource(SEED);
    const seen = new Set<string>();
    let i = 0;
    for (let n = 0; n < 50; n++) {
      const result = src.pick({ wantedChars: 3, rng: () => (i++ * 0.13) % 1 });
      if (result) seen.add(result.id);
    }
    // We sampled enough to see at least 2 distinct ids (excluding the dropped empty one).
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });

  it("drops empty entries silently", () => {
    const src = createQuotesSource(SEED);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const r = src.pick({ wantedChars: 5, rng: () => (i * 0.0317) % 1 });
      if (r) seen.add(r.id);
    }
    expect(seen.has("q5")).toBe(false);
  });

  it("sanitises raw text (collapses whitespace, trims)", () => {
    const src = createQuotesSource([{ id: "q-sani", text: "  hello\t\tworld  ", license: "PD" }]);
    const r = src.pick({ wantedChars: 10, rng: () => 0.5 });
    expect(r?.text).toBe("hello world");
  });

  it("attaches attribution from raw fields", () => {
    const src = createQuotesSource([
      {
        id: "q-attr",
        text: "test entry",
        author: "Anon",
        title: "Untitled",
        url: "https://example.com",
        license: "CC-BY",
      },
    ]);
    const r = src.pick({ wantedChars: 10, rng: () => 0.5 });
    expect(r?.attribution).toEqual({
      license: "CC-BY",
      author: "Anon",
      title: "Untitled",
      url: "https://example.com",
    });
  });
});
