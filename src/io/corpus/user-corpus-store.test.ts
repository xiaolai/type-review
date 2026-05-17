import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  IndexedDbUserCorpusStore,
  InMemoryUserCorpusStore,
  MAX_USER_PASSAGES,
  type UserCorpusStore,
} from "./user-corpus-store";

const stores: IndexedDbUserCorpusStore[] = [];
afterEach(async () => {
  for (const s of stores) {
    try {
      await s.close();
    } catch {
      /* best effort */
    }
  }
  stores.length = 0;
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase("type-review");
    r.onsuccess = () => resolve();
    r.onerror = () => resolve();
    r.onblocked = () => resolve();
  });
});

function commonContractTests(name: string, factory: () => UserCorpusStore): void {
  describe(name, () => {
    it("starts empty", async () => {
      expect(await factory().list()).toEqual([]);
    });

    it("add stores a passage; list returns it", async () => {
      const store = factory();
      await store.add({ id: "p1", title: "Hello", text: "Hello world" });
      const items = await store.list();
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe("p1");
      expect(items[0]?.title).toBe("Hello");
      expect(items[0]?.text).toBe("Hello world");
      expect(typeof items[0]?.createdAt).toBe("number");
    });

    it("delete removes the matching passage; no-op when id is unknown", async () => {
      const store = factory();
      await store.add({ id: "p1", title: "a", text: "alpha" });
      await store.add({ id: "p2", title: "b", text: "beta" });
      await store.delete("p2");
      expect((await store.list()).map((p) => p.id)).toEqual(["p1"]);
      await store.delete("does-not-exist");
      expect((await store.list()).map((p) => p.id)).toEqual(["p1"]);
    });

    it("clear empties the store", async () => {
      const store = factory();
      await store.add({ id: "p1", title: "a", text: "alpha" });
      await store.add({ id: "p2", title: "b", text: "beta" });
      await store.clear();
      expect(await store.list()).toEqual([]);
    });

    it("rejects empty text", async () => {
      await expect(factory().add({ id: "p1", title: "t", text: "" })).rejects.toThrow(/empty/);
    });

    it("rejects duplicate ids", async () => {
      const store = factory();
      await store.add({ id: "p1", title: "a", text: "alpha" });
      await expect(store.add({ id: "p1", title: "b", text: "beta" })).rejects.toThrow(/duplicate/);
    });

    it("uses the first 40 chars of text when title is blank", async () => {
      const store = factory();
      await store.add({
        id: "p1",
        title: "   ",
        text: "this is the long opening sentence of a passage",
      });
      const items = await store.list();
      expect(items[0]?.title).toBe("this is the long opening sentence of a p");
    });

    it("enforces MAX_USER_PASSAGES", async () => {
      const store = factory();
      // Verify the cap is respected by adding up to the limit, then trying one more.
      // Use small text to keep tests fast.
      for (let i = 0; i < MAX_USER_PASSAGES; i++) {
        await store.add({ id: `p-${i}`, title: `t-${i}`, text: "x" });
      }
      await expect(store.add({ id: "overflow", title: "t", text: "x" })).rejects.toThrow(/full/);
    });
  });
}

commonContractTests("InMemoryUserCorpusStore", () => new InMemoryUserCorpusStore());
commonContractTests("IndexedDbUserCorpusStore", () => {
  const s = new IndexedDbUserCorpusStore();
  stores.push(s);
  return s;
});
