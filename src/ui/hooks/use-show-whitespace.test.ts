import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShowWhitespace } from "./use-show-whitespace";

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

const KEY = "type-review:show-whitespace";

describe("createShowWhitespace", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeFakeStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to visible when no preference is stored", () => {
    expect(createShowWhitespace().visible()).toBe(true);
  });

  it("honors a stored 'on' preference", () => {
    storage.setItem(KEY, "1");
    expect(createShowWhitespace().visible()).toBe(true);
  });

  it("honors a stored 'off' preference (default-on must not override)", () => {
    storage.setItem(KEY, "0");
    expect(createShowWhitespace().visible()).toBe(false);
  });

  it("setVisible persists and updates the signal", () => {
    const c = createShowWhitespace();
    c.setVisible(false);
    expect(c.visible()).toBe(false);
    expect(storage.getItem(KEY)).toBe("0");
    c.setVisible(true);
    expect(c.visible()).toBe(true);
    expect(storage.getItem(KEY)).toBe("1");
  });

  it("survives a throwing localStorage — falls back to default-on, toggle still works", () => {
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
    const c = createShowWhitespace();
    expect(c.visible()).toBe(true);
    c.setVisible(false);
    expect(c.visible()).toBe(false);
  });
});
