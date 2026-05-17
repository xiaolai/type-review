import { describe, expect, it } from "vitest";
import type { Profile } from "../../engine/session";
import { deserializeProfile, serializeProfile } from "./serialization";

function sampleProfile(): Profile {
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
    results: [
      {
        index: 0,
        mode: "adaptive",
        timestamp: 1_700_000_000_000,
        passageId: "p1",
        text: "ten",
        metrics: {
          netWpm: 60,
          rawWpm: 62,
          accuracy: 97,
          consistency: 88,
          wpmStdDev: 0,
          wpmSeries: [],
          correctChars: 3,
          incorrectChars: 0,
          durationMs: 1000,
        },
        histogram: new Map([
          ["te", { hitCount: 1, missCount: 0, timeToType: 200 }],
          ["en", { hitCount: 1, missCount: 0, timeToType: 180 }],
          ["nt", { hitCount: 1, missCount: 1, timeToType: 190 }],
        ]),
      },
    ],
  };
}

describe("serializeProfile", () => {
  it("turns histogram Maps into plain objects", () => {
    const serialized = serializeProfile(sampleProfile());
    expect(serialized.version).toBe(2);
    expect(serialized.results[0]?.histogram).toEqual({
      te: { hitCount: 1, missCount: 0, timeToType: 200 },
      en: { hitCount: 1, missCount: 0, timeToType: 180 },
      nt: { hitCount: 1, missCount: 1, timeToType: 190 },
    });
  });

  it("defensively copies settings and metrics so post-save mutation never poisons the serialized blob", () => {
    const profile = sampleProfile();
    const serialized = serializeProfile(profile);
    profile.settings.targetWpm = 999;
    if (profile.results[0]) {
      profile.results[0].metrics.netWpm = 999;
    }
    expect(serialized.settings.targetWpm).toBe(50);
    expect(serialized.results[0]?.metrics.netWpm).toBe(60);
  });
});

describe("deserializeProfile", () => {
  it("round-trips a profile through JSON, restoring histogram Maps", () => {
    const original = sampleProfile();
    const json = JSON.parse(JSON.stringify(serializeProfile(original)));
    const result = deserializeProfile(json);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.profile).toEqual(original);
      expect(result.profile.results[0]?.histogram).toBeInstanceOf(Map);
    }
  });

  it("reports an unknown format version as corrupt (not absent)", () => {
    const json = JSON.parse(JSON.stringify(serializeProfile(sampleProfile())));
    json.version = 999;
    expect(deserializeProfile(json).status).toBe("corrupt");
  });

  it("reports null/undefined input as absent (clean first run)", () => {
    expect(deserializeProfile(null).status).toBe("absent");
    expect(deserializeProfile(undefined).status).toBe("absent");
  });

  it("reports non-object / missing-fields input as corrupt", () => {
    expect(deserializeProfile("nonsense").status).toBe("corrupt");
    expect(deserializeProfile({}).status).toBe("corrupt");
    expect(deserializeProfile({ version: 1, settings: {}, results: [] }).status).toBe("corrupt");
  });

  it("reports a corrupt histogram as corrupt", () => {
    const json = JSON.parse(JSON.stringify(serializeProfile(sampleProfile())));
    json.results[0].histogram = { te: { hitCount: "bad" } };
    expect(deserializeProfile(json).status).toBe("corrupt");
  });

  it("rejects payloads with unknown top-level keys", () => {
    const json = JSON.parse(JSON.stringify(serializeProfile(sampleProfile())));
    json.extra = "sneaky";
    expect(deserializeProfile(json).status).toBe("corrupt");
  });
});

