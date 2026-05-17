import type { Accessor } from "solid-js";
import { createSignal } from "solid-js";
import type { UserCorpusStore, UserPassage } from "../../io";
import { createUserCorpusStore } from "../../io";
import { logFailure } from "../log";

export interface UserCorpusControl {
  /** Reactive snapshot of the current user passage list. Empty until loaded. */
  passages: Accessor<readonly UserPassage[]>;
  /** Insert a new passage. Title may be empty — store will fall back to first 40 chars of text. */
  add: (input: { id: string; title: string; text: string }) => Promise<void>;
  /** Remove a passage by id. No-op when unknown. */
  remove: (id: string) => Promise<void>;
  /** Re-read the store. Used for cross-tab sync if/when wired. */
  refresh: () => Promise<void>;
}

/**
 * Reactive wrapper around the user-corpus IndexedDB store. The signal starts
 * empty and populates on first load (async); the composite corpus source
 * reads from this signal on every pick, so practice can begin before user
 * passages finish loading.
 */
export function createUserCorpus(): UserCorpusControl {
  const [passages, setPassages] = createSignal<readonly UserPassage[]>([]);
  let storePromise: Promise<UserCorpusStore> | null = null;

  const getStore = (): Promise<UserCorpusStore> => {
    storePromise ??= createUserCorpusStore();
    return storePromise;
  };

  const refresh = async (): Promise<void> => {
    try {
      const store = await getStore();
      const list = await store.list();
      // Newest first — matches user expectation in the library UI.
      const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
      setPassages(sorted);
    } catch (err: unknown) {
      logFailure("user-corpus", err);
    }
  };

  // Trigger the initial load. Errors are caught + logged; the empty signal
  // is a fine starting state.
  void refresh();

  return {
    passages,
    async add(input) {
      const store = await getStore();
      await store.add(input);
      await refresh();
    },
    async remove(id) {
      const store = await getStore();
      await store.delete(id);
      await refresh();
    },
    refresh,
  };
}
