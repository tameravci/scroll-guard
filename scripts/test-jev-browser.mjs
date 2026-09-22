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
let fail = false;
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: "chromium" }),
    args: [`--disable-extensions-except=${project}`, `--load-extension=${project}`]
  });
  await context.route("https://x.com/**", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
  if (!live) {
    await context.route("https://api.typesafe.ai/**", async (route) => {
      calls += 1;
      assert.equal(route.request().headers().authorization, `Bearer ${key}`);
      const request = route.request().postDataJSON();
      assert.deepEqual(Object.keys(request.state), ["post"]);
      if (fail) { await route.fulfill({ status: 429, body: "Test quota failure" }); return; }
      const slop = request.state.post === samples[1];
      const scam = request.state.post === samples[2];
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        model: "jev-browser-test",
        answers: {
          slop: { type: "choice", choice: scam ? "scam" : slop ? "slop" : "not_slop", confidence: 1, probabilities: { slop: +slop, scam: scam ? 0.81 : 0, not_slop: scam ? 0.19 : +!slop, uncertain: 0 } },
          category: { type: "choice", choice: scam ? "scam" : slop ? "hype" : "none", confidence: 1, probabilities: { generic: 0, hype: +slop, formulaic: 0, scam: +scam, none: +(!slop && !scam) } }
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
  await options.locator("#keyStatus").filter({ hasText: "Key saved" }).waitFor();
  assert.equal(await options.locator("#jevApiKey").inputValue(), "");
  if (!live) {
    await options.locator("#sensitivity").selectOption("conservative");
    await options.locator("#showBlockSuggestions").uncheck();
    await options.waitForFunction(async () => {
      const { slopSpotterStateV1: state } = await chrome.storage.local.get("slopSpotterStateV1");
      return state?.settings.sensitivity === "conservative" && state.settings.showBlockSuggestions === false;
    });
  }
  await feed.reload();
  await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 3, null, { timeout: 60000 });
  const diagnostics = await worker.evaluate(async () => (await chrome.storage.local.get("slopSpotterDiagnosticsV1")).slopSpotterDiagnosticsV1);
  assert.equal(await feed.locator("[data-slop-spotter-host]").count(), 2, JSON.stringify(diagnostics));
  assert.match(await feed.locator("article").nth(1).locator("[data-slop-spotter-host]").evaluate((host) => host.shadowRoot.textContent), /Likely slop/);
  assert.match(await feed.locator("article").nth(2).locator("[data-slop-spotter-host]").evaluate((host) => host.shadowRoot.textContent), /Possible scam/);
  for (const [index, verdict, color] of [[1, "slop", "245, 166, 35"], [2, "scam", "255, 82, 107"]]) {
    const card = feed.locator("article").nth(index);
    assert.equal(await card.getAttribute("data-slop-spotter-verdict"), verdict);
    const shadow = await card.evaluate((node) => getComputedStyle(node).boxShadow);
    assert.ok(shadow.includes(color) && shadow.includes("inset") && shadow.includes("3px"), shadow);
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
    assert.equal(await feed.locator("article").nth(1).evaluate((node) => node.classList.contains("slop-spotter-flagged")), false);
    await options.locator("#removeKey").click();
    await options.locator("#keyStatus").filter({ hasText: "No API key" }).waitFor();
    fail = true;
    await options.locator("#jevApiKey").fill(key);
    await options.locator("#saveKey").click();
    await options.locator("#keyStatus").filter({ hasText: "Key saved" }).waitFor();
    await feed.reload();
    await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 3);
    assert.equal(calls, 4, "Provider failure should activate cooldown");
    assert.equal(await feed.locator("[data-slop-spotter-host]").count(), 0);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.locator("#diagnostics").filter({ hasText: "Scanner error" }).waitFor();
  }
  console.log(`${live ? "LIVE" : "MOCK"} browser flow passed: key entry, worker requests, feed annotations, and private local storage${live ? "" : ", cache reuse and provider errors"}.`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
