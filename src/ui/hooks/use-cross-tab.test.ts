// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCrossTab } from "./use-cross-tab";

/**
 * Minimal BroadcastChannel polyfill for jsdom. Real jsdom currently lacks
 * BroadcastChannel; this fake routes messages between same-name instances
 * via a shared dispatcher so we can test cross-tab semantics in-process.
 */
class FakeBroadcastChannel extends EventTarget {
  private static channels = new Map<string, Set<FakeBroadcastChannel>>();
  constructor(public readonly name: string) {
    super();
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }
  postMessage(data: unknown): void {
    const peers = FakeBroadcastChannel.channels.get(this.name) ?? new Set();
    for (const peer of peers) {
      if (peer !== this) {
        peer.dispatchEvent(new MessageEvent("message", { data }));
      }
    }
  }
  close(): void {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

describe("createCrossTab", () => {
  beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts non-stale", () => {
    createRoot((dispose) => {
      const tab = createCrossTab("test");
      expect(tab.stale()).toBe(false);
      dispose();
    });
  });

  it("flips stale when a peer tab calls notify()", () => {
    createRoot((dispose) => {
      const a = createCrossTab("test");
      // Open a second logical "tab" against the same channel.
      createRoot((dispose2) => {
        const b = createCrossTab("test");
        b.notify();
        dispose2();
      });
      expect(a.stale()).toBe(true);
      dispose();
    });
  });

  it("notify() does not flip the caller's own stale flag", () => {
    createRoot((dispose) => {
      const tab = createCrossTab("test");
      tab.notify();
      expect(tab.stale()).toBe(false);
      dispose();
    });
  });

  it("reset() clears stale", () => {
    createRoot((dispose) => {
      const a = createCrossTab("test");
      createRoot((dispose2) => {
        const b = createCrossTab("test");
        b.notify();
        dispose2();
      });
      expect(a.stale()).toBe(true);
      a.reset();
      expect(a.stale()).toBe(false);
      dispose();
    });
  });

  it("listener is removed and channel closed on cleanup", () => {
    let firstA!: ReturnType<typeof createCrossTab>;
    let disposeA!: () => void;
    createRoot((d) => {
      disposeA = d;
      firstA = createCrossTab("test");
    });
    disposeA();
    // Post from a peer after dispose — the disposed tab's stale must not flip.
    createRoot((dispose) => {
      const peer = createCrossTab("test");
      peer.notify();
      dispose();
    });
    expect(firstA.stale()).toBe(false);
  });

  it("degrades to a no-op when BroadcastChannel is undefined", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    createRoot((dispose) => {
      const tab = createCrossTab("test");
      expect(tab.stale()).toBe(false);
      expect(() => tab.notify()).not.toThrow();
      expect(tab.stale()).toBe(false);
      dispose();
    });
  });
});
