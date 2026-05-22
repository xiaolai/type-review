// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../engine/session";
import type { LoadResult, ProfileStore } from "../io";
import { App } from "./App";
import { DET_MISTAKES_STORAGE_KEY } from "./det-practice";

/** A store whose load() rejects — simulates a corrupt or unavailable backend. */
function failingStore(): ProfileStore {
  return {
    load: () => Promise.reject(new Error("load failed")),
    save: (_profile: Profile) => Promise.resolve(),
  };
}

/** A store whose load() resolves only when `release` is called — for lifecycle tests. */
function pausedStore(): ProfileStore & { release: () => void } {
  let release: () => void = () => {};
  const loadPromise = new Promise<LoadResult>((resolve) => {
    release = () => resolve({ status: "absent" });
  });
  return {
    load: () => loadPromise,
    save: (_profile: Profile) => Promise.resolve(),
    release,
  };
}

/** A store that reports an evicted profile — exercises the C2 marker path. */
function evictedStore(): ProfileStore {
  return {
    load: () => Promise.resolve<LoadResult>({ status: "evicted" }),
    save: (_profile: Profile) => Promise.resolve(),
  };
}

/** A store that reports a corrupt profile. */
function corruptStore(reason = "bad data"): ProfileStore {
  return {
    load: () => Promise.resolve<LoadResult>({ status: "corrupt", reason }),
    save: (_profile: Profile) => Promise.resolve(),
  };
}

/** A store whose save() rejects — exercises the saveFailed banner path. */
function saveFailingStore(): ProfileStore {
  return {
    load: () => Promise.resolve<LoadResult>({ status: "absent" }),
    save: () => Promise.reject(new Error("quota exceeded")),
  };
}

/** Dispatches a printable keystroke at the window, the way a real user would. */
function type(char: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: char, cancelable: true }));
}

