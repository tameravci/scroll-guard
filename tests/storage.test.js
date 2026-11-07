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
  assert.deepEqual({ ...DEFAULT_SETTINGS.verdicts }, { slop: true, clickbait: true, bot: true, shill: true, scam: true });
  await updateSettings({ enabled: true, verdicts: { slop: false, clickbait: true, bot: false, shill: false, scam: false } });
  assert.deepEqual((await getSettings()).verdicts, { slop: false, clickbait: true, bot: false, shill: false, scam: false });
  assert.equal((await getSettings()).enabled, true);
  const off = await updateSettings({ verdicts: { slop: false, clickbait: false, bot: false, shill: false, scam: false } });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.verdicts, { slop: false, clickbait: false, bot: false, shill: false, scam: false });
  const on = await updateSettings({ enabled: true });
  assert.equal(on.enabled, true);
  assert.deepEqual(on.verdicts, { slop: true, clickbait: true, bot: true, shill: true, scam: true });
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
  assert.deepEqual(recent.byVerdict, { slop: 1, clickbait: 1, bot: 0, shill: 0, scam: 0 });
});

test("repeat fingerprints ignore case, links, mentions, and punctuation, and skip short text", async () => {
  const { repeatFingerprint } = require("../src/storage.js");
  const text = "zerufinance turning existing onchain trading history into a starting Zaps balance is a pretty interesting concept.";
  const same = await repeatFingerprint(`@zerufinance ${text.toUpperCase()} https://t.co/abc123`);
  assert.equal(await repeatFingerprint(text), same);
  assert.notEqual(await repeatFingerprint(`${text} Not quite the same.`), same);
  assert.equal(await repeatFingerprint("Good morning everyone, happy weekend"), null);
});

test("repeats count other posts from the same account and other accounts that used the text", async () => {
  const { findRepeats, repeatFingerprint } = require("../src/storage.js");
  await clearHistory();
  const textHash = await repeatFingerprint("This approach to funding agents shows great potential for success in the market");
  const now = Date.now();
  await recordObservation({ handle: "Farmer", fingerprint: "f1", textHash, flagged: false, families: [], at: now });
  // The same post seen again is not a repeat.
  assert.deepEqual(await findRepeats({ handle: "farmer", fingerprint: "f1", textHash }), { sameAccount: 0, otherAccounts: 0 });
  assert.deepEqual(await findRepeats({ handle: "farmer", fingerprint: "f2", textHash }), { sameAccount: 1, otherAccounts: 0 });
  await recordObservation({ handle: "other_a", fingerprint: "a1", textHash, flagged: false, families: [], at: now });
  await recordObservation({ handle: "other_b", fingerprint: "b1", textHash, flagged: false, families: [], at: now });
  assert.deepEqual(await findRepeats({ handle: "new_one", fingerprint: "n1", textHash }), { sameAccount: 0, otherAccounts: 3 });
  assert.deepEqual(await findRepeats({ handle: "new_one", fingerprint: "n1", textHash: null }), { sameAccount: 0, otherAccounts: 0 });
});

test("local repeat flags count as bot spam and shill flags count separately", async () => {
  await clearHistory();
  const now = Date.now();
  await recordObservation({ handle: "r", fingerprint: "r1", flagged: true, families: ["local-repeat"], at: now });
  await recordObservation({ handle: "s", fingerprint: "s1", flagged: true, families: ["jev-shill"], at: now });
  const { recent } = await getDashboard(now);
  assert.equal(recent.byVerdict.bot, 1);
  assert.equal(recent.byVerdict.shill, 1);
});

test("strictness takes a preset or an exact threshold from 20 to 99 percent", async () => {
  const { updateSettings, getSettings } = require("../src/storage.js");
  assert.equal((await updateSettings({ sensitivity: 82 })).sensitivity, 82);
  for (const bad of [19, 100, 82.5, "82", "loose"]) {
    assert.equal((await updateSettings({ sensitivity: bad })).sensitivity, 82, String(bad));
  }
  assert.equal((await updateSettings({ sensitivity: "sensitive" })).sensitivity, "sensitive");
  assert.equal((await getSettings()).sensitivity, "sensitive");
});
