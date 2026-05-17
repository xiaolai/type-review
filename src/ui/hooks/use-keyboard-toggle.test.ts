import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyboardToggle } from "./use-keyboard-toggle";

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

describe("createKeyboardToggle", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = makeFakeStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to visible when no preference is stored", () => {
    const t = createKeyboardToggle();
    expect(t.visible()).toBe(true);
  });

  it("reads the persisted 'on' preference on construction", () => {
    storage.setItem("type-review:show-keyboard", "1");
    const t = createKeyboardToggle();
    expect(t.visible()).toBe(true);
  });

  it("honors an explicit 'off' preference over the default", () => {
    storage.setItem("type-review:show-keyboard", "0");
    const t = createKeyboardToggle();
    expect(t.visible()).toBe(false);
  });

  it("toggles the signal and writes the new value to storage", () => {
    storage.setItem("type-review:show-keyboard", "0");
    const t = createKeyboardToggle();
    expect(t.visible()).toBe(false);
    t.toggle();
    expect(t.visible()).toBe(true);
    expect(storage.getItem("type-review:show-keyboard")).toBe("1");
    t.toggle();
    expect(t.visible()).toBe(false);
    expect(storage.getItem("type-review:show-keyboard")).toBe("0");
  });

  it("survives a localStorage throw — falls back to default-on and toggle still works", () => {
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
    const t = createKeyboardToggle();
    expect(t.visible()).toBe(true);
    t.toggle();
    expect(t.visible()).toBe(false);
  });
});
