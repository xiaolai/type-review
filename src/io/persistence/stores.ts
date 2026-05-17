import type { Profile } from "../../engine/session";
import { DB_NAME, openTypeReviewDb, PROFILE_STORE, promisifyRequest } from "./db";
import { clearSavedMarker, hasSavedMarker, setSavedMarker } from "./marker";
import { deserializeProfile, serializeProfile } from "./serialization";
import type { LoadResult, ProfileStore, SerializedProfile } from "./types";

/** In-memory store — used for tests and as a fallback when IndexedDB is unavailable. */
export class InMemoryProfileStore implements ProfileStore {
  private data: SerializedProfile | null = null;

  load(): Promise<LoadResult> {
    if (this.data === null) {
      return Promise.resolve(hasSavedMarker() ? { status: "evicted" } : { status: "absent" });
    }
    // Round-trip through JSON so deserialization tests exercise the real path.
    const cloned: unknown = JSON.parse(JSON.stringify(this.data));
    return Promise.resolve(deserializeProfile(cloned));
  }

  save(profile: Profile): Promise<void> {
    this.data = JSON.parse(JSON.stringify(serializeProfile(profile))) as SerializedProfile;
    setSavedMarker();
    return Promise.resolve();
  }

  reset(): Promise<void> {
    this.data = null;
    clearSavedMarker();
    return Promise.resolve();
  }
}

const PROFILE_KEY = "current";

/** IndexedDB-backed profile store — the default browser persistence backend. */
export class IndexedDbProfileStore implements ProfileStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;

  /** @param factory optional IDBFactory override — defaults to the global. Injectable for tests. */
  constructor(factory?: IDBFactory) {
    this.factory = factory ?? indexedDB;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise !== null) {
      return this.dbPromise;
    }
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = openTypeReviewDb(this.factory);
      request.onsuccess = () => {
        const db = request.result;
        // If another tab upgrades the schema, close this connection so the
        // upgrade can proceed; clear the cache so the next call re-opens.
        db.onversionchange = (): void => {
          db.close();
          if (this.dbPromise === pending) {
            this.dbPromise = null;
          }
        };
        // If the connection is closed unexpectedly (browser pressure, tab
        // backgrounding eviction), invalidate the cache so a fresh open is
        // attempted on the next operation.
        db.onclose = (): void => {
          if (this.dbPromise === pending) {
            this.dbPromise = null;
          }
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("failed to open IndexedDB"));
    });
    // Crucially, do NOT cache a rejection. A transient open failure should
    // not poison every future load/save for the rest of the page lifetime.
    this.dbPromise = pending;
    pending.catch(() => {
      if (this.dbPromise === pending) {
        this.dbPromise = null;
      }
    });
    return pending;
  }

  async load(): Promise<LoadResult> {
    const db = await this.openDb();
    const tx = db.transaction(PROFILE_STORE, "readonly");
    const raw = await promisifyRequest(tx.objectStore(PROFILE_STORE).get(PROFILE_KEY));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB read aborted"));
    });
    if (raw === undefined) {
      return hasSavedMarker() ? { status: "evicted" } : { status: "absent" };
    }
    return deserializeProfile(raw);
  }

  async save(profile: Profile): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(PROFILE_STORE, "readwrite");
    tx.objectStore(PROFILE_STORE).put(serializeProfile(profile), PROFILE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted"));
    });
    setSavedMarker();
  }

  /**
   * Closes the underlying database connection. Optional in production (the
   * connection lives for the app's lifetime); essential for test isolation,
   * where leaving connections open blocks `deleteDatabase` between tests.
   */
  async close(): Promise<void> {
    if (this.dbPromise === null) {
      return;
    }
    const db = await this.dbPromise.catch(() => null);
    if (db !== null) {
      db.close();
    }
    this.dbPromise = null;
  }

  /**
   * Deletes the entire IndexedDB database and clears the saved-data marker.
   * Must close the active connection first or `deleteDatabase` blocks.
   * `onblocked` means another connection (typically another tab) still holds
   * the database open — rejecting fails loud rather than letting the caller
   * believe the reset succeeded.
   */
  async reset(): Promise<void> {
    await this.close();
    await new Promise<void>((resolve, reject) => {
      const request = this.factory.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("failed to delete IndexedDB database"));
      request.onblocked = () =>
        reject(new Error("deleteDatabase blocked — close other tabs and retry"));
    });
    // Marker is cleared only after the database is gone, so a blocked or
    // errored deletion does not leave the system in a "marker says we had
    // data, store says nothing's there" → spurious "evicted" state.
    clearSavedMarker();
  }
}

/**
 * Last-resort store used when `createProfileStore` rejected during init
 * (vanishingly rare — the probe inside it already falls back to in-memory).
 * Keeps the typing loop functional with no persistence for the session.
 */
export class NoPersistStore implements ProfileStore {
  load(): Promise<LoadResult> {
    return Promise.resolve({ status: "absent" });
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Probes whether IndexedDB is actually usable, not just defined. Safari ITP
 * private mode and some Firefox configurations expose `indexedDB` but throw
 * on `.open()`; checking just `typeof` misses those.
 */
export async function createProfileStore(): Promise<ProfileStore> {
  if (typeof indexedDB === "undefined") {
    return new InMemoryProfileStore();
  }
  const candidate = new IndexedDbProfileStore();
  try {
    // Force a real open so private-mode failures surface here, not later.
    await candidate.load();
    return candidate;
  } catch {
    await candidate.close().catch(() => undefined);
    return new InMemoryProfileStore();
  }
}
