import { render } from "solid-js/web";
import { App } from "./ui/App";
import { logFailure } from "./ui/log";
// Load order matters: tokens first, then app-level styles. The new design-system
// tokens (oklch, fluid type scale, breakpoints) come from `tokens.css`; the
// existing `styles.css` continues to drive layout until Stage 2 rewrites it
// against the new tokens.
import "./ui/tokens.css";
import "./ui/styles.css";

// Catch-all for promises whose rejection escapes the local handlers (engine
// throws, fetch failures, etc.). Without this, the rejection silently
// disappears to console with no structured context.
window.addEventListener("unhandledrejection", (event) => {
  logFailure("input", event.reason);
});

// Catch-all for synchronous errors escaping the dispatch path.
window.addEventListener("error", (event) => {
  logFailure("input", event.error ?? event.message);
});

const root = document.getElementById("root");
if (root === null) {
  throw new Error("#root element not found");
}

render(() => <App />, root);

// Tear down any leftover service worker from prior PWA-era builds. A user
// who visited an older deploy has /sw.js still registered; without this
// they would keep being served stale precached assets forever.
//
// Gated behind a one-time localStorage marker so it only runs on a given
// browser ONCE — first post-upgrade visit pays the unregister/cache-clear
// cost, subsequent visits become a no-op without touching the SW or
// caches API at all. Safe to remove this block (and the marker key)
// once enough time has passed that no live SW registrations remain in
// the wild.
const SW_CLEANUP_MARKER = "type-review:sw-cleanup-done";
// Safari ITP private mode + locked-down corporate browsers throw on
// `localStorage.getItem` itself (not just on `.setItem`). Wrap both
// reads and writes in try/catch so the gate degrades to "run cleanup
// every load" instead of crashing the app on its first paint.
function cleanupAlreadyDone(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SW_CLEANUP_MARKER) !== null;
  } catch {
    return false;
  }
}
function markCleanupDone(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SW_CLEANUP_MARKER, "1");
  } catch {
    // Best-effort: ignore.
  }
}
if ("serviceWorker" in navigator && !cleanupAlreadyDone()) {
  void (async (): Promise<void> => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      markCleanupDone();
    } catch (err: unknown) {
      console.warn("type-review: service worker cleanup failed", err);
    }
  })();
}
