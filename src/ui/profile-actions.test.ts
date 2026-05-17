// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../engine/session";
import type { ProfileStore } from "../io";
import { InMemoryProfileStore, serializeProfile } from "../io";
import { importProfileFromText } from "./profile-actions";

function makeProfile(): Profile {
  return {
    settings: {
      mode: "benchmark",
      targetWpm: 60,
      adaptive: { minAlphabetSize: 6, alphabetExpansion: 0 },
      wordCount: 25,
      stopOnError: false,
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
        mode: "benchmark",
        timestamp: 1_700_000_000_000,
        passageId: "q-test",
        text: "hello world",
        metrics: {
          netWpm: 50,
          rawWpm: 52,
          accuracy: 96,
          consistency: 80,
          wpmStdDev: 5,
          wpmSeries: [],
          correctChars: 90,
          incorrectChars: 4,
          durationMs: 30_000,
        },
        histogram: new Map([["th", { hitCount: 5, missCount: 0, timeToType: 120 }]]),
      },
    ],
  };
}

describe("importProfileFromText", () => {
  let store: ProfileStore;
  let reloadSpy: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    store = new InMemoryProfileStore();
    reloadSpy = vi.fn();
    // jsdom's location.reload throws "not implemented"; replace with a spy
    // so the function-under-test can call it without crashing the test run.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        hash: "",
        reload: reloadSpy,
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it("round-trips a serialised profile: export → import → store matches", async () => {
    const json = JSON.stringify(serializeProfile(makeProfile()));

    const outcome = await importProfileFromText(json, store);

    expect(outcome).toBe("reloaded");
    expect(reloadSpy).toHaveBeenCalledOnce();
    const loaded = await store.load();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") {
      // Spot-check the round-trip: settings and one results field carry over.
      expect(loaded.profile.settings.mode).toBe("benchmark");
      expect(loaded.profile.settings.targetWpm).toBe(60);
      expect(loaded.profile.results).toHaveLength(1);
      expect(loaded.profile.results[0]?.metrics.netWpm).toBe(50);
    }
  });

  it("returns 'invalid' for unparseable JSON", async () => {
    const outcome = await importProfileFromText("{not json", store);
    expect(outcome).toBe("invalid");
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("returns 'invalid' for JSON that isn't a profile shape", async () => {
    const outcome = await importProfileFromText(JSON.stringify({ random: "object" }), store);
    expect(outcome).toBe("invalid");
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("returns 'invalid' for JSON with the right keys but corrupt settings", async () => {
    const corrupt = {
      version: 1,
      settings: { mode: "made-up-mode", targetWpm: 50, wordCount: 30, stopOnError: false },
      results: [],
    };
    const outcome = await importProfileFromText(JSON.stringify(corrupt), store);
    expect(outcome).toBe("invalid");
  });

  it("returns 'failed' when the store's save rejects", async () => {
    const failingStore: ProfileStore = {
      load: () => Promise.resolve({ status: "absent" }),
      save: () => Promise.reject(new Error("quota exceeded")),
    };
    const json = JSON.stringify(serializeProfile(makeProfile()));
    const outcome = await importProfileFromText(json, failingStore);
    expect(outcome).toBe("failed");
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
