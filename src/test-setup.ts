import "@testing-library/jest-dom/vitest";

// Node 24 ships an experimental webstorage polyfill that overrides
// jsdom's localStorage with a stub missing .clear() / .key() etc. We
// replace it on the jsdom window with a plain Map-backed shim so
// component tests behave like a real browser. No-op outside jsdom.
if (typeof window !== "undefined") {
  const store = new Map<string, string>();
  const polyfill: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(window, "localStorage", {
    value: polyfill,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: polyfill,
    configurable: true,
  });
}
