import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";

export interface CrossTab {
  /** True once another tab has posted a `profile-saved` message. */
  stale: Accessor<boolean>;
  /** Reset the stale flag — call when the user has reloaded or manually dismissed. */
  reset: () => void;
  /** Broadcast a save to peer tabs. Best-effort: a no-op if BroadcastChannel is unavailable. */
  notify: () => void;
}

interface BroadcastMessage {
  type: "profile-saved";
  at: number;
}

/**
 * Owns a single BroadcastChannel for cross-tab coordination. When peer tabs
 * call `notify()`, this hook's `stale` flips to true so the App can show a
 * "another tab updated — reload" banner.
 *
 * Must be called from a Solid reactive root — closes the channel on cleanup.
 * Degrades gracefully where `BroadcastChannel` is undefined (older browsers,
 * jsdom default): `stale` stays false and `notify` is a no-op.
 */
export function createCrossTab(channelName: string): CrossTab {
  const [stale, setStale] = createSignal(false);

  // Construction can throw in opaque-origin or otherwise restricted contexts
  // even when `BroadcastChannel` is defined. Degrade silently in that case
  // — cross-tab coordination is a nicety, not load-bearing.
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(channelName);
    } catch {
      channel = null;
    }
  }

  const handler = (event: MessageEvent<BroadcastMessage>): void => {
    if (event.data?.type === "profile-saved") {
      setStale(true);
    }
  };
  channel?.addEventListener("message", handler);

  // Tracked separately from `channel !== null` so `notify()` post-cleanup is a
  // hard no-op even if a pending Promise resolves after the component is gone
  // (some implementations throw on postMessage to a closed channel).
  let closed = false;
  onCleanup(() => {
    closed = true;
    channel?.removeEventListener("message", handler);
    channel?.close();
  });

  return {
    stale,
    reset: () => setStale(false),
    notify: () => {
      if (closed || channel === null) {
        return;
      }
      try {
        channel.postMessage({
          type: "profile-saved",
          at: Date.now(),
        } satisfies BroadcastMessage);
      } catch {
        // Best-effort: if posting fails the peers just don't get notified.
      }
    },
  };
}
