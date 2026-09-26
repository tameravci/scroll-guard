"use strict";
importScripts("jev.js", "key-store.js");
// The key lives in the extension origin's IndexedDB, which content scripts cannot open.
// The credential never enters content scripts or the public observation store.
const cache = new Map();
let queue = Promise.resolve();
let cooldownUntil = 0;
let pending = 0;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type !== "jev-evaluate") return;
  if (!/^https:\/\/(?:x|twitter)\.com\//u.test(sender.url || "")) return;
  if (typeof message.text !== "string" || !message.text.trim() || message.text.length > 20000) {
    respond({ error: "Post must contain 1–20,000 characters." }); return;
  }
  if (pending >= 100) { respond({ error: "Jev queue is full. Reload after it finishes." }); return; }
  pending += 1;
  const task = queue.then(async () => {
    const stored = await chrome.storage.local.get("slopSpotterStateV1");
    if (stored.slopSpotterStateV1?.settings?.enabled === false) throw new Error("Detection is disabled.");
    const jevApiKey = await JevKeyStore.get();
    if (!jevApiKey) throw new Error("Add your TypeSafe API key in extension settings, then reload X.");
    if (Date.now() < cooldownUntil) throw new Error("Jev is temporarily unavailable. Try reloading X in a minute.");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message.text));
    const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    let result = cache.get(id);
    if (!result) {
      try { result = await JevDetector.evaluate(message.text, jevApiKey); }
      catch (error) { cooldownUntil = Date.now() + 60000; throw error; }
      cache.set(id, result);
      if (cache.size > 500) cache.delete(cache.keys().next().value);
    }
    return JevDetector.interpret(result, message.sensitivity, { flagClickbait: message.flagClickbait !== false });
  });
  queue = task.catch(() => undefined);
  task.then((detection) => respond({ detection }), () => respond({ error: "Jev could not analyze this post. Check the API key in settings, then reload X in a minute." })).finally(() => { pending -= 1; });
  return true;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.jevApiKeyChangedAt) { cache.clear(); cooldownUntil = 0; }
});
