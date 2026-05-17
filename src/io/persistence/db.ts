/**
 * Shared IndexedDB opener for the `type-review` database. Both
 * `IndexedDbProfileStore` (profile) and `IndexedDbUserCorpusStore`
 * (user-uploaded passages) call through here so the upgrade callback runs
 * once per open, creating every object store the app needs.
 *
 * Versioning rule: bump `DB_VERSION` whenever you add a new object store or
 * change an index. The upgrade callback is idempotent — it checks existence
 * before `createObjectStore`, so it's safe on both fresh installs and
 * v1→vN upgrades.
 */

export const DB_NAME = "type-review";
export const DB_VERSION = 2;

export const PROFILE_STORE = "profile";
export const USER_CORPUS_STORE = "user-corpus";

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(PROFILE_STORE)) {
    db.createObjectStore(PROFILE_STORE);
  }
  if (!db.objectStoreNames.contains(USER_CORPUS_STORE)) {
    db.createObjectStore(USER_CORPUS_STORE, { keyPath: "id" });
  }
}

/**
 * Opens (or upgrades, or creates) the `type-review` database. Returns the
 * raw open request so each store can attach its own onversionchange /
 * onclose handlers — the caching and recovery policy stays per-store.
 */
export function openTypeReviewDb(factory: IDBFactory): IDBOpenDBRequest {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => upgrade(request.result);
  return request;
}

/**
 * Promise wrapper for a single IDBRequest. Resolves with `request.result`
 * on success, rejects with `request.error` on failure (with a generic
 * message if the browser didn't attach one).
 *
 * IDB note: this composes inside a transaction only as long as no
 * microtask boundary opens between consecutive requests. Issue all
 * requests on a transaction synchronously, then await their promises.
 */
export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
