function installStorageShim(): void {
  const existing = globalThis.localStorage;
  if (existing && typeof existing.getItem === "function") return;

  const data = new Map<string, string>();

  class TestStorage implements Storage {
    get length(): number {
      return data.size;
    }
    clear(): void {
      data.clear();
    }
    getItem(key: string): string | null {
      const k = String(key);
      return data.has(k) ? (data.get(k) ?? null) : null;
    }
    key(index: number): string | null {
      return Array.from(data.keys())[index] ?? null;
    }
    removeItem(key: string): void {
      data.delete(String(key));
    }
    setItem(key: string, value: string): void {
      data.set(String(key), String(value));
    }
  }

  Object.defineProperty(globalThis, "Storage", {
    configurable: true,
    value: TestStorage,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "Storage", {
      configurable: true,
      value: TestStorage,
    });
  }

  const storage = new TestStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  }
}

installStorageShim();
