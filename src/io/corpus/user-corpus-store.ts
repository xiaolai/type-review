import { openTypeReviewDb, promisifyRequest, USER_CORPUS_STORE } from "../persistence/db";

/**
 * One user-uploaded passage as it lives in IndexedDB. The schema is
 * deliberately small — title and text plus a creation timestamp; the
 * `alphabet` and `length` used by the corpus selector are derived at load
 * time so they can never drift from the actual text.
 */
export interface UserPassage {
  id: string;
  title: string;
  text: string;
  createdAt: number;
}

/** Defensive bounds. Numbers tuned for plain text; tweak with reason. */
export const MAX_USER_PASSAGES = 200;
export const MAX_USER_PASSAGE_LENGTH = 50_000;
export const MAX_USER_TITLE_LENGTH = 200;

export interface UserCorpusStore {
  list(): Promise<UserPassage[]>;
  add(passage: Omit<UserPassage, "createdAt">): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

/**
 * In-memory user-corpus store — used when IndexedDB is unavailable and as a
 * dependency-free target for unit tests.
 */
export class InMemoryUserCorpusStore implements UserCorpusStore {
  private readonly data: UserPassage[] = [];

  list(): Promise<UserPassage[]> {
    return Promise.resolve(this.data.slice());
  }

  add(passage: Omit<UserPassage, "createdAt">): Promise<void> {
    const cleanTitle = passage.title.trim().slice(0, MAX_USER_TITLE_LENGTH);
    const cleanText = passage.text.slice(0, MAX_USER_PASSAGE_LENGTH);
    if (cleanText.length === 0) {
      return Promise.reject(new Error("passage text is empty"));
    }
    if (this.data.length >= MAX_USER_PASSAGES) {
      return Promise.reject(new Error(`user corpus is full (max ${MAX_USER_PASSAGES})`));
    }
    // Reject duplicate ids — the caller is responsible for uniqueness.
    if (this.data.some((p) => p.id === passage.id)) {
      return Promise.reject(new Error(`duplicate id: ${passage.id}`));
    }
    this.data.push({
      id: passage.id,
      title: cleanTitle.length > 0 ? cleanTitle : cleanText.slice(0, 40),
      text: cleanText,
      createdAt: Date.now(),
    });
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    const i = this.data.findIndex((p) => p.id === id);
    if (i !== -1) this.data.splice(i, 1);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.data.length = 0;
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * IndexedDB-backed user-corpus store. Lives in the same `type-review`
 * database as the profile, in a separate object store. Open / upgrade /
 * version handling is shared via `openTypeReviewDb`.
 */
export class IndexedDbUserCorpusStore implements UserCorpusStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;

  constructor(factory?: IDBFactory) {
    this.factory = factory ?? indexedDB;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise !== null) return this.dbPromise;
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
      const request = openTypeReviewDb(this.factory);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = (): void => {
          db.close();
          if (this.dbPromise === pending) this.dbPromise = null;
        };
        db.onclose = (): void => {
          if (this.dbPromise === pending) this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error("failed to open IndexedDB"));
    });
    this.dbPromise = pending;
    pending.catch(() => {
      if (this.dbPromise === pending) this.dbPromise = null;
    });
    return pending;
  }

  async list(): Promise<UserPassage[]> {
    const db = await this.openDb();
    const tx = db.transaction(USER_CORPUS_STORE, "readonly");
    const raw = await promisifyRequest(tx.objectStore(USER_CORPUS_STORE).getAll());
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB read aborted"));
    });
    // Validate each entry defensively — tampered storage may have garbage.
    const valid: UserPassage[] = [];
    for (const entry of raw) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Partial<UserPassage>;
      if (
        typeof e.id !== "string" ||
        typeof e.title !== "string" ||
        typeof e.text !== "string" ||
        typeof e.createdAt !== "number" ||
        e.text.length === 0 ||
        e.text.length > MAX_USER_PASSAGE_LENGTH
      ) {
        continue;
      }
      valid.push({
        id: e.id,
        title: e.title.slice(0, MAX_USER_TITLE_LENGTH),
        text: e.text,
        createdAt: e.createdAt,
      });
    }
    return valid;
  }

  async add(passage: Omit<UserPassage, "createdAt">): Promise<void> {
    const cleanTitle = passage.title.trim().slice(0, MAX_USER_TITLE_LENGTH);
    const cleanText = passage.text.slice(0, MAX_USER_PASSAGE_LENGTH);
    if (cleanText.length === 0) {
      throw new Error("passage text is empty");
    }

    // Count + duplicate check + write all live inside ONE readwrite
    // transaction so two parallel add() calls can't both observe a
    // pre-limit count and slip the user corpus past MAX_USER_PASSAGES,
    // and can't both succeed with the same id.
    //
    // IDB transactions auto-commit as soon as they have no pending
    // requests — `await`ing across requests is a footgun because the
    // microtask flush between them lets the txn close. We issue count()
    // and get() synchronously, then drive limit/duplicate checks and
    // the add() from their callbacks, awaiting only `tx.oncomplete`.
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(USER_CORPUS_STORE, "readwrite");
      const store = tx.objectStore(USER_CORPUS_STORE);
      const countReq = store.count();
      const existingReq = store.get(passage.id);
      let limitErr: Error | null = null;
      let dupErr: Error | null = null;
      countReq.onsuccess = (): void => {
        if (countReq.result >= MAX_USER_PASSAGES) {
          limitErr = new Error(`user corpus is full (max ${MAX_USER_PASSAGES})`);
          tx.abort();
        }
      };
      existingReq.onsuccess = (): void => {
        if (limitErr !== null) return;
        if (existingReq.result !== undefined) {
          dupErr = new Error(`duplicate id: ${passage.id}`);
          tx.abort();
          return;
        }
        store.add({
          id: passage.id,
          title: cleanTitle.length > 0 ? cleanTitle : cleanText.slice(0, 40),
          text: cleanText,
          createdAt: Date.now(),
        } satisfies UserPassage);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(limitErr ?? dupErr ?? tx.error ?? new Error("IndexedDB add aborted"));
      tx.onerror = () =>
        reject(limitErr ?? dupErr ?? tx.error ?? new Error("IndexedDB add failed"));
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(USER_CORPUS_STORE, "readwrite");
    tx.objectStore(USER_CORPUS_STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB delete aborted"));
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction(USER_CORPUS_STORE, "readwrite");
    tx.objectStore(USER_CORPUS_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB clear failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB clear aborted"));
    });
  }

  async close(): Promise<void> {
    if (this.dbPromise === null) return;
    const db = await this.dbPromise.catch(() => null);
    if (db !== null) db.close();
    this.dbPromise = null;
  }
}

/** Probes IDB availability; returns `InMemoryUserCorpusStore` as the safe fallback. */
export async function createUserCorpusStore(): Promise<UserCorpusStore> {
  if (typeof indexedDB === "undefined") {
    return new InMemoryUserCorpusStore();
  }
  const candidate = new IndexedDbUserCorpusStore();
  try {
    await candidate.list();
    return candidate;
  } catch {
    await candidate.close().catch(() => undefined);
    return new InMemoryUserCorpusStore();
  }
}