describe("deserializeProfile — adversarial input (storage is an untrusted boundary)", () => {
  function tampered(mutate: (json: ReturnType<typeof serializeProfile>) => void) {
    const json = JSON.parse(JSON.stringify(serializeProfile(sampleProfile()))) as ReturnType<
      typeof serializeProfile
    >;
    mutate(json);
    return deserializeProfile(json);
  }

  it("rejects a non-positive target speed", () => {
    expect(tampered((j) => (j.settings.targetWpm = 0)).status).toBe("corrupt");
    expect(tampered((j) => (j.settings.targetWpm = -10)).status).toBe("corrupt");
  });

  it("rejects an out-of-range target speed", () => {
    expect(tampered((j) => (j.settings.targetWpm = 10_000)).status).toBe("corrupt");
  });

  it("rejects non-integer or out-of-range word count", () => {
    expect(tampered((j) => (j.settings.wordCount = 0)).status).toBe("corrupt");
    expect(tampered((j) => (j.settings.wordCount = 1.5)).status).toBe("corrupt");
    expect(tampered((j) => (j.settings.wordCount = 1_000_000)).status).toBe("corrupt");
  });

  it("rejects an alphabetExpansion outside [0, 1]", () => {
    expect(tampered((j) => (j.settings.adaptive.alphabetExpansion = 1.5)).status).toBe("corrupt");
    expect(tampered((j) => (j.settings.adaptive.alphabetExpansion = -0.1)).status).toBe("corrupt");
  });

  it("rejects negative or non-integer per-key counts", () => {
    expect(
      tampered((j) => {
        if (j.results[0]) {
          (j.results[0].histogram as Record<string, unknown>).te = {
            hitCount: -1,
            missCount: 0,
            timeToType: 100,
          };
        }
      }).status,
    ).toBe("corrupt");
    expect(
      tampered((j) => {
        if (j.results[0]) {
          (j.results[0].histogram as Record<string, unknown>).te = {
            hitCount: 1.5,
            missCount: 0,
            timeToType: 100,
          };
        }
      }).status,
    ).toBe("corrupt");
  });

  it("rejects missCount > hitCount", () => {
    expect(
      tampered((j) => {
        if (j.results[0]) {
          (j.results[0].histogram as Record<string, unknown>).te = {
            hitCount: 1,
            missCount: 5,
            timeToType: 100,
          };
        }
      }).status,
    ).toBe("corrupt");
  });

  it("rejects histogram keys that are not exactly two BMP characters", () => {
    // Too long.
    expect(
      tampered((j) => {
        if (j.results[0]) {
          const h = j.results[0].histogram as Record<string, unknown>;
          h["long-key"] = { hitCount: 1, missCount: 0, timeToType: 100 };
        }
      }).status,
    ).toBe("corrupt");
    // Single character (was the old v1 format).
    expect(
      tampered((j) => {
        if (j.results[0]) {
          const h = j.results[0].histogram as Record<string, unknown>;
          h.t = { hitCount: 1, missCount: 0, timeToType: 100 };
        }
      }).status,
    ).toBe("corrupt");
    // Surrogate half embedded in an otherwise-2-char key.
    expect(
      tampered((j) => {
        if (j.results[0]) {
          const h = j.results[0].histogram as Record<string, unknown>;
          h[`a\uD83D`] = { hitCount: 1, missCount: 0, timeToType: 100 };
        }
      }).status,
    ).toBe("corrupt");
  });

  it("rejects oversized histograms", () => {
    expect(
      tampered((j) => {
        if (j.results[0]) {
          const huge: Record<string, unknown> = {};
          for (let i = 0; i < 500; i++) {
            huge[String.fromCharCode(0x100 + i)] = {
              hitCount: 1,
              missCount: 0,
              timeToType: 100,
            };
          }
          j.results[0].histogram = huge as never;
        }
      }).status,
    ).toBe("corrupt");
  });

  it("truncates an oversized results array to the most recent entries", () => {
    const json = JSON.parse(JSON.stringify(serializeProfile(sampleProfile()))) as ReturnType<
      typeof serializeProfile
    >;
    const template = json.results[0];
    if (!template) {
      throw new Error("sample profile has no result to clone");
    }
    const oversized: typeof json.results = [];
    const total = 750;
    for (let i = 0; i < total; i++) {
      oversized.push({ ...template, index: i });
    }
    json.results = oversized;
    const result = deserializeProfile(json);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.profile.results.length).toBeLessThanOrEqual(total);
      expect(result.profile.results.at(-1)?.index).toBe(total - 1);
    }
  });
});
