"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  clearHistory,
  getDashboard,
  getDiagnostics,
  recordObservation,
  normalizeHandle,
  reportDiagnostics
} = require("../src/storage.js");

test("defaults no longer include the removed block-suggestion settings", () => {
  assert.equal("showBlockSuggestions" in DEFAULT_SETTINGS, false);
});

test("turning off every verdict type pauses the extension, and switching on restores them", async () => {
  const { updateSettings, getSettings } = require("../src/storage.js");
  assert.deepEqual({ ...DEFAULT_SETTINGS.verdicts }, { slop: true, clickbait: true, bot: true, scam: true });
  await updateSettings({ enabled: true, verdicts: { slop: false, clickbait: true, bot: false, scam: false } });
  assert.deepEqual((await getSettings()).verdicts, { slop: false, clickbait: true, bot: false, scam: false });
  assert.equal((await getSettings()).enabled, true);
  const off = await updateSettings({ verdicts: { slop: false, clickbait: false, bot: false, scam: false } });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.verdicts, { slop: false, clickbait: false, bot: false, scam: false });
  const on = await updateSettings({ enabled: true });
  assert.equal(on.enabled, true);
  assert.deepEqual(on.verdicts, { slop: true, clickbait: true, bot: true, scam: true });
  assert.equal("flagClickbait" in on, false);
});

test("normalizes handles without accepting display decoration", () => {
  assert.equal(normalizeHandle("@Example_User"), "example_user");
});

test("uses balanced detection as the recommended default", () => {
  assert.equal(DEFAULT_SETTINGS.sensitivity, "balanced");
});

test("records concurrent feed observations immediately and deduplicates posts", async () => {
  await clearHistory();
  await Promise.all([
    recordObservation({
      handle: "FastFeed",
      fingerprint: "one",
      flagged: true,
      families: ["faux-insight"]
    }),
    recordObservation({
      handle: "FastFeed",
      fingerprint: "two",
      flagged: true,
      families: ["importance-puffery"]
    }),
    recordObservation({
      handle: "FastFeed",
      fingerprint: "three",
      flagged: true,
      families: ["negative-listing"]
    }),
    recordObservation({
      handle: "FastFeed",
      fingerprint: "four",
      flagged: false,
      families: []
    }),
    recordObservation({
      handle: "FastFeed",
      fingerprint: "five",
      flagged: false,
      families: []
    })
  ]);
  await recordObservation({
    handle: "FastFeed",
    fingerprint: "five",
    flagged: false,
    families: []
  });

  const dashboard = await getDashboard();
  assert.equal(dashboard.observedPosts, 5);
  assert.equal(dashboard.flaggedPosts, 3);
});

test("publishes aggregate scanner diagnostics without post text", async () => {
  await reportDiagnostics({
    lastScanAt: 123,
    origin: "https://x.com",
    articleCount: 8,
    parsedCount: 7,
    evidenceCount: 3,
    highlightedCount: 2,
    errorCount: 0,
    lastError: ""
  });
  const diagnostics = await getDiagnostics();
  assert.equal(diagnostics.articleCount, 8);
  assert.equal(diagnostics.highlightedCount, 2);
  assert.equal("postText" in diagnostics, false);
});

test("the dashboard counts the last 24 hours by verdict type", async () => {
  await clearHistory();
  const now = Date.now();
  await recordObservation({ handle: "a", fingerprint: "old", flagged: true, families: ["jev-scam"], at: now - 2 * 86400000 });
  await recordObservation({ handle: "a", fingerprint: "s1", flagged: true, families: ["jev-contrast"], at: now - 1000 });
  await recordObservation({ handle: "b", fingerprint: "c1", flagged: true, families: ["jev-clickbait"], at: now - 1000 });
  await recordObservation({ handle: "b", fingerprint: "ok", flagged: false, families: [], at: now - 1000 });
  const { recent } = await getDashboard(now);
  assert.equal(recent.checked, 3);
  assert.equal(recent.flagged, 2);
  assert.deepEqual(recent.byVerdict, { slop: 1, clickbait: 1, bot: 0, scam: 0 });
});
