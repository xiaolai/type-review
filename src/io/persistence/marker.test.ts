import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSavedMarker, hasSavedMarker, setSavedMarker } from "./marker";

function fakeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("storage marker", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hasSavedMarker is false initially", () => {
    expect(hasSavedMarker()).toBe(false);
  });

  it("setSavedMarker flips hasSavedMarker to true", () => {
    setSavedMarker();
    expect(hasSavedMarker()).toBe(true);
  });

  it("clearSavedMarker flips it back to false", () => {
    setSavedMarker();
    clearSavedMarker();
    expect(hasSavedMarker()).toBe(false);
  });

  it("setSavedMarker is best-effort: localStorage write failure does not throw", () => {
    const throwingStorage: Storage = {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    };
    vi.stubGlobal("localStorage", throwingStorage);
    expect(() => setSavedMarker()).not.toThrow();
  });

  it("hasSavedMarker is best-effort: localStorage read failure returns false", () => {
    const throwingStorage: Storage = {
      ...fakeLocalStorage(),
      getItem: () => {
        throw new DOMException("SecurityError");
      },
    };
    vi.stubGlobal("localStorage", throwingStorage);
    expect(hasSavedMarker()).toBe(false);
  });

  it("clearSavedMarker is best-effort: localStorage failure does not throw", () => {
    const throwingStorage: Storage = {
      ...fakeLocalStorage(),
      removeItem: () => {
        throw new DOMException("SecurityError");
      },
    };
    vi.stubGlobal("localStorage", throwingStorage);
    expect(() => clearSavedMarker()).not.toThrow();
  });

  it("treats absent localStorage (e.g. SSR) as no-op", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(hasSavedMarker()).toBe(false);
    expect(() => setSavedMarker()).not.toThrow();
    expect(() => clearSavedMarker()).not.toThrow();
  });
});
