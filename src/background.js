"use strict";
importScripts("jev.js", "key-store.js");
// The key lives in the extension origin's IndexedDB, which content scripts cannot open.
// The credential never enters content scripts or the public observation store.
const cache = new Map();
const inFlight = new Map();
// A few requests run at once. When the backlog grows, the oldest waiting posts are
// dropped: during a fast scroll they are usually already off screen, and the page
// asks again when they come back into view.
const MAX_ACTIVE = 4;
const MAX_WAITING = 40;
const COOLDOWN_MS = 30000;
const waiting = [];
let active = 0;
let cooldownUntil = 0;

// Errors the page should retry later instead of showing as a failed post.
function retryLater(message, visible = false) {
  const error = new Error(message);
  error.retryable = true;
  error.visible = visible;
  return error;
}

function runNext() {
  while (active < MAX_ACTIVE && waiting.length) {
    const job = waiting.shift();
    active += 1;
    job.run().then(job.resolve, job.reject).finally(() => {
      active -= 1;
      runNext();
    });
  }
}

function schedule(run) {
  return new Promise((resolve, reject) => {
    if (waiting.length >= MAX_WAITING) waiting.shift().reject(retryLater("Jev is busy."));
    waiting.push({ run, resolve, reject });
    runNext();
  });
}

async function evaluateText(text, key) {
  if (Date.now() < cooldownUntil) throw retryLater("Jev is paused after a failed request.");
  try {
    return await JevDetector.evaluate(text, key);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      const rejected = new Error("Jev rejected the API key. Check it from the toolbar icon.");
      rejected.visible = true;
      throw rejected;
    }
    // One malformed answer affects only its post.
    if (error.invalidResponse) throw error;
    // Rate limits, server errors, timeouts and network failures pause requests briefly.
    cooldownUntil = Date.now() + COOLDOWN_MS;
    throw retryLater("Jev is unavailable. Retrying shortly.", true);
  }
}

async function decide(message) {
  const stored = await chrome.storage.local.get("slopSpotterStateV1");
  if (stored.slopSpotterStateV1?.settings?.enabled === false) throw new Error("Detection is disabled.");
  const jevApiKey = await JevKeyStore.get();
  if (!jevApiKey) {
    const missing = new Error("Add your Jev API key from the toolbar icon, then reload X.");
    missing.visible = true;
    throw missing;
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message.text));
  const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  let result = cache.get(id);
  if (!result) {
    // Identical posts share one request, whether it is running or waiting.
    // The entry clears when the request settles, including a dropped wait.
    if (!inFlight.has(id)) {
      const request = schedule(() => evaluateText(message.text, jevApiKey));
      const clear = () => { if (inFlight.get(id) === request) inFlight.delete(id); };
      request.then(clear, clear);
      inFlight.set(id, request);
    }
    result = await inFlight.get(id);
    cache.set(id, result);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  return JevDetector.interpret(result, message.sensitivity, { verdicts: message.verdicts });
}

// The setup page and the popup test a key here before they save it.
async function verifyKey(key) {
  if (typeof key !== "string" || !key.trim() || key.length > 500) return { valid: false, reachable: true };
  try {
    const { ok, status } = await JevDetector.verifyKey(key.trim());
    if (ok) return { valid: true, reachable: true };
    if (status === 401 || status === 403) return { valid: false, reachable: true };
    return { valid: false, reachable: false };
  } catch {
    return { valid: false, reachable: false };
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "jev-verify-key") {
    // Only the extension's own pages may test keys; content scripts never see one.
    if (!String(sender.url || "").startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
    verifyKey(message.key).then(respond);
    return true;
  }
  if (message?.type !== "jev-evaluate") return;
  if (!/^https:\/\/(?:x|twitter)\.com\//u.test(sender.url || "")) return;
  if (typeof message.text !== "string" || !message.text.trim() || message.text.length > 20000) {
    respond({ error: "Post must contain 1–20,000 characters." }); return;
  }
  decide(message).then(
    (detection) => respond({ detection }),
    (error) => respond({
      // Only messages written here reach the page; provider details stay in the worker.
      error: error.visible ? error.message : "Jev could not analyze this post.",
      retryable: error.retryable === true,
      visible: error.visible === true
    })
  );
  return true;
});
// Setup is not finished until a key exists: open setup on install and badge the icon.
async function refreshBadge() {
  const key = await JevKeyStore.get().catch(() => "");
  await chrome.action?.setBadgeText({ text: key ? "" : "!" });
  if (!key) await chrome.action?.setBadgeBackgroundColor({ color: "#f5a623" });
}
chrome.runtime.onInstalled.addListener(({ reason }) => {
  refreshBadge().catch(() => undefined);
  if (reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(() => { refreshBadge().catch(() => undefined); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.jevApiKeyChangedAt) {
    cache.clear(); inFlight.clear(); cooldownUntil = 0;
    refreshBadge().catch(() => undefined);
  }
});
