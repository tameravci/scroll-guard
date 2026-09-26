const { test } = require("node:test");
const assert = require("node:assert/strict");
const jev = require("../src/jev.js");
function response(probability = 0.8) {
  return { model: "jev-test", answers: {
    slop: { type: "choice", choice: "slop", confidence: 0.7, probabilities: { slop: probability, scam: 0, bot: 0, clickbait: 0, not_slop: 1 - probability, uncertain: 0 } },
    category: { type: "choice", choice: "generic", confidence: 1, probabilities: { generic: 1, hype: 0, formulaic: 0, scam: 0, bot: 0, clickbait: 0, none: 0 } }
  } };
}
test("Jev probability thresholds differ from model confidence", () => {
  assert.equal(jev.interpret(response(), "balanced").isSlop, true);
  assert.equal(jev.interpret(response(), "conservative").isSlop, false);
  assert.equal(jev.interpret(response(0.65), "sensitive").isSlop, true);
});
test("every flagged slop or scam post can be blocked, and only at the chosen sensitivity", () => {
  for (const verdict of ["slop", "scam", "bot", "clickbait"]) {
    const data = response(0.6);
    data.answers.slop.choice = verdict;
    data.answers.slop.probabilities = { slop: 0, scam: 0, bot: 0, clickbait: 0, not_slop: 0.4, uncertain: 0, [verdict]: 0.6 };
    const sensitive = jev.interpret(data, "sensitive");
    assert.equal(sensitive.isFlagged, true);
    assert.equal(sensitive.canBlock, true);
    const balanced = jev.interpret(data, "balanced");
    assert.equal(balanced.isFlagged, false);
    assert.equal(balanced.canBlock, false);
  }
  assert.equal(jev.interpret(response(0.85), "conservative").isFlagged, false);
  const clean = response(0);
  clean.answers.slop.choice = "not_slop";
  assert.equal(jev.interpret(clean).canBlock, false);
  clean.answers.slop.choice = "uncertain";
  clean.answers.slop.probabilities = { slop: 0, scam: 0, bot: 0, clickbait: 0, not_slop: 0, uncertain: 1 };
  assert.equal(jev.interpret(clean).canBlock, false);
});
test("bot spam flags use the bot probability, rank below scam, and keep a distinct label", () => {
  const data = response();
  data.answers.slop.choice = "bot";
  data.answers.slop.probabilities = { slop: 0.1, scam: 0, bot: 0.8, clickbait: 0, not_slop: 0.1, uncertain: 0 };
  const result = jev.interpret(data);
  assert.equal(result.isBot, true);
  assert.equal(result.isSlop, false);
  assert.equal(result.isScam, false);
  assert.equal(result.canBlock, true);
  assert.deepEqual(result.families, ["jev-bot"]);
  assert.match(result.evidence[0].fix, /automated or mass-posted spam/);
  const body = jev.requestFor("post");
  assert.ok("bot" in body.questions.slop.criteria);
  assert.ok("bot" in body.questions.category.criteria);
  assert.match(body.questions.slop.criteria.scam, /priority over bot, clickbait, and slop/);
  delete data.answers.slop.probabilities.bot;
  assert.throws(() => jev.interpret(data));
});
test("clickbait flags carry their own label, can be turned off, and news is excluded from slop", () => {
  const data = response();
  data.answers.slop.choice = "clickbait";
  data.answers.slop.probabilities = { slop: 0.05, scam: 0, bot: 0, clickbait: 0.9, not_slop: 0.05, uncertain: 0 };
  const result = jev.interpret(data);
  assert.equal(result.isClickbait, true);
  assert.equal(result.isSlop, false);
  assert.equal(result.canBlock, true);
  assert.deepEqual(result.families, ["jev-clickbait"]);
  const off = jev.interpret(data, "balanced", { flagClickbait: false });
  assert.equal(off.isFlagged, false);
  assert.equal(off.canBlock, false);
  const body = jev.requestFor("post");
  assert.ok("clickbait" in body.questions.slop.criteria);
  assert.ok("clickbait" in body.questions.category.criteria);
  assert.match(body.questions.slop.criteria.slop, /excludes news headlines/);
  assert.match(body.questions.slop.instructions, /News headlines and news reports are never slop/);
  delete data.answers.slop.probabilities.clickbait;
  assert.throws(() => jev.interpret(data));
});
test("uncertainty and invalid responses never become slop", () => {
  const data = response(0.1);
  data.answers.slop.choice = "uncertain";
  data.answers.slop.probabilities = { slop: 0.1, scam: 0, bot: 0, clickbait: 0, not_slop: 0.1, uncertain: 0.8 };
  assert.equal(jev.interpret(data).isSlop, false);
  assert.throws(() => jev.interpret({}));
  data.answers.slop.probabilities.slop = NaN;
  assert.throws(() => jev.interpret(data));
});
test("scam flags use the scam probability and retain a distinct label", () => {
  const data = response();
  data.answers.slop.choice = "scam";
  data.answers.slop.probabilities = { slop: 0.05, scam: 0.8, bot: 0, clickbait: 0, not_slop: 0.1, uncertain: 0.05 };
  const result = jev.interpret(data);
  assert.equal(result.isFlagged, true);
  assert.equal(result.isScam, true);
  assert.equal(result.isSlop, false);
  assert.equal(result.probability, 0.8);
  assert.deepEqual(result.families, ["jev-scam"]);
  assert.equal(jev.interpret(data, "conservative").isFlagged, false);
  delete data.answers.slop.probabilities.scam;
  assert.throws(() => jev.interpret(data));
});
test("calls only official endpoint with bearer auth and post state", async () => {
  const result = await jev.evaluate("A concrete post.", "test-key", async (url, options) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(options.headers.Authorization, "Bearer test-key");
    assert.equal(options.redirect, "error");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.state, { post: "A concrete post." });
    assert.equal(body.model, "jev-latest");
    return { ok: true, json: async () => response() };
  });
  assert.equal(jev.interpret(result).isSlop, true);
});
test("missing key, HTTP failure, and oversized posts reject without fallback", async () => {
  await assert.rejects(jev.evaluate("post", ""), /API key/);
  await assert.rejects(jev.evaluate("post", "key", async () => ({ ok: false, status: 429 })), /429/);
  assert.throws(() => jev.requestFor("x".repeat(20001)));
});

