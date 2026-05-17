import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";
import type { SessionSnapshot } from "../../engine/session";

export interface SnapshotView {
  /** Latest snapshot. `undefined` until `attach()` is called the first time. */
  snapshot: Accessor<SessionSnapshot | undefined>;
  /**
   * Schedule a RAF-batched refresh. Multiple calls within the same animation
   * frame coalesce into one signal write. Cheap; safe to call per keystroke.
   */
  sync: () => void;
  /**
   * Refresh immediately. Use only for non-hot events (completion, settings,
   * restart, screen transitions) — bypasses RAF batching.
   */
  syncNow: () => void;
  /**
   * Wire the snapshot source. Call once when the async session lifecycle is
   * ready. Triggers an immediate `syncNow` so the first render has data.
   */
  attach: (source: () => SessionSnapshot) => void;
}

/**
 * Owns the RAF-batched snapshot signal that bridges the pure engine to Solid.
 * Keeps the typing hot loop out of reactive state: keystrokes mutate the
 * `Session` plainly and call `sync()`, which writes the signal at most once
 * per animation frame.
 *
 * Must be called from within a Solid component / reactive root — uses
 * `onCleanup` to cancel any pending RAF on unmount.
 */
export function createSnapshotView(): SnapshotView {
  const [snapshot, setSnapshot] = createSignal<SessionSnapshot | undefined>();
  let source: (() => SessionSnapshot) | null = null;
  let rafId: number | null = null;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  const sync = (): void => {
    if (disposed || source === null || rafId !== null) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (disposed || source === null) {
        return;
      }
      setSnapshot(source());
    });
  };

  const syncNow = (): void => {
    if (disposed || source === null) {
      return;
    }
    setSnapshot(source());
  };

  const attach = (provider: () => SessionSnapshot): void => {
    if (disposed) {
      return;
    }
    source = provider;
    syncNow();
  };

  return { snapshot, sync, syncNow, attach };
}
