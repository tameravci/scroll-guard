(function (root, factory) {
  const api = factory(root);
  root.JevKeyStore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis, function (root) {
  "use strict";
  // The key lives in the extension origin's IndexedDB. It survives extension
  // reloads and browser restarts. Content scripts run in the x.com origin, so
  // they cannot open this database.
  // Named before the rename to Scroll Guard; kept so a saved key survives an update.
  const DB_NAME = "slopSpotterSecrets";
  const STORE = "secrets";
  const KEY_ID = "jevApiKey";

  function open() {
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function run(mode, action) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }

  // Tell other extension contexts that the key changed. The payload holds no secret.
  async function announce() {
    await root.chrome?.storage?.session?.set({ jevApiKeyChangedAt: Date.now() });
  }

  const store = {
    async get() {
      return (await run("readonly", (store) => store.get(KEY_ID))) || "";
    },
    async set(key) {
      await run("readwrite", (store) => store.put(key, KEY_ID));
      await announce();
    },
    async remove() {
      await run("readwrite", (store) => store.delete(KEY_ID));
      await announce();
    },
    // Extension pages only: the worker tests the key with a small Jev call first.
    // A rejected key is not saved. If Jev cannot be reached, the key is saved
    // anyway so an outage does not block setup, and the caller warns the user.
    async verifyAndSave(key) {
      const trimmed = String(key || "").trim();
      const result = await root.chrome.runtime.sendMessage({ type: "jev-verify-key", key: trimmed });
      if (!result?.valid && result?.reachable !== false) return { saved: false };
      await store.set(trimmed);
      return { saved: true, verified: result?.valid === true };
    }
  };
  return store;
});
