const { test } = require("node:test");
const assert = require("node:assert/strict");
const jev = require("../src/jev.js");
function response(probability = 0.8) {
  return { model: "jev-test", answers: {
    slop: { type: "choice", choice: "slop", confidence: 0.7, probabilities: { slop: probability, scam: 0, bot: 0, shill: 0, clickbait: 0, not_slop: 1 - probability, uncertain: 0 } },
    category: { type: "choice", choice: "contrast", confidence: 1, probabilities: { contrast: 1, setup: 0, colon_reveal: 0, puffery: 0, buzzwords: 0, cadence: 0, formatting: 0, scam: 0, clickbait: 0, bot: 0, shill: 0, none: 0 } }
  } };
}
test("Jev probability thresholds differ from model confidence", () => {
  assert.equal(jev.interpret(response(), "balanced").isSlop, true);
  assert.equal(jev.interpret(response(), "conservative").isSlop, false);
  assert.equal(jev.interpret(response(0.65), "sensitive").isSlop, true);
});
test("every flagged slop or scam post can be blocked, and only at the chosen sensitivity", () => {
  for (const verdict of ["slop", "scam", "bot", "shill", "clickbait"]) {
    const data = response(0.6);
    data.answers.slop.choice = verdict;
    data.answers.slop.probabilities = { slop: 0, scam: 0, bot: 0, shill: 0, clickbait: 0, not_slop: 0.4, uncertain: 0, [verdict]: 0.6 };
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
  clean.answers.slop.probabilities = { slop: 0, scam: 0, bot: 0, shill: 0, clickbait: 0, not_slop: 0, uncertain: 1 };
  assert.equal(jev.interpret(clean).canBlock, false);
});
test("bot spam flags use the bot probability, rank below scam, and keep a distinct label", () => {
  const data = response();
  data.answers.slop.choice = "bot";
  data.answers.slop.probabilities = { slop: 0.1, scam: 0, bot: 0.8, shill: 0, clickbait: 0, not_slop: 0.1, uncertain: 0 };
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
  assert.match(body.questions.slop.criteria.scam, /priority over bot, shill, clickbait, and slop/);
  delete data.answers.slop.probabilities.bot;
  assert.throws(() => jev.interpret(data));
});
test("clickbait flags carry their own label, can be turned off, and news is excluded from slop", () => {
  const data = response();
  data.answers.slop.choice = "clickbait";
  data.answers.slop.probabilities = { slop: 0.05, scam: 0, bot: 0, shill: 0, clickbait: 0.9, not_slop: 0.05, uncertain: 0 };
  const result = jev.interpret(data);
  assert.equal(result.isClickbait, true);
  assert.equal(result.isSlop, false);
  assert.equal(result.canBlock, true);
  assert.deepEqual(result.families, ["jev-clickbait"]);
  const off = jev.interpret(data, "balanced", { verdicts: { slop: true, clickbait: false, bot: true, scam: true } });
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
test("each verdict can be turned off on its own", () => {
  for (const verdict of ["slop", "scam", "bot", "shill", "clickbait"]) {
    const data = response(0.95);
    data.answers.slop.choice = verdict;
    data.answers.slop.probabilities = { slop: 0, scam: 0, bot: 0, shill: 0, clickbait: 0, not_slop: 0.05, uncertain: 0, [verdict]: 0.95 };
    assert.equal(jev.interpret(data, "balanced", { verdicts: { [verdict]: false } }).isFlagged, false);
    assert.equal(jev.interpret(data, "balanced", { verdicts: { [verdict]: true } }).isFlagged, true);
    assert.equal(jev.interpret(data, "balanced").isFlagged, true);
  }
});
test("slop means AI-written text and names the strongest pattern as evidence", () => {
  const result = jev.interpret(response(0.9));
  assert.equal(result.isSlop, true);
  assert.equal(result.evidence[0].name, "Strongest AI-writing pattern");
  assert.match(result.evidence[0].fix, /Binary contrast/);
  assert.match(result.evidence[0].excerpt, /reads as AI-written/);
  const body = jev.requestFor("post");
  assert.match(body.questions.slop.instructions, /reads as generated by an AI model/);
  assert.match(body.questions.slop.instructions, /One weak signal is not enough/);
  assert.deepEqual(Object.keys(body.questions.category.criteria),
    ["contrast", "setup", "colon_reveal", "puffery", "buzzwords", "cadence", "formatting", "scam", "clickbait", "bot", "shill", "none"]);
});
test("shill flags undisclosed promotion, ranks below bot, and can be turned off", () => {
  const data = response();
  data.answers.slop.choice = "shill";
  data.answers.slop.probabilities = { slop: 0.1, scam: 0, bot: 0, shill: 0.85, clickbait: 0, not_slop: 0.05, uncertain: 0 };
  const result = jev.interpret(data);
  assert.equal(result.isShill, true);
  assert.equal(result.isSlop, false);
  assert.equal(result.canBlock, true);
  assert.deepEqual(result.families, ["jev-shill"]);
  assert.match(result.evidence[0].fix, /paid or incentivized promotion/);
  assert.equal(jev.interpret(data, "balanced", { verdicts: { shill: false } }).isFlagged, false);
  const body = jev.requestFor("post");
  assert.match(body.questions.slop.criteria.bot, /priority over shill, clickbait, and slop/);
  assert.match(body.questions.slop.criteria.shill, /priority over clickbait and slop/);
  assert.match(body.questions.slop.instructions, /Reply farming is bot spam/);
});
test("a slop verdict whose category is another verdict type still counts as slop", () => {
  for (const category of ["shill", "bot", "scam", "clickbait", "none"]) {
    const data = response(0.9);
    data.answers.category.choice = category;
    data.answers.category.probabilities = Object.fromEntries(Object.keys(data.answers.category.probabilities).map((key) => [key, key === category ? 1 : 0]));
    assert.deepEqual(jev.interpret(data).families, ["jev-slop"], category);
  }
});
test("an exact threshold in percent works like a preset", () => {
  assert.equal(jev.interpret(response(0.82), 82).isSlop, true);
  assert.equal(jev.interpret(response(0.81), 82).isSlop, false);
  assert.equal(jev.interpret(response(0.3), 25).isSlop, true);
  // Out of range falls back to Balanced (75%).
  assert.equal(jev.interpret(response(0.7), 5).isSlop, false);
});
test("the parent post goes to Jev as reply context", () => {
  const state = jev.requestFor({ text: "Great point!", parent: "Our protocol launches today." }).state;
  assert.deepEqual(state, { post: "Great point!", parent_post: "Our protocol launches today." });
  assert.throws(() => jev.requestFor({ text: "post", parent: "x".repeat(20001) }));
});
test("uncertainty and invalid responses never become slop", () => {
  const data = response(0.1);
  data.answers.slop.choice = "uncertain";
  data.answers.slop.probabilities = { slop: 0.1, scam: 0, bot: 0, shill: 0, clickbait: 0, not_slop: 0.1, uncertain: 0.8 };
  assert.equal(jev.interpret(data).isSlop, false);
  assert.throws(() => jev.interpret({}));
  data.answers.slop.probabilities.slop = NaN;
  assert.throws(() => jev.interpret(data));
});
test("scam flags use the scam probability and retain a distinct label", () => {
  const data = response();
  data.answers.slop.choice = "scam";
  data.answers.slop.probabilities = { slop: 0.05, scam: 0.8, bot: 0, shill: 0, clickbait: 0, not_slop: 0.1, uncertain: 0.05 };
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
test("a quoted post and photo descriptions go to Jev as separate context fields", () => {
  const state = jev.requestFor({ text: "My take 🍿", quote: "Their post", images: ["A crowded room"] }).state;
  assert.deepEqual(state, { post: "My take 🍿", quoted_post: "Their post", image_descriptions: ["A crowded room"] });
  assert.deepEqual(jev.requestFor({ text: "Only text", quote: "  ", images: [] }).state, { post: "Only text" });
  assert.match(jev.requestFor("post").questions.slop.instructions, /quoted_post.*never judge its writing/);
  assert.throws(() => jev.requestFor({ text: "post", quote: "x".repeat(20001) }));
  assert.throws(() => jev.requestFor({ text: "post", images: ["a", "b", "c", "d", "e"] }));
  assert.throws(() => jev.requestFor({ text: "post", images: ["x".repeat(1001)] }));
  assert.throws(() => jev.requestFor({ text: "", quote: "Their post" }));
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
      runtime: {
        id: "extension",
        onMessage: { addListener(fn) { listener = fn; } },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} }
      },
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
test("background sends the quote and photo descriptions, and they are part of the cache key", async () => {
  const seen = [];
  const bg = worker(async (post) => { seen.push(post); return response(); });
  const send = (message) => new Promise((resolve) => bg.listener({ type: "jev-evaluate", ...message }, { id: "extension", url: "https://x.com/home" }, resolve));
  await send({ text: "same text", quote: "first quote", images: ["A crowded room"] });
  await send({ text: "same text", quote: "second quote" });
  assert.deepEqual(seen, [
    { text: "same text", quote: "first quote", images: ["A crowded room"] },
    { text: "same text", quote: "second quote" }
  ]);
  assert.ok((await send({ text: "post", images: "not a list" })).error);
  assert.equal(seen.length, 2);
});
test("background ignores messages from other origins", () => {
  const bg = worker(async () => { throw new Error("must not call"); });
  let replied = false;
  const result = bg.listener({ type: "jev-evaluate", text: "post" }, { id: "extension", url: "https://evil.example/" }, () => { replied = true; });
  assert.equal(result, undefined);
  assert.equal(replied, false);
});
test("background runs at most four requests at once and drops the oldest waiting post when backlogged", async () => {
  let running = 0;
  let peak = 0;
  const releases = [];
  const bg = worker(() => new Promise((resolve) => {
    running += 1;
    peak = Math.max(peak, running);
    releases.push(() => { running -= 1; resolve(response()); });
  }));
  const settled = [];
  const sends = Array.from({ length: 45 }, (_, index) =>
    bg.send(`post ${index}`).then((result) => { settled.push([index, result]); return result; }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(peak, 4);
  // 4 running + 40 waiting fit; the 45th arrival drops the oldest waiting post.
  assert.equal(settled.length, 1);
  const [droppedIndex, dropped] = settled[0];
  assert.equal(dropped.retryable, true);
  assert.equal(dropped.visible, false);
  while (releases.length) {
    releases.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const results = await Promise.all(sends);
  assert.equal(results.filter((result) => result.detection).length, 44);
  assert.equal(peak, 4);
  // A dropped post can be asked again; its old request does not block the new one.
  const again = bg.send(`post ${droppedIndex}`);
  while (!releases.length) await new Promise((resolve) => setTimeout(resolve, 0));
  releases.shift()();
  const againResult = await again;
  assert.ok(againResult.detection, JSON.stringify(againResult));
});
test("background pauses briefly on provider failures, but not on a rejected key or a malformed answer", async () => {
  let calls = 0;
  let mode = "429";
  const bg = worker(async () => {
    calls += 1;
    const error = new Error("provider");
    if (mode === "401") error.status = 401;
    else if (mode === "invalid") error.invalidResponse = true;
    else error.status = 429;
    throw error;
  });
  const limited = await bg.send("rate limited");
  assert.equal(limited.retryable, true);
  assert.equal(limited.visible, true);
  const paused = await bg.send("during pause");
  assert.equal(paused.retryable, true);
  assert.equal(calls, 1, "the pause must block further requests");

  const fresh = worker(async () => {
    calls += 1;
    const error = new Error("provider");
    if (mode === "401") error.status = 401; else error.invalidResponse = true;
    throw error;
  });
  calls = 0;
  mode = "401";
  const rejected = await fresh.send("bad key");
  assert.equal(rejected.retryable, false);
  assert.match(rejected.error, /rejected the API key/);
  mode = "invalid";
  const invalid = await fresh.send("malformed");
  assert.equal(invalid.retryable, false);
  await fresh.send("next");
  assert.equal(calls, 3, "neither a rejected key nor a malformed answer pauses requests");
});
