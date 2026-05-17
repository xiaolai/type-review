// @vitest-environment jsdom
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../engine/session";
import type { LoadResult, ProfileStore } from "../io";
import { App } from "./App";

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
