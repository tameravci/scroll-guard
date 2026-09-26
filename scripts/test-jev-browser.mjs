import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Set PLAYWRIGHT_MODULE to an existing Playwright installation if it isn't local.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const live = process.env.JEV_BROWSER_LIVE === "1";
const key = live ? process.env.TYPESAFE_API_KEY : "browser-test-key";
assert.ok(key, "Live browser tests require TYPESAFE_API_KEY");
const project = resolve(new URL("..", import.meta.url).pathname);
const profile = await mkdtemp(join(tmpdir(), "jev-browser-"));
const samples = [
  "Fixed the CSV importer: quoted commas were splitting columns. Added a regression test with a three-column file; all 42 tests pass.",
  "The future isn't coming. It's here. Unlock your potential. Embrace innovation. Transform your journey. This changes everything. Let that sink in.",
  "Official crypto giveaway! Send 0.1 ETH to our wallet and receive 1 ETH instantly. Guaranteed return. DM your wallet recovery phrase to verify eligibility."
];
const fixture = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body { margin:0; background:#fff; color:#0f1419; font:15px/1.5 Arial,sans-serif; }
main { max-width:600px; margin:auto; border-inline:1px solid #ddd; }
h1 { font-size:20px; padding:16px; margin:0; border-bottom:1px solid #ddd; }
article { padding:16px 0 8px; border-bottom:1px solid #ddd; }
.author,.post,.actions { padding:0 18px; } .author { display:flex; gap:10px; align-items:center; margin-bottom:10px; }
.avatar { display:grid; place-items:center; width:38px; height:38px; border-radius:50%; background:#546579; color:white; font-weight:bold; }
a { color:inherit; text-decoration:none; } .meta,.actions { color:#687684; font-size:13px; }
.actions { display:flex; justify-content:space-between; margin-top:16px; }
@media(prefers-color-scheme:dark) { body { background:#000; color:#e7e9ea; } main,h1,article { border-color:#2f3336; } .meta,.actions { color:#8899a6; } }
</style></head><body><main><h1>For you</h1>${samples.map((text, i) => `<article data-testid="tweet"><div class="author"><span class="avatar">${["JL","TS","CG"][i]}</span><div><strong>${["Jamie Lee","Tomorrow Starts","Crypto Giveaway"][i]}</strong><br><a class="meta" href="/TestAccount/status/${100 + i}">@TestAccount · <time>2h</time></a></div></div><div class="post" data-testid="tweetText">${text}</div><div class="actions"><span>♡ 24</span><span>↻ 8</span><span>↗ Share</span><span>⋯</span></div></article>`).join("")}</main></body></html>`;
let calls = 0;
// Requests for the long-feed priority test, in the order the worker sent them.
const longRequests = [];
const longFixture = `<html><head><meta charset="utf-8"><style>
body { margin:0; font:15px/1.5 Arial,sans-serif; } main { max-width:600px; margin:auto; }
article { height:280px; border-bottom:1px solid #ddd; padding:16px; box-sizing:border-box; }
</style></head><body><main>${Array.from({ length: 30 }, (_, i) => `<article data-testid="tweet"><div data-testid="User-Name"><span>Feed ${i}</span><span>@Feed${i}</span></div><a href="/Feed${i}/status/${900 + i}"><time>1h</time></a><div data-testid="tweetText">Long feed post number ${i} about ordinary things.</div></article>`).join("")}</main></body></html>`;
let fail = false;
let context;
const launchOptions = {
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: "chromium" }),
  args: [`--disable-extensions-except=${project}`, `--load-extension=${project}`]
};
try {
  context = await chromium.launchPersistentContext(profile, launchOptions);
  await context.route("https://x.com/**", (route) => route.fulfill({ contentType: "text/html",
    body: new URL(route.request().url()).pathname === "/long" ? longFixture : fixture }));
  if (!live) {
    await context.route("https://api.typesafe.ai/**", async (route) => {
      const request = route.request().postDataJSON();
      const longMatch = /^Long feed post number (\d+)/u.exec(request.state.post);
      if (longMatch) longRequests.push(Number(longMatch[1]));
      else calls += 1;
      assert.equal(route.request().headers().authorization, `Bearer ${key}`);
      assert.deepEqual(Object.keys(request.state), ["post"]);
      if (fail) { await route.fulfill({ status: 429, body: "Test quota failure" }); return; }
      const slop = request.state.post === samples[1];
      const scam = request.state.post === samples[2];
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        model: "jev-browser-test",
        answers: {
          slop: { type: "choice", choice: scam ? "scam" : slop ? "slop" : "not_slop", confidence: 1, probabilities: { slop: +slop, scam: scam ? 0.93 : 0, bot: 0, clickbait: 0, not_slop: scam ? 0.07 : +!slop, uncertain: 0 } },
          category: { type: "choice", choice: scam ? "scam" : slop ? "cadence" : "none", confidence: 1, probabilities: { contrast: 0, setup: 0, colon_reveal: 0, puffery: 0, buzzwords: 0, cadence: +slop, formatting: 0, scam: +scam, clickbait: 0, bot: 0, none: +(!slop && !scam) } }
        }
      }) });
    });
  }
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await options.locator("#keyStatus").filter({ hasText: "No API key" }).waitFor();
  const feed = await context.newPage();
  await feed.goto("https://x.com/home");
  await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 3);
  assert.equal(await feed.locator("[data-slop-spotter-host]").count(), 0);
  assert.equal(calls, 0);
  await options.locator("#jevApiKey").fill(key);
  await options.locator("#saveKey").click();
  await options.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
  assert.equal(await options.locator("#jevApiKey").inputValue(), "");
  if (!live) {
    await options.locator(".segment", { hasText: "Fewer" }).click();
    await options.waitForFunction(async () => {
      const { slopSpotterStateV1: state } = await chrome.storage.local.get("slopSpotterStateV1");
      return state?.settings.sensitivity === "conservative";
    });
  }
  await feed.reload();
  await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 3, null, { timeout: 60000 });
  const diagnostics = await worker.evaluate(async () => (await chrome.storage.local.get("slopSpotterDiagnosticsV1")).slopSpotterDiagnosticsV1);
  // Model a feed card with intrinsic-size flex children, rather than only block layout.
  await feed.addStyleTag({ content: `
    article[data-testid="tweet"] { display:flex; flex-direction:column; align-items:flex-start; }
    article[data-testid="tweet"] > div { align-self:flex-start; }
  ` });
  for (const host of await feed.locator("[data-slop-spotter-host]").all()) {
    const bounds = await host.boundingBox();
    const textLeft = await host.evaluate((node) => {
      const text = node.closest("article").querySelector("[data-testid=tweetText]");
      return text.getBoundingClientRect().left + parseFloat(getComputedStyle(text).paddingLeft);
    });
    assert.ok(bounds && Math.abs(bounds.x - textLeft) < 1, `Card is not left-aligned with padded post text: ${bounds?.x} vs ${textLeft}`);
    assert.ok(bounds && bounds.width > 200 && bounds.height > 30,
      `Assessment card collapsed in flex layout: ${JSON.stringify(bounds)}`);
  }
  // X can lay a post out as a flex row. The card must not squeeze the post text.
  const rowFeed = await context.newPage();
  await rowFeed.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    // Match X: the article is a flex row. An inner row holds the avatar rail and
    // a column with the post body.
    const style = document.createElement("style");
    style.textContent = `article[data-testid="tweet"], .x-row { display:flex; flex-direction:row; }
      .x-row { flex:0 1 auto; } .x-rail { flex:none; width:48px; } .x-body { display:flex; flex-direction:column; flex:1 1 auto; min-width:0; }`;
    document.head.append(style);
    for (const article of document.querySelectorAll("article")) {
      const row = document.createElement("div");
      const rail = document.createElement("div");
      const body = document.createElement("div");
      row.className = "x-row";
      rail.className = "x-rail";
      body.className = "x-body";
      body.append(...article.children);
      row.append(rail, body);
      article.append(row);
    }
  }));
  await rowFeed.goto("https://x.com/home");
  await rowFeed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-host]").length === 2, null, { timeout: 60000 });
  for (const article of await rowFeed.locator("article:has([data-slop-spotter-host])").all()) {
    const text = await article.locator("[data-testid=tweetText]").boundingBox();
    const card = await article.locator("[data-slop-spotter-host]").boundingBox();
    assert.ok(text && text.width > 300, `Post text collapsed in row layout: ${JSON.stringify(text)}`);
    assert.ok(card && card.width > 200 && card.height > 30 && card.y >= text.y + text.height,
      `Assessment card is not below the post in row layout: ${JSON.stringify(card)}`);
    const textLeft = text.x + await article.locator("[data-testid=tweetText]").evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
    assert.ok(Math.abs(card.x - textLeft) < 1, `Card is not left-aligned with the post text: ${card.x} vs ${textLeft}`);
  }
  await rowFeed.close();
  if (!live) {
    // Only posts near the screen are requested, on-screen posts first in reading order,
    // and scrolling brings the next posts in.
    const longFeed = await context.newPage();
    await longFeed.setViewportSize({ width: 800, height: 700 });
    await longFeed.goto("https://x.com/long");
    await longFeed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length >= 5, null, { timeout: 30000 });
    await longFeed.waitForTimeout(1000);
    const first = [...longRequests];
    assert.ok(first.length >= 5 && first.length <= 8, `Expected only near-screen posts, got ${JSON.stringify(first)}`);
    assert.deepEqual(first.slice(0, 3), [0, 1, 2], `On-screen posts must go first: ${JSON.stringify(first)}`);
    assert.ok(Math.max(...first) < 8, `No far-off post may be requested: ${JSON.stringify(first)}`);
    for (let y = 700; y <= 7700; y += 700) {
      await longFeed.evaluate((top) => window.scrollTo(0, top), y);
      await longFeed.waitForTimeout(700);
    }
    await longFeed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 30, null, { timeout: 30000 });
    assert.equal(new Set(longRequests).size, 30);
    assert.equal(longRequests.length, 30, "No post may be requested twice");
    await longFeed.close();
  }
  assert.equal(await feed.locator("[data-slop-spotter-host]").count(), 2, JSON.stringify(diagnostics));
  assert.match(await feed.locator("article").nth(1).locator("[data-slop-spotter-host]").evaluate((host) => host.shadowRoot.textContent), /Likely AI slop/);
  assert.match(await feed.locator("article").nth(2).locator("[data-slop-spotter-host]").evaluate((host) => host.shadowRoot.textContent), /Possible scam/);
  for (const [index, verdict, color] of [[1, "slop", "245, 166, 35"], [2, "scam", "255, 82, 107"]]) {
    const card = feed.locator("article").nth(index);
    assert.equal(await card.getAttribute("data-slop-spotter-verdict"), verdict);
    // X paints hover backgrounds on the post's children. The frame must stay above them.
    await feed.addStyleTag({ content: "article:hover > div { background: rgb(22, 24, 28) !important; position: relative; }" });
    await card.hover();
    // X rewrites the article's class attribute on hover. The frame must survive it.
    await card.evaluate((node) => { node.className = "css-175oi2r r-hover"; });
    const frame = await card.evaluate((node) => {
      const style = getComputedStyle(node, "::after");
      return { shadow: style.boxShadow, z: style.zIndex, position: style.position };
    });
    assert.ok(frame.shadow.includes(color) && frame.shadow.includes("inset") && frame.shadow.includes("3px"), JSON.stringify(frame));
    assert.equal(frame.position, "absolute");
    assert.ok(Number(frame.z) >= 2, JSON.stringify(frame));
    const button = card.locator(".summary");
    await button.click();
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    await card.locator(".details").waitFor({ state: "visible" });
    await button.click();
  }
  if (process.env.BROWSER_SCREENSHOTS) {
    await mkdir(process.env.BROWSER_SCREENSHOTS, { recursive: true });
    for (const [name, width, scheme] of [["light", 900, "light"], ["dark", 900, "dark"], ["mobile", 390, "dark"]]) {
      await feed.setViewportSize({ width, height: 1000 });
      await feed.emulateMedia({ colorScheme: scheme });
      assert.equal(await feed.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await feed.screenshot({ path: join(process.env.BROWSER_SCREENSHOTS, `${name}.png`), fullPage: true });
    }
  }
  assert.equal(await feed.locator("article").nth(1).locator("[data-slop-spotter-host]").count(), 1);
  for (const index of [1, 2]) {
    const card = feed.locator("article").nth(index);
    await card.getByRole("button", { name: "Block @TestAccount", exact: true }).waitFor({ state: "visible" });
    assert.equal(await card.locator(".summary").getAttribute("aria-expanded"), "false");
  }
  if (!live) {
    const opened = context.waitForEvent("page");
    await feed.locator("article").nth(2).getByRole("button", { name: "Block @TestAccount", exact: true }).click();
    const handoff = await opened;
    await handoff.waitForURL("https://x.com/TestAccount#slop-spotter-block");
    await handoff.close();
  }
  const localData = await worker.evaluate(() => chrome.storage.local.get(null));
  assert.equal(JSON.stringify(localData).includes(key), false);
  assert.equal(JSON.stringify(localData).includes(samples[1]), false);
  const cdp = await context.newCDPSession(feed);
  const worlds = [];
  cdp.on("Runtime.executionContextCreated", ({ context: world }) => worlds.push(world));
  await cdp.send("Runtime.enable");
  const contentWorld = worlds.find((world) => world.origin === `chrome-extension://${extensionId}`);
  assert.ok(contentWorld, "The extension content script must run in an isolated world");
  const access = await cdp.send("Runtime.evaluate", {
    contextId: contentWorld.id,
    expression: "(async () => { try { if (!chrome.storage.session) return false; await chrome.storage.session.get('jevApiKey'); return true; } catch { return false; } })()",
    awaitPromise: true, returnByValue: true
  });
  assert.equal(access.result.value, false, "Content scripts must not access the API key store");
  const secrets = await cdp.send("Runtime.evaluate", {
    contextId: contentWorld.id,
    expression: "(async () => (await indexedDB.databases()).some((db) => db.name === 'slopSpotterSecrets'))()",
    awaitPromise: true, returnByValue: true
  });
  assert.equal(secrets.result.value, false, "Content scripts must not see the API key database");
  await cdp.detach();
  if (!live) {
    assert.equal(calls, 3);
    await feed.reload();
    await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 3);
    assert.equal(calls, 3, "Reload should reuse cached decisions");
    await feed.locator("article").nth(1).evaluate((article, text) => {
      article.querySelector("[data-testid=tweetText]").textContent = text;
      article.querySelector("a").href = "/TestAccount/status/200";
    }, samples[0]);
    await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-host]").length === 1 && document.querySelectorAll("[data-slop-spotter-processed]").length === 3);
    assert.equal(calls, 3, "Recycled cards must reclassify and reuse cached text decisions");
    assert.equal(await feed.locator("article").nth(1).evaluate((node) => node.hasAttribute("data-slop-spotter-verdict")), false);
    await options.locator("#removeKey").click();
    await options.locator("#keyStatus").filter({ hasText: "No API key" }).waitFor();
    fail = true;
    await options.locator("#jevApiKey").fill(key);
    await options.locator("#saveKey").click();
    await options.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
    await feed.reload();
    await feed.waitForTimeout(1500);
    // The three posts run in parallel, so each sends one request before the first 429 returns.
    assert.equal(calls, 6, `Each post should try once (calls: ${calls})`);
    // Retries come after 4 s, but the worker's pause blocks them without new requests.
    await feed.waitForTimeout(5000);
    assert.equal(calls, 6, `The pause must block retries (calls: ${calls})`);
    // Failed posts stay unchecked so they retry after the pause; they are not dropped.
    assert.equal(await feed.locator("[data-slop-spotter-processed]").count(), 0);
    assert.equal(await feed.locator("[data-slop-spotter-host]").count(), 0);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.locator("#diagnostics").filter({ hasText: "Scanner error" }).waitFor();
    // The key must survive a restart. Chrome clears session storage then, as it
    // does on an extension reload.
    await context.close();
    context = await chromium.launchPersistentContext(profile, launchOptions);
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/options/options.html`);
    await reopened.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
  }
  console.log(`${live ? "LIVE" : "MOCK"} browser flow passed: key entry, worker requests, feed annotations, and private local storage${live ? "" : ", cache reuse and provider errors"}.`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
