import { onCleanup, onMount } from "solid-js";
import type { Filter, Passage } from "../../engine/corpus";
import type { PassageLength, Profile, TestMode } from "../../engine/session";
import { createDefaultProfile, Session } from "../../engine/session";
import type {
  InputHandlerCallbacks,
  InputHandlerOptions,
  KeyEventBus,
  LoadResult,
  ProfileStore,
} from "../../io";
import { attachInputHandler } from "../../io";
import type { LoadBanner } from "../components/Banners";
import { logFailure } from "../log";

export interface SessionBootstrapOptions {
  /** Resolved later: the persistence store (IndexedDB, in-memory, or none). */
  storePromise: Promise<ProfileStore>;
  /** Fallback used if `storePromise` rejects. App typically supplies `() => new NoPersistStore()`. */
  fallbackStore: () => ProfileStore;
  /**
   * The shared keyboard event dispatcher. The input handler subscribes
   * through this rather than touching `window` directly, so the on-screen
   * keyboard's pressed-state listener can sit on the same bus without
   * racing a second listener.
   */
  bus: KeyEventBus;
  /** Show a load-banner. */
  setLoadBanner: (banner: LoadBanner) => void;
  /**
   * Called once after the `Session` is constructed and the input handler is
   * attached. The host stores the refs and wires the snapshot view.
   */
  onReady: (deps: { session: Session; store: ProfileStore }) => void;
  /** Forwarded to the constructed `Session` — fires when a run completes. */
  onResult: (profile: Profile) => void;
  /** Optional adaptive text source. Defaults to Session's built-in pseudo-words. */
  adaptiveSource?: (
    filter: Filter,
    wordCount: number,
    opts: { passageLength: PassageLength },
  ) => Passage;
  /** Optional benchmark text source. Defaults to Session's built-in common-words. */
  benchmarkSource?: (
    wordCount: number,
    opts: {
      includeNumbers: boolean;
      includePunctuation: boolean;
      passageLength: PassageLength;
      testMode: TestMode;
    },
  ) => Passage;
  /** Keystroke handlers wired through `attachInputHandler`. */
  input: InputHandlerCallbacks;
  /** Gates passed to `attachInputHandler`. */
  enabled: Required<Pick<InputHandlerOptions, "isEnabled" | "shouldConfirm">>;
}

/**
 * Owns the async session lifecycle: open the persistence store, load the
 * saved profile (or fall back), construct the `Session`, attach the keyboard
 * input handler to the shared bus, and register teardown for both.
 * Disposes safely if the surrounding component unmounts during the async work.
 *
 * Lives in `ui/hooks/` because it depends on Solid's `onMount`/`onCleanup`.
 * The store and engine code it orchestrates remain layer-pure.
 */
export function createSessionBootstrap(opts: SessionBootstrapOptions): void {
  let disposed = false;

  onMount(() => {
    let teardown: (() => void) | null = null;
    onCleanup(() => {
      disposed = true;
      teardown?.();
    });

    void (async (): Promise<void> => {
      let store: ProfileStore;
      try {
        store = await opts.storePromise;
      } catch (err: unknown) {
        logFailure("store-init", err);
        if (disposed) {
          return;
        }
        store = opts.fallbackStore();
        opts.setLoadBanner("corrupt");
      }
      if (disposed) {
        await store.close?.();
        return;
      }

      let initialProfile = createDefaultProfile();
      try {
        const result: LoadResult = await store.load();
        if (disposed) {
          await store.close?.();
          return;
        }
        switch (result.status) {
          case "ok":
            initialProfile = result.profile;
            break;
          case "absent":
            break;
          case "corrupt":
            logFailure("load", new Error(`corrupt profile: ${result.reason}`));
            opts.setLoadBanner("corrupt");
            break;
          case "evicted":
            opts.setLoadBanner("evicted");
            break;
        }
      } catch (err: unknown) {
        if (disposed) {
          await store.close?.();
          return;
        }
        logFailure("load", err);
        opts.setLoadBanner("corrupt");
      }

      const session = new Session(initialProfile, {
        onResult: () => opts.onResult(session.profile),
        ...(opts.adaptiveSource ? { adaptiveSource: opts.adaptiveSource } : {}),
        ...(opts.benchmarkSource ? { benchmarkSource: opts.benchmarkSource } : {}),
      });

      const handler = attachInputHandler(opts.bus, opts.input, opts.enabled);

      teardown = (): void => {
        handler.detach();
        void store.close?.();
      };
      if (disposed) {
        teardown();
        teardown = null;
        return;
      }

      opts.onReady({ session, store });
    })();
  });
}
