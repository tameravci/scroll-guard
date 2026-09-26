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

test("clickbait flags are on by default", () => {
  assert.equal(DEFAULT_SETTINGS.flagClickbait, true);
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
