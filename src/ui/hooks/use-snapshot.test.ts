// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { SessionSnapshot } from "../../engine/session";
import { createSnapshotView } from "./use-snapshot";

function makeSnapshot(netWpm: number): SessionSnapshot {
  return {
    mode: "adaptive",
    typing: {
      expected: "abc",
      statuses: ["untyped", "untyped", "untyped"],
      pos: 0,
      completed: false,
    },
    liveMetrics: {
      netWpm,
      rawWpm: netWpm,
      accuracy: 100,
      consistency: 0,
      wpmStdDev: 0,
      wpmSeries: [],
      correctChars: 0,
      incorrectChars: 0,
      durationMs: 0,
    },
    elapsedMs: 0,
    remainingSec: null,
    plan: null,
    lastResult: null,
  };
}

describe("createSnapshotView", () => {
  it("starts with undefined snapshot until attach is called", () => {
    createRoot((dispose) => {
      const view = createSnapshotView();
      expect(view.snapshot()).toBeUndefined();
      dispose();
    });
  });

  it("attach reads the source immediately (syncNow)", () => {
    createRoot((dispose) => {
      const view = createSnapshotView();
      let current = makeSnapshot(50);
      view.attach(() => current);
      expect(view.snapshot()?.liveMetrics.netWpm).toBe(50);
      // syncNow reads the source again
      current = makeSnapshot(75);
      view.syncNow();
      expect(view.snapshot()?.liveMetrics.netWpm).toBe(75);
      dispose();
    });
  });

  it("sync defers update to the next animation frame", async () => {
    await new Promise<void>((done) => {
      createRoot((dispose) => {
        const view = createSnapshotView();
        let current = makeSnapshot(0);
        view.attach(() => current);
        current = makeSnapshot(100);
        // sync schedules but doesn't apply yet
        view.sync();
        expect(view.snapshot()?.liveMetrics.netWpm).toBe(0);
        // After a frame
        requestAnimationFrame(() => {
          expect(view.snapshot()?.liveMetrics.netWpm).toBe(100);
          dispose();
          done();
        });
      });
    });
  });

  it("coalesces multiple syncs within a frame into one source read", async () => {
    await new Promise<void>((done) => {
      createRoot((dispose) => {
        const view = createSnapshotView();
        const provider = vi.fn(() => makeSnapshot(1));
        view.attach(provider);
        provider.mockClear(); // ignore the syncNow from attach
        view.sync();
        view.sync();
        view.sync();
        requestAnimationFrame(() => {
          // Source read at most once for the batched syncs.
          expect(provider).toHaveBeenCalledTimes(1);
          dispose();
          done();
        });
      });
    });
  });

  it("cancels pending RAF on cleanup", async () => {
    let view!: ReturnType<typeof createSnapshotView>;
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      view = createSnapshotView();
      let current = makeSnapshot(0);
      view.attach(() => current);
      current = makeSnapshot(999);
      view.sync(); // pending
    });
    dispose();
    // Wait two frames; if RAF still fired, this would update to 999.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    expect(view.snapshot()?.liveMetrics.netWpm).toBe(0);
  });

  it("syncNow is a no-op after cleanup", () => {
    let view!: ReturnType<typeof createSnapshotView>;
    createRoot((dispose) => {
      view = createSnapshotView();
      view.attach(() => makeSnapshot(7));
      dispose();
    });
    // Source change after dispose; syncNow should not update.
    view.syncNow();
    expect(view.snapshot()?.liveMetrics.netWpm).toBe(7);
  });
});
