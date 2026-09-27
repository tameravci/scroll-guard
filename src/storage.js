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
  // Settings from the removed repeated-account block suggestions.
  const RETIRED_SETTINGS = ["showBlockSuggestions", "minimumObservedPosts", "minimumFlaggedPosts", "flagClickbait"];
  const VERDICTS = Object.freeze(["slop", "clickbait", "bot", "scam"]);
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    sensitivity: "balanced",
    verdicts: Object.freeze({ slop: true, clickbait: true, bot: true, scam: true })
  });

  function normalizeVerdicts(value, legacy) {
    const source = value && typeof value === "object" ? value : {};
    const verdicts = {};
    VERDICTS.forEach((key) => { verdicts[key] = source[key] !== false; });
    if (legacy?.flagClickbait === false && !(value && "clickbait" in value)) {
      verdicts.clickbait = false;
    }
    return verdicts;
  }

  // With no verdict type on, every request would be paid for and could never flag,
  // so turning off the last type also turns the extension off.
  function enforceActive(settings) {
    if (!VERDICTS.some((key) => settings.verdicts[key])) settings.enabled = false;
    return settings;
  }

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
      settings: { ...DEFAULT_SETTINGS, verdicts: { ...DEFAULT_SETTINGS.verdicts } },
      accounts: {}
    };
  }

  function normalizeState(value) {
    const candidate = value && typeof value === "object" ? value : {};
    const settings = {
      ...DEFAULT_SETTINGS,
      ...(candidate.settings && typeof candidate.settings === "object" ? candidate.settings : {})
    };
    settings.verdicts = normalizeVerdicts(settings.verdicts, settings);
    enforceActive(settings);
    RETIRED_SETTINGS.forEach((key) => delete settings[key]);
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
    if (patch.verdicts && typeof patch.verdicts === "object") {
      allowed.verdicts = patch.verdicts;
    }
    if (["conservative", "balanced", "sensitive"].includes(patch.sensitivity)) {
      allowed.sensitivity = patch.sensitivity;
    }

    return enqueueWrite((state) => {
      state.settings = { ...state.settings, ...allowed };
      state.settings.verdicts = normalizeVerdicts(state.settings.verdicts);
      // Switching on with every type off would flag nothing, so bring every type back.
      if (allowed.enabled === true && !VERDICTS.some((key) => state.settings.verdicts[key])) {
        state.settings.verdicts = { ...DEFAULT_SETTINGS.verdicts };
      }
      enforceActive(state.settings);
      return clone(state.settings);
    });
  }

  function recordObservation(observation) {
    return enqueueWrite((state) => {
      const handle = normalizeHandle(observation.handle);
      if (!handle || !observation.fingerprint) {
        return { handle, wasNew: false };
      }

      const now = Number(observation.at || Date.now());
      const account = state.accounts[handle] || {
        handle,
        posts: [],
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

      return { handle, wasNew: !alreadyRecorded };
    }, { deferPersist: true });
  }

  function clearHistory() {
    return enqueueWrite((state) => {
      state.accounts = {};
      state.salt = randomSalt();
      return true;
    });
  }

  // Maps a stored finding family to the verdict type the user can switch on or off.
  function verdictOf(family) {
    if (family === "jev-scam") return "scam";
    if (family === "jev-bot") return "bot";
    if (family === "jev-clickbait") return "clickbait";
    return "slop";
  }

  async function getDashboard(now = Date.now()) {
    const state = await init();
    const accounts = Object.values(state.accounts);
    const since = now - ONE_DAY_MS;
    const recentPosts = accounts.flatMap((account) => account.posts || [])
      .filter((post) => Number(post.at || 0) >= since);
    const byVerdict = { slop: 0, clickbait: 0, bot: 0, scam: 0 };
    recentPosts.filter((post) => post.flagged === true).forEach((post) => {
      byVerdict[verdictOf((post.families || [])[0])] += 1;
    });
    return {
      recent: {
        checked: recentPosts.length,
        flagged: recentPosts.filter((post) => post.flagged === true).length,
        byVerdict
      },
      observedAccounts: accounts.length,
      observedPosts: accounts.reduce((total, account) => total + (account.posts?.length || 0), 0),
      flaggedPosts: accounts.reduce(
        (total, account) =>
          total + (account.posts || []).filter((post) => post.flagged === true).length,
        0
      )
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
    VERDICTS,
    clearHistory,
    fingerprintPost,
    getDashboard,
    getDiagnostics,
    getSettings,
    init,
    normalizeHandle,
    onStateChanged,
    recordObservation,
    reportDiagnostics,
    updateSettings
  };
});
