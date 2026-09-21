"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  clearHistory,
  evaluateAccount,
  getDashboard,
  getDiagnostics,
  recordObservation,
  normalizeHandle,
  reportDiagnostics
} = require("../src/storage.js");

function accountWithPosts(posts, extra) {
  return { posts, neverSuggest: false, snoozedUntil: 0, ...(extra || {}) };
}

test("requires five observations, three flags, and two pattern families", () => {
  const qualifying = accountWithPosts([
    { flagged: true, families: ["faux-insight"] },
    { flagged: true, families: ["faux-insight", "binary-contrast"] },
    { flagged: true, families: ["importance-puffery"] },
    { flagged: false, families: [] },
    { flagged: false, families: [] }
  ]);
  assert.equal(evaluateAccount(qualifying, DEFAULT_SETTINGS, 100).shouldSuggest, true);

  const tooFewObserved = accountWithPosts(qualifying.posts.slice(0, 4));
  assert.equal(evaluateAccount(tooFewObserved, DEFAULT_SETTINGS, 100).shouldSuggest, false);

  const oneFamily = accountWithPosts([
    { flagged: true, families: ["faux-insight"] },
    { flagged: true, families: ["faux-insight"] },
    { flagged: true, families: ["faux-insight"] },
    { flagged: false, families: [] },
    { flagged: false, families: [] }
  ]);
  assert.equal(evaluateAccount(oneFamily, DEFAULT_SETTINGS, 100).shouldSuggest, false);
});

test("never-suggest and snooze both suppress a qualifying suggestion", () => {
  const posts = [
    { flagged: true, families: ["a"] },
    { flagged: true, families: ["b"] },
    { flagged: true, families: ["a"] },
    { flagged: false, families: [] },
    { flagged: false, families: [] }
  ];

  assert.equal(
    evaluateAccount(accountWithPosts(posts, { neverSuggest: true }), DEFAULT_SETTINGS, 100)
      .shouldSuggest,
    false
  );
  assert.equal(
    evaluateAccount(accountWithPosts(posts, { snoozedUntil: 101 }), DEFAULT_SETTINGS, 100)
      .shouldSuggest,
    false
  );
});

test("disabled block suggestions suppress the prompt", () => {
  const posts = [
    { flagged: true, families: ["a"] },
    { flagged: true, families: ["b"] },
    { flagged: true, families: ["a"] },
    { flagged: false, families: [] },
    { flagged: false, families: [] }
  ];
  const settings = { ...DEFAULT_SETTINGS, showBlockSuggestions: false };
  assert.equal(evaluateAccount(accountWithPosts(posts), settings).shouldSuggest, false);
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
