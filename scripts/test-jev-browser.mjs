import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
  "Forgot my umbrella again. Now I'm waiting out the rain at the coffee shop."
];
const fixture = `<html><body>${samples.map((text, i) => `<article data-testid="tweet"><a href="/TestAccount/status/${100 + i}"><time>now</time></a><div data-testid="tweetText">${text}</div></article>`).join("")}</body></html>`;
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
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        model: "jev-browser-test",
        answers: {
          slop: { type: "choice", choice: slop ? "slop" : "not_slop", confidence: 1, probabilities: { slop: +slop, not_slop: +!slop, uncertain: 0 } },
          category: { type: "choice", choice: slop ? "hype" : "none", confidence: 1, probabilities: { generic: 0, hype: +slop, formulaic: 0, none: +!slop } }
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
  await feed.reload();
  await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-processed]").length === 3, null, { timeout: 60000 });
  const diagnostics = await worker.evaluate(async () => (await chrome.storage.local.get("slopSpotterDiagnosticsV1")).slopSpotterDiagnosticsV1);
  assert.equal(await feed.locator("[data-slop-spotter-host]").count(), 1, JSON.stringify(diagnostics));
  assert.match(await feed.locator("[data-slop-spotter-host]").evaluate((host) => host.shadowRoot.textContent), /Jev: likely slop/);
  assert.equal(await feed.locator("article").nth(1).locator("[data-slop-spotter-host]").count(), 1);
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
    await feed.waitForFunction(() => document.querySelectorAll("[data-slop-spotter-host]").length === 0 && document.querySelectorAll("[data-slop-spotter-processed]").length === 3);
    assert.equal(calls, 3, "Recycled cards must reclassify and reuse cached text decisions");
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
