import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../engine/session";
import { clearSavedMarker, hasSavedMarker } from "./marker";
import { IndexedDbProfileStore, InMemoryProfileStore } from "./stores";

function sampleProfile(): Profile {
  return {
    settings: {
      mode: "adaptive",
      targetWpm: 50,
      wordCount: 30,
      stopOnError: false,
      adaptive: { minAlphabetSize: 6, alphabetExpansion: 0 },
      includeNumbers: false,
      includePunctuation: false,
      testMode: "words" as const,
      testDurationSec: 30,
      noBackspace: false,
      passageLength: "any",
    },
    results: [
      {
        index: 0,
        mode: "adaptive",
        timestamp: 1_700_000_000_000,
        passageId: "p1",
        text: "ten",
        metrics: {
          netWpm: 60,
          rawWpm: 62,
          accuracy: 97,
          consistency: 88,
          wpmStdDev: 0,
          wpmSeries: [],
          correctChars: 3,
          incorrectChars: 0,
          durationMs: 1000,
        },
        histogram: new Map([["te", { hitCount: 1, missCount: 0, timeToType: 200 }]]),
      },
    ],
  };
}

describe("InMemoryProfileStore", () => {
  beforeEach(() => clearSavedMarker());

  it("reports absent before anything is saved", async () => {
    const store = new InMemoryProfileStore();
    expect((await store.load()).status).toBe("absent");
  });

  it("persists and reloads a profile", async () => {
    const store = new InMemoryProfileStore();
    const profile = sampleProfile();
    await store.save(profile);
    expect(await store.load()).toEqual({ status: "ok", profile });
  });

  it("reset clears the persisted profile and the saved marker", async () => {
    const store = new InMemoryProfileStore();
    await store.save(sampleProfile());
    await store.reset();
    // After reset the marker is cleared too, so this is genuinely absent (not evicted).
    expect((await store.load()).status).toBe("absent");
  });
});

function makeFakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i) => Array.from(data.keys())[i] ?? null,
    get length() {
      return data.size;
    },
  };
}

