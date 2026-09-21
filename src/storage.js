(function attachStorage(root, factory) {
  const api = factory(root);
  root.SlopSpotter = Object.assign(root.SlopSpotter || {}, api);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createStorage(root) {
  "use strict";

  const STORAGE_KEY = "slopSpotterStateV1";
  const DIAGNOSTICS_KEY = "slopSpotterDiagnosticsV1";
  const MAX_ACCOUNTS = 300;
  const MAX_POSTS_PER_ACCOUNT = 30;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    sensitivity: "balanced",
    showBlockSuggestions: true,
    minimumObservedPosts: 5,
    minimumFlaggedPosts: 3
  });

  let cachedState;
  let loadPromise;
  let writeQueue = Promise.resolve();
  let persistTimer;
  let diagnosticsCache;
  let diagnosticsLoadPromise;
  let diagnosticsWriteQueue = Promise.resolve();
  let diagnosticsPersistTimer;
  const memoryStorage = {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function randomSalt() {
    const bytes = new Uint8Array(16);
    if (root.crypto?.getRandomValues) {
      root.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function freshState() {
    return {
      schemaVersion: 2,
      salt: randomSalt(),
      settings: { ...DEFAULT_SETTINGS },
      accounts: {}
    };
  }

  function normalizeState(value) {
    const candidate = value && typeof value === "object" ? value : {};
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(candidate.settings && typeof candidate.settings === "object" ? candidate.settings : {})
    };
    if (Number(candidate.schemaVersion || 0) < 2 && settings.sensitivity === "conservative") {
      settings.sensitivity = "balanced";
    }
    return {
      schemaVersion: 2,
      salt: typeof candidate.salt === "string" && candidate.salt ? candidate.salt : randomSalt(),
      settings,
      accounts:
        candidate.accounts && typeof candidate.accounts === "object" ? candidate.accounts : {}
    };
  }

  function storageGet(key) {
    if (root.chrome?.storage?.local) {
      return root.chrome.storage.local.get(key).then((result) => result[key]);
    }
    return Promise.resolve(memoryStorage[key]);
  }

  function storageSet(key, value) {
    if (root.chrome?.storage?.local) {
      return root.chrome.storage.local.set({ [key]: value });
    }
    memoryStorage[key] = clone(value);
    return Promise.resolve();
  }

  async function init() {
    if (cachedState) {
      return cachedState;
    }
    if (!loadPromise) {
      loadPromise = storageGet(STORAGE_KEY).then(async (stored) => {
        cachedState = stored ? normalizeState(stored) : freshState();
        if (!stored || Number(stored.schemaVersion || 0) < 2) {
          await storageSet(STORAGE_KEY, cachedState);
        }
        return cachedState;
      });
    }
    return loadPromise;
  }

  async function persist() {
    await storageSet(STORAGE_KEY, cachedState);
  }

  function schedulePersist() {
    if (persistTimer) {
      return;
    }
    persistTimer = root.setTimeout(() => {
      persistTimer = undefined;
      persist().catch(() => undefined);
    }, 80);
  }

  function enqueueWrite(operation, options) {
    const result = writeQueue.then(async () => {
      await init();
      const output = await operation(cachedState);
      if (options?.deferPersist) {
        schedulePersist();
      } else {
        await persist();
      }
      return output;
    });
    writeQueue = result.catch(() => undefined);
    return result;
  }

  function normalizeHandle(handle) {
    return String(handle || "")
      .replace(/^@/u, "")
      .trim()
      .toLowerCase();
  }

  function evaluateAccount(account, settings, now) {
    const safeAccount = account || { posts: [] };
    const safeSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    const posts = Array.isArray(safeAccount.posts) ? safeAccount.posts : [];
    const flagged = posts.filter((post) => post.flagged === true);
    const families = new Set(flagged.flatMap((post) => post.families || []));
    const snoozed = Number(safeAccount.snoozedUntil || 0) > (now || Date.now());

    return {
      observedCount: posts.length,
      flaggedCount: flagged.length,
      familyCount: families.size,
      families: [...families],
      neverSuggest: safeAccount.neverSuggest === true,
      snoozed,
      shouldSuggest:
        safeSettings.showBlockSuggestions === true &&
        safeAccount.neverSuggest !== true &&
        !snoozed &&
        posts.length >= safeSettings.minimumObservedPosts &&
        flagged.length >= safeSettings.minimumFlaggedPosts &&
        families.size >= 2
    };
  }

  function pruneAccounts(accounts) {
    const entries = Object.entries(accounts);
    if (entries.length <= MAX_ACCOUNTS) {
      return;
    }
    entries
      .sort((left, right) => Number(right[1].lastSeen || 0) - Number(left[1].lastSeen || 0))
      .slice(MAX_ACCOUNTS)
      .forEach(([handle]) => delete accounts[handle]);
  }

  async function digestHex(value) {
    if (root.crypto?.subtle && typeof TextEncoder !== "undefined") {
      const bytes = new TextEncoder().encode(value);
      const digest = await root.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .slice(0, 16)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }

    // Fallback for unusual environments. This value is only a deduplication key.
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  async function fingerprintPost(handle, stablePostId, text) {
    const state = await init();
    const source = stablePostId || String(text || "").slice(0, 800);
    return digestHex(`${state.salt}|${normalizeHandle(handle)}|${source}`);
  }

  async function getSettings() {
    const state = await init();
    return clone(state.settings);
  }

  function updateSettings(patch) {
    const allowed = {};
    if (typeof patch.enabled === "boolean") {
      allowed.enabled = patch.enabled;
    }
    if (["conservative", "balanced", "sensitive"].includes(patch.sensitivity)) {
      allowed.sensitivity = patch.sensitivity;
    }
    if (typeof patch.showBlockSuggestions === "boolean") {
      allowed.showBlockSuggestions = patch.showBlockSuggestions;
    }

    return enqueueWrite((state) => {
      state.settings = { ...state.settings, ...allowed };
      return clone(state.settings);
    });
  }

  function recordObservation(observation) {
    return enqueueWrite((state) => {
      const handle = normalizeHandle(observation.handle);
      if (!handle || !observation.fingerprint) {
        return evaluateAccount(undefined, state.settings);
      }

      const now = Number(observation.at || Date.now());
      const account = state.accounts[handle] || {
        handle,
        posts: [],
        neverSuggest: false,
        snoozedUntil: 0,
        lastSeen: now
      };
      const alreadyRecorded = account.posts.some(
        (post) => post.fingerprint === observation.fingerprint
      );

      if (!alreadyRecorded) {
        account.posts.push({
          fingerprint: observation.fingerprint,
          flagged: observation.flagged === true,
          families: [...new Set(observation.families || [])].slice(0, 12),
          at: now
        });
        account.posts = account.posts
          .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
          .slice(0, MAX_POSTS_PER_ACCOUNT);
      }

      account.lastSeen = now;
      state.accounts[handle] = account;
      pruneAccounts(state.accounts);

      return {
        handle,
        ...evaluateAccount(account, state.settings, now),
        wasNew: !alreadyRecorded
      };
    }, { deferPersist: true });
  }

  function snoozeAccount(handle, durationMs) {
    return enqueueWrite((state) => {
      const key = normalizeHandle(handle);
      const account = state.accounts[key];
      if (!account) {
        return false;
      }
      account.snoozedUntil = Date.now() + Math.max(ONE_DAY, Number(durationMs || 0));
      return true;
    });
  }

  function ignoreAccount(handle) {
    return enqueueWrite((state) => {
      const key = normalizeHandle(handle);
      const account = state.accounts[key] || {
        handle: key,
        posts: [],
        lastSeen: Date.now(),
        snoozedUntil: 0
      };
      account.neverSuggest = true;
      state.accounts[key] = account;
      return true;
    });
  }

  function restoreAccount(handle) {
    return enqueueWrite((state) => {
      const key = normalizeHandle(handle);
      if (!state.accounts[key]) {
        return false;
      }
      state.accounts[key].neverSuggest = false;
      state.accounts[key].snoozedUntil = 0;
      return true;
    });
  }

  function clearHistory() {
    return enqueueWrite((state) => {
      state.accounts = {};
      state.salt = randomSalt();
      return true;
    });
  }

  async function getDashboard() {
    const state = await init();
    const accounts = Object.values(state.accounts);
    return {
      observedAccounts: accounts.length,
      observedPosts: accounts.reduce((total, account) => total + (account.posts?.length || 0), 0),
      flaggedPosts: accounts.reduce(
        (total, account) =>
          total + (account.posts || []).filter((post) => post.flagged === true).length,
        0
      ),
      ignoredHandles: accounts
        .filter((account) => account.neverSuggest === true)
        .map((account) => account.handle)
        .sort()
    };
  }

  async function getDiagnostics() {
    if (diagnosticsCache) {
      return clone(diagnosticsCache);
    }
    if (!diagnosticsLoadPromise) {
      diagnosticsLoadPromise = storageGet(DIAGNOSTICS_KEY).then((stored) => {
        diagnosticsCache = {
          lastScanAt: 0,
          origin: "",
          articleCount: 0,
          parsedCount: 0,
          evidenceCount: 0,
          highlightedCount: 0,
          errorCount: 0,
          lastError: "",
          ...(stored && typeof stored === "object" ? stored : {})
        };
        return diagnosticsCache;
      });
    }
    return clone(await diagnosticsLoadPromise);
  }

  function scheduleDiagnosticsPersist() {
    if (diagnosticsPersistTimer) {
      return;
    }
    diagnosticsPersistTimer = root.setTimeout(() => {
      diagnosticsPersistTimer = undefined;
      storageSet(DIAGNOSTICS_KEY, diagnosticsCache).catch(() => undefined);
    }, 150);
  }

  function reportDiagnostics(patch) {
    const result = diagnosticsWriteQueue.then(async () => {
      await getDiagnostics();
      diagnosticsCache = { ...diagnosticsCache, ...patch };
      scheduleDiagnosticsPersist();
      return clone(diagnosticsCache);
    });
    diagnosticsWriteQueue = result.catch(() => undefined);
    return result;
  }

  function onStateChanged(callback) {
    if (!root.chrome?.storage?.onChanged) {
      return () => undefined;
    }
    const listener = (changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }
      cachedState = normalizeState(changes[STORAGE_KEY].newValue);
      callback(clone(cachedState));
    };
    root.chrome.storage.onChanged.addListener(listener);
    return () => root.chrome.storage.onChanged.removeListener(listener);
  }

  return {
    DEFAULT_SETTINGS,
    DIAGNOSTICS_KEY,
    STORAGE_KEY,
    clearHistory,
    evaluateAccount,
    fingerprintPost,
    getDashboard,
    getDiagnostics,
    getSettings,
    ignoreAccount,
    init,
    normalizeHandle,
    onStateChanged,
    recordObservation,
    reportDiagnostics,
    restoreAccount,
    snoozeAccount,
    updateSettings
  };
});
