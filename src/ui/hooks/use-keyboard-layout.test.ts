// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyboardLayout } from "./use-keyboard-layout";

function makeFakeStorage(): Storage {
  const data = new Map<string, string>();
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

describe("createKeyboardLayout", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeFakeStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a persisted preference verbatim", () => {
    storage.setItem("type-review:keyboard-layout", "windows");
    expect(createKeyboardLayout().layout()).toBe("windows");
    storage.setItem("type-review:keyboard-layout", "mac");
    expect(createKeyboardLayout().layout()).toBe("mac");
  });

  it("defaults to mac on a Mac userAgent when no preference is stored", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      configurable: true,
    });
    expect(createKeyboardLayout().layout()).toBe("mac");
  });

  it("defaults to windows on a non-Mac userAgent when no preference is stored", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
    });
    expect(createKeyboardLayout().layout()).toBe("windows");
  });

  it("setLayout updates the signal and persists to storage", () => {
    Object.defineProperty(navigator, "userAgent", { value: "Mac", configurable: true });
    const pref = createKeyboardLayout();
    expect(pref.layout()).toBe("mac");
    pref.setLayout("windows");
    expect(pref.layout()).toBe("windows");
    expect(storage.getItem("type-review:keyboard-layout")).toBe("windows");
  });

  it("ignores garbage stored values and falls back to detection", () => {
    storage.setItem("type-review:keyboard-layout", "linux"); // not a valid value
    Object.defineProperty(navigator, "userAgent", { value: "Mac", configurable: true });
    expect(createKeyboardLayout().layout()).toBe("mac");
  });

  it("survives a localStorage throw", () => {
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
    Object.defineProperty(navigator, "userAgent", { value: "Windows", configurable: true });
    const pref = createKeyboardLayout();
    expect(pref.layout()).toBe("windows");
    pref.setLayout("mac");
    expect(pref.layout()).toBe("mac");
  });
});