describe("evicted detection (C2 — split-store recovery)", () => {
  beforeEach(() => clearSavedMarker());

  const fakeStorage = makeFakeStorage;

  it("reports 'evicted' when the saved marker exists but no profile is in the store", async () => {
    const fakeLocal = fakeStorage();
    vi.stubGlobal("localStorage", fakeLocal);
    try {
      fakeLocal.setItem("type-review:has-saved-profile", "1");
      const store = new InMemoryProfileStore();
      expect((await store.load()).status).toBe("evicted");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a successful save sets the marker (subsequent load with no data → evicted)", async () => {
    const fakeLocal = fakeStorage();
    vi.stubGlobal("localStorage", fakeLocal);
    try {
      const store = new InMemoryProfileStore();
      await store.save(sampleProfile());
      expect(fakeLocal.getItem("type-review:has-saved-profile")).toBe("1");
      const freshStore = new InMemoryProfileStore();
      expect((await freshStore.load()).status).toBe("evicted");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("IndexedDbProfileStore", () => {
  const opened: IndexedDbProfileStore[] = [];
  const track = (store: IndexedDbProfileStore): IndexedDbProfileStore => {
    opened.push(store);
    return store;
  };

  afterEach(async () => {
    for (const store of opened) {
      try {
        await store.close();
      } catch {
        // best-effort cleanup
      }
    }
    opened.length = 0;
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("type-review");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    clearSavedMarker();
  });

  it("reports absent before anything is saved", async () => {
    const store = track(new IndexedDbProfileStore());
    expect((await store.load()).status).toBe("absent");
  });

  it("round-trips a profile through IndexedDB", async () => {
    const writer = track(new IndexedDbProfileStore());
    const profile = sampleProfile();
    await writer.save(profile);
    await writer.close();
    const reader = track(new IndexedDbProfileStore());
    expect(await reader.load()).toEqual({ status: "ok", profile });
  });

  it("rejects load when the underlying IDBFactory open call fails", async () => {
    const failingFactory = {
      open: (): IDBOpenDBRequest => {
        const request = {
          result: undefined,
          error: new Error("open failed"),
          onsuccess: null as ((this: IDBRequest, ev: Event) => unknown) | null,
          onerror: null as ((this: IDBRequest, ev: Event) => unknown) | null,
          onupgradeneeded: null,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => {
          request.onerror?.call(request as unknown as IDBRequest, new Event("error"));
        });
        return request;
      },
    } as unknown as IDBFactory;
    const store = new IndexedDbProfileStore(failingFactory);
    await expect(store.load()).rejects.toThrow(/open failed/);
  });

  it("does not poison the dbPromise cache after a failed open — next call retries", async () => {
    let openAttempts = 0;
    const factory = {
      open: (...args: unknown[]): IDBOpenDBRequest => {
        openAttempts++;
        if (openAttempts === 1) {
          const request = {
            result: undefined,
            error: new Error("transient"),
            onsuccess: null,
            onerror: null as ((this: IDBRequest, ev: Event) => unknown) | null,
            onupgradeneeded: null,
          } as unknown as IDBOpenDBRequest;
          queueMicrotask(() => {
            request.onerror?.call(request as unknown as IDBRequest, new Event("error"));
          });
          return request;
        }
        return (indexedDB.open as IDBFactory["open"])(...(args as [string, number]));
      },
    } as unknown as IDBFactory;
    const store = new IndexedDbProfileStore(factory);
    await expect(store.load()).rejects.toThrow();
    const result = await store.load();
    expect(result.status).toBe("absent");
    expect(openAttempts).toBe(2);
  });

  it("reset deletes the database and clears the saved marker", async () => {
    vi.stubGlobal("localStorage", makeFakeStorage());
    try {
      const writer = track(new IndexedDbProfileStore());
      await writer.save(sampleProfile());
      expect(hasSavedMarker()).toBe(true);
      await writer.reset();
      expect(hasSavedMarker()).toBe(false);
      const reader = track(new IndexedDbProfileStore());
      expect((await reader.load()).status).toBe("absent");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reset rejects when deleteDatabase reports an error, and keeps the marker", async () => {
    vi.stubGlobal("localStorage", makeFakeStorage());
    try {
      // Save through the real factory so the marker is set.
      const writer = track(new IndexedDbProfileStore());
      await writer.save(sampleProfile());
      await writer.close();
      expect(hasSavedMarker()).toBe(true);

      const realOpen = indexedDB.open.bind(indexedDB);
      const failingFactory = {
        open: ((name: string, version?: number) => realOpen(name, version)) as IDBFactory["open"],
        deleteDatabase: (): IDBOpenDBRequest => {
          const request = {
            result: undefined,
            error: new Error("delete failed"),
            onsuccess: null,
            onerror: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
            onblocked: null,
          } as unknown as IDBOpenDBRequest;
          queueMicrotask(() => {
            request.onerror?.call(request, new Event("error"));
          });
          return request;
        },
      } as unknown as IDBFactory;

      const store = new IndexedDbProfileStore(failingFactory);
      await expect(store.reset()).rejects.toThrow(/delete failed/);
      // Marker must remain set so the next load still detects "evicted" rather
      // than a clean "absent" — the data may or may not still be there.
      expect(hasSavedMarker()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reset rejects when deleteDatabase is blocked, and keeps the marker", async () => {
    vi.stubGlobal("localStorage", makeFakeStorage());
    try {
      const writer = track(new IndexedDbProfileStore());
      await writer.save(sampleProfile());
      await writer.close();
      expect(hasSavedMarker()).toBe(true);

      const realOpen = indexedDB.open.bind(indexedDB);
      const blockingFactory = {
        open: ((name: string, version?: number) => realOpen(name, version)) as IDBFactory["open"],
        deleteDatabase: (): IDBOpenDBRequest => {
          const request = {
            result: undefined,
            error: null,
            onsuccess: null,
            onerror: null,
            onblocked: null as ((this: IDBOpenDBRequest, ev: Event) => unknown) | null,
          } as unknown as IDBOpenDBRequest;
          queueMicrotask(() => {
            request.onblocked?.call(request, new Event("blocked") as IDBVersionChangeEvent);
          });
          return request;
        },
      } as unknown as IDBFactory;

      const store = new IndexedDbProfileStore(blockingFactory);
      await expect(store.reset()).rejects.toThrow(/blocked/);
      expect(hasSavedMarker()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 'corrupt' when the stored payload is malformed", async () => {
    const writer = track(new IndexedDbProfileStore());
    await writer.save(sampleProfile());
    await writer.close();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("type-review");
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("profile", "readwrite");
        tx.objectStore("profile").put({ version: 999, garbage: true }, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    const reader = track(new IndexedDbProfileStore());
    expect((await reader.load()).status).toBe("corrupt");
  });
});
