// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCorpusChannel } from "./use-corpus-channel";

function makeFakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const KEY = "type-review:corpus-channel";

describe("createCorpusChannel", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeFakeStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to 'quote' when nothing is stored", () => {
    const c = createCorpusChannel();
    expect(c.channel()).toBe("quote");
  });

  it("reads valid stored values verbatim", () => {
    storage.setItem(KEY, "code");
    expect(createCorpusChannel().channel()).toBe("code");
  });

  it("setChannel persists the new value", () => {
    const c = createCorpusChannel();
    c.setChannel("drills");
    expect(c.channel()).toBe("drills");
    expect(storage.getItem(KEY)).toBe("drills");
  });

  describe("migration map", () => {
    it("migrates 'article' → 'quote' and rewrites storage", () => {
      storage.setItem(KEY, "article");
      const c = createCorpusChannel();
      expect(c.channel()).toBe("quote");
      expect(storage.getItem(KEY)).toBe("quote");
    });

    it("migrates 'pseudo' → 'drills' and rewrites storage", () => {
      storage.setItem(KEY, "pseudo");
      const c = createCorpusChannel();
      expect(c.channel()).toBe("drills");
      expect(storage.getItem(KEY)).toBe("drills");
    });

    it("migrates 'common-words' → 'difficult' and rewrites storage", () => {
      storage.setItem(KEY, "common-words");
      const c = createCorpusChannel();
      expect(c.channel()).toBe("difficult");
      expect(storage.getItem(KEY)).toBe("difficult");
    });

    it("falls back to default for an unknown value (not in MIGRATION)", () => {
      storage.setItem(KEY, "nonsense");
      const c = createCorpusChannel();
      expect(c.channel()).toBe("quote");
    });
  });

  it("survives a throwing localStorage — falls back to default", () => {
    const throwing: Storage = {
      ...storage,
      getItem: () => {
        throw new Error("ITP private mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    vi.stubGlobal("localStorage", throwing);
    const c = createCorpusChannel();
    expect(c.channel()).toBe("quote");
    // Setting still updates the signal even when storage refuses.
    c.setChannel("code");
    expect(c.channel()).toBe("code");
  });
});