describe("App integration", () => {
  let dispose: () => void = () => {};

  beforeEach(() => {
    // The typing-flow tests want the practice route active on mount.
    // Practice is also the new default route, so this is just being explicit.
    window.location.hash = "#/practice";
    window.localStorage.removeItem(DET_MISTAKES_STORAGE_KEY);
  });

  afterEach(() => {
    dispose();
    dispose = () => {};
    document.body.innerHTML = "";
    window.location.hash = "";
  });

  async function mountApp(): Promise<HTMLElement> {
    window.location.hash = "#/practice";
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(() => <App />, host);
    // onMount loads the profile asynchronously before the first render.
    await vi.waitFor(() => {
      expect(host.querySelector(".typing-area")).not.toBeNull();
    });
    return host;
  }

  it("renders a non-empty typing area and the keyboard toggle on the practice stage", async () => {
    const host = await mountApp();
    const text = host.querySelector(".typing-area")?.textContent ?? "";
    expect(text.length).toBeGreaterThan(0);
    // Practice stage is up — the keyboard toggle is its stable hint marker.
    // Default is visible, so the label reads "hide keyboard"; either label
    // is a valid signal that the toggle exists.
    const toggle = Array.from(host.querySelectorAll("button")).find((b) => {
      const t = b.textContent?.trim();
      return t === "hide keyboard" || t === "show keyboard";
    });
    expect(toggle).toBeDefined();
  });

  it("renders the DET completion page from the det route", async () => {
    window.location.hash = "#/det";
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(() => <App />, host);
    await vi.waitFor(() => {
      expect(host.querySelector(".det-page")).not.toBeNull();
    });
    expect(host.querySelector<HTMLInputElement>('input[aria-label="target score"]')?.value).toBe(
      "115",
    );
    expect(host.textContent).toContain("complete the word");

    const input = host.querySelector<HTMLInputElement>('input[aria-label="question 1 answer"]');
    expect(input).not.toBeNull();
    if (!input) return;
    input.value = "wrong";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => {
      expect(host.textContent).toContain("错误");
    });
    expect(host.querySelector(".det-slot--incorrect")).not.toBeNull();
    const missing = host.querySelector<HTMLElement>(".det-answer")?.dataset.missing;
    expect(missing).toBeDefined();
    if (!missing) return;
    const savedMistakes = JSON.parse(
      window.localStorage.getItem(DET_MISTAKES_STORAGE_KEY) ?? "[]",
    ) as Array<{ misses: number; targetScore: number }>;
    expect(savedMistakes[0]).toMatchObject({ misses: 1, targetScore: 115 });

    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "retry",
    );
    expect(retry).toBeDefined();
    retry?.click();
    await vi.waitFor(() => {
      expect(host.textContent).not.toContain("错误");
      expect(input.value).toBe("");
    });
    input.value = "wrong";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => {
      expect(host.textContent).toContain("错误");
    });

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => {
      expect(
        host.querySelector<HTMLInputElement>('input[aria-label="question 2 answer"]'),
      ).not.toBeNull();
    });
    const previous = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "prev",
    );
    expect(previous).toBeDefined();
    previous?.click();
    await vi.waitFor(() => {
      expect(
        host.querySelector<HTMLInputElement>('input[aria-label="question 1 answer"]'),
      ).not.toBeNull();
      expect(host.textContent).toContain("错误");
    });

    const weakMode = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "weak",
    );
    expect(weakMode).toBeDefined();
    weakMode?.click();
    await vi.waitFor(() => {
      expect(host.textContent).toContain("missed");
      expect(host.textContent).toContain("weak 1");
    });
    const weakInput = host.querySelector<HTMLInputElement>('input[aria-label="question 1 answer"]');
    expect(weakInput).not.toBeNull();
    if (!weakInput) return;
    weakInput.value = missing;
    weakInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
    weakInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => {
      expect(host.textContent).toContain("正确");
    });
    expect(host.querySelector(".det-slot--incorrect")).toBeNull();
    expect(host.querySelector(".det-slot--correct")).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem(DET_MISTAKES_STORAGE_KEY) ?? "[]")).toEqual([]);

    const back = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "back to practice",
    );
    expect(back).toBeDefined();
    back?.click();
    await vi.waitFor(() => {
      expect(host.querySelector(".typing-area")).not.toBeNull();
    });
  });

  it("marks a correctly typed character as correct", async () => {
    const host = await mountApp();
    const text = host.querySelector(".typing-area")?.textContent ?? "";
    type(text[0] ?? "");
    await vi.waitFor(() => {
      const firstChar = host.querySelector(".typing-area .char");
      expect(firstChar?.classList.contains("char--correct")).toBe(true);
    });
  });

  it("shows the results screen with metrics after a full run", async () => {
    const host = await mountApp();
    const text = host.querySelector(".typing-area")?.textContent ?? "";
    for (const char of text) {
      type(char);
    }
    await vi.waitFor(() => {
      expect(host.querySelector(".results")).not.toBeNull();
    });
    // A headline WPM stat is rendered.
    expect(host.querySelector(".stat--big .stat__value")).not.toBeNull();
  });

  it("recovers and shows a warning banner when profile loading fails", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dispose = render(() => <App store={failingStore()} />, host);
    try {
      await vi.waitFor(() => {
        expect(host.querySelector(".typing-area")).not.toBeNull();
      });
      expect(host.querySelector(".banner--warn")).not.toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("does not crash if unmounted before the profile load resolves", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = pausedStore();
    const localDispose = render(() => <App store={store} />, host);
    // Unmount before the load promise resolves.
    localDispose();
    store.release();
    // Give the async setup a chance to run after disposal.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("shows the eviction banner when load returns status 'evicted'", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    dispose = render(() => <App store={evictedStore()} />, host);
    await vi.waitFor(() => {
      expect(host.querySelector(".typing-area")).not.toBeNull();
    });
    const banner = host.querySelector(".banner--warn");
    expect(banner?.textContent).toMatch(/wiped|evict/i);
  });

  it("shows the corrupt banner when load returns status 'corrupt'", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dispose = render(() => <App store={corruptStore("bad version")} />, host);
    try {
      await vi.waitFor(() => {
        expect(host.querySelector(".typing-area")).not.toBeNull();
      });
      expect(host.querySelector(".banner--warn")?.textContent).toMatch(/couldn't be read/i);
    } finally {
      warn.mockRestore();
    }
  });

  it("shows the save-failed banner when a completed run fails to persist", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dispose = render(() => <App store={saveFailingStore()} />, host);
    try {
      await vi.waitFor(() => {
        expect(host.querySelector(".typing-area")).not.toBeNull();
      });
      const text = host.querySelector(".typing-area")?.textContent ?? "";
      for (const char of text) {
        type(char);
      }
      await vi.waitFor(() => {
        expect(host.querySelector(".banner--warn")?.textContent).toMatch(/couldn't be saved/i);
      });
    } finally {
      warn.mockRestore();
    }
  });
});