const vm = require("node:vm");
const fs = require("node:fs");
function worker(evaluate) {
  let listener;
  const state = { enabled: true, key: "test-key" };
  const context = {
    importScripts() {}, TextEncoder, crypto: require("node:crypto").webcrypto,
    JevDetector: { ...jev, evaluate },
    JevKeyStore: { get: async () => state.key },
    chrome: {
      runtime: { id: "extension", onMessage: { addListener(fn) { listener = fn; } } },
      storage: {
        local: { get: async () => ({ slopSpotterStateV1: { settings: { enabled: state.enabled } } }) },
        onChanged: { addListener() {} }
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/background.js"), "utf8"), context);
  return {
    state,
    send(text, sensitivity = "balanced") {
      return new Promise((resolve) => listener({ type: "jev-evaluate", text, sensitivity }, { id: "extension", url: "https://x.com/home" }, resolve));
    },
    listener
  };
}
test("background serializes duplicate requests and reuses verdict across sensitivity changes", async () => {
  let calls = 0;
  const bg = worker(async () => { calls += 1; return response(); });
  const results = await Promise.all([bg.send("same post"), bg.send("same post", "conservative")]);
  assert.equal(calls, 1);
  assert.equal(results[0].detection.isSlop, true);
  assert.equal(results[1].detection.isSlop, false);
});
test("background rejects missing key, disabled detection and API failure without clean verdict", async () => {
  let calls = 0;
  const bg = worker(async () => { calls += 1; throw new Error("private provider details"); });
  bg.state.key = "";
  assert.ok((await bg.send("one")).error);
  assert.equal(calls, 0);
  bg.state.key = "key";
  bg.state.enabled = false;
  assert.ok((await bg.send("two")).error);
  assert.equal(calls, 0);
  bg.state.enabled = true;
  const failed = await bg.send("three");
  assert.ok(failed.error);
  assert.equal(failed.detection, undefined);
  assert.equal(failed.error.includes("private provider details"), false);
  await bg.send("four");
  assert.equal(calls, 1);
});
test("background ignores messages from other origins", () => {
  const bg = worker(async () => { throw new Error("must not call"); });
  let replied = false;
  const result = bg.listener({ type: "jev-evaluate", text: "post" }, { id: "extension", url: "https://evil.example/" }, () => { replied = true; });
  assert.equal(result, undefined);
  assert.equal(replied, false);
});
