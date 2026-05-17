// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for the PWA-cleanup IIFE in main.tsx.
 *
 * The project removed its service worker on 2026-05-16, but any
 * returning user who visited the prior PWA-era deploy still has the
 * old `/sw.js` registered, intercepting requests forever. main.tsx
 * runs an unregister-and-clear block on boot to free them. This test
 * locks that behavior in — if the IIFE is ever simplified out the
 * test fails loudly.
 *
 * Safe to delete once telemetry confirms no live SW remains in the
 * wild (months of analytics with zero registrations).
 */
describe("main.tsx PWA cleanup", () => {
  let unregisterCalls: number;
  let deletedCacheNames: string[];

  beforeEach(() => {
    unregisterCalls = 0;
    deletedCacheNames = [];

    // Fake a couple of leftover SW registrations and caches.
    const fakeReg = {
      unregister: vi.fn(async () => {
        unregisterCalls++;
        return true;
      }),
    };
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      serviceWorker: {
        getRegistrations: vi.fn(async () => [fakeReg, fakeReg]),
      },
    });
    vi.stubGlobal("caches", {
      keys: vi.fn(async () => ["type-review-v1", "stale-cache"]),
      delete: vi.fn(async (k: string) => {
        deletedCacheNames.push(k);
        return true;
      }),
    });

    // Provide a #root and a minimal Solid render target so the import-side
    // App boot doesn't blow up — the probe is about the cleanup IIFE only.
    document.body.innerHTML = '<div id="root"></div>';
    // Cleanup IIFE is gated by a localStorage marker so it only runs once
    // per browser; clear between tests so each `import("./main")` actually
    // executes the cleanup branch.
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("unregisters every existing SW and clears every cache on boot", async () => {
    // Importing main.tsx executes the top-level cleanup IIFE.
    await import("./main");
    // Let microtasks drain so the async cleanup completes.
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(unregisterCalls).toBe(2);
    expect(deletedCacheNames).toEqual(["type-review-v1", "stale-cache"]);
  });

  it("swallows getRegistrations rejection without crashing the app", async () => {
    // Replace the success-path stub with a rejecting one and verify
    // the IIFE catches it (the catch logs a warning, not an exception).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      serviceWorker: {
        getRegistrations: vi.fn(() => Promise.reject(new Error("ITP private mode"))),
      },
    });
    await import("./main");
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(warn).toHaveBeenCalled();
    const messages = warn.mock.calls.map((args) => String(args[0] ?? ""));
    expect(messages.some((m) => m.includes("service worker cleanup failed"))).toBe(true);
    warn.mockRestore();
  });
});
