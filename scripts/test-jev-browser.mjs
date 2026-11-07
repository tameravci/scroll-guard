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
let keyChecks = 0;
// Requests for the long-feed priority test, in the order the worker sent them.
const longRequests = [];
const longFixture = `<html><head><meta charset="utf-8"><style>
body { margin:0; font:15px/1.5 Arial,sans-serif; } main { max-width:600px; margin:auto; }
article { height:280px; border-bottom:1px solid #ddd; padding:16px; box-sizing:border-box; }
</style></head><body><main>${Array.from({ length: 30 }, (_, i) => `<article data-testid="tweet"><div data-testid="User-Name"><span>Feed ${i}</span><span>@Feed${i}</span></div><a href="/Feed${i}/status/${900 + i}"><time>1h</time></a><div data-testid="tweetText">Long feed post number ${i} about ordinary things.</div></article>`).join("")}</main></body></html>`;
// X's real markup: emoji are images with the character as alt text, a quoted post is a
// role="link" card with its own author line, and a photo without a description gets
// the one-word alt "Image".
const pixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const quoteRequests = [];
const quoteFixture = `<html><head><meta charset="utf-8"></head><body><main>
<article data-testid="tweet"><div data-testid="User-Name"><span>Quote Test</span><span>@QuoteTest</span></div>
<a href="/QuoteTest/status/500"><time>1h</time></a>
<div data-testid="tweetText"><span>Quote check: movie night </span><img alt="🍿" src="${pixel}"><span> with the team</span></div>
<div data-testid="tweetPhoto"><img alt="A cinema hall full of people" src="${pixel}"></div>
<div data-testid="tweetPhoto"><img alt="Image" src="${pixel}"></div>
<div role="link"><div data-testid="User-Name"><span>Other</span><span>@Other</span></div><time>2h</time>
<div data-testid="tweetText">Original take <img alt="🎬" src="${pixel}"></div>
<div data-testid="tweetPhoto"><img alt="Poster for the new film" src="${pixel}"></div></div></article>
<article data-testid="tweet"><div data-testid="User-Name"><span>Repost Only</span><span>@RepostOnly</span></div>
<a href="/RepostOnly/status/501"><time>1h</time></a>
<div role="link"><div data-testid="User-Name"><span>Other</span><span>@Other</span></div><time>3h</time>
<div data-testid="tweetText">Quote check: text of the quoted post only</div></div></article>
</main></body></html>`;
// A thread as X draws it: the parent sits in the cell above the reply, cut short
// behind a "Show more" button that expands the text in place, and the reply links
// to the parent's author. Far below, one account posts the same text twice.
const threadRequests = [];
const parentShort = "Thread check: our protocol turns phones into data nodes.";
const parentFull = `${parentShort} Buyers fund requests, contributors capture footage, and escrow pays out on delivery.`;
const repeatText = "Thread check repeat: this approach to funding agents shows great potential for real success";
const cell = (inner) => `<div data-testid="cellInnerDiv">${inner}</div>`;
const threadFixture = `<html><head><meta charset="utf-8"></head><body><main>
${cell(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/ParentUser">Parent</a></div>
<a href="/ParentUser/status/600"><time>1h</time></a>
<div data-testid="tweetText">${parentShort}</div>
<button type="button" data-testid="tweet-text-show-more-link" onclick="this.previousElementSibling.textContent = ${JSON.stringify(parentFull).replace(/"/g, "&quot;")}; this.remove();">Show more</button></article>`)}
${cell(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/ReplyGuy">Reply Guy</a></div>
<a href="/ReplyGuy/status/601"><time>1h</time></a>
<div>Replying to <a href="/ParentUser">@ParentUser</a></div>
<div data-testid="tweetText">Thread check reply: love this</div></article>`)}
${cell(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/CopyPaste">Copy</a></div>
<a href="/CopyPaste/status/602"><time>1h</time></a><div data-testid="tweetText">${repeatText}</div></article>`)}
${cell(`<div style="height:3000px"></div>`)}
${cell(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/CopyPaste">Copy</a></div>
<a href="/CopyPaste/status/603"><time>1h</time></a><div data-testid="tweetText">${repeatText}</div></article>`)}
</main></body></html>`;
let fail = false;
let context;
// The test pages are tabs in one window, and Chrome draws no frames for a tab in
// the background. Each page comes to the front before the test uses it. A headless
// tab can still miss frames, so every wait checks on a timer, clicks skip
// Playwright's wait for a stable element, and each scroll sends its own scroll
// event, which Chrome otherwise sends only with a frame.
const launchOptions = {
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: "chromium" }),
  args: [`--disable-extensions-except=${project}`, `--load-extension=${project}`]
};
try {
  context = await chromium.launchPersistentContext(profile, launchOptions);
  await context.route("https://x.com/**", (route) => route.fulfill({ contentType: "text/html",
    body: { "/long": longFixture, "/quote": quoteFixture, "/thread": threadFixture }[new URL(route.request().url()).pathname] || fixture }));
  if (!live) {
    await context.route("https://api.typesafe.ai/**", async (route) => {
      const request = route.request().postDataJSON();
      // Key checks from the setup page: accept only the test key.
      if (request.questions?.key_check) {
        keyChecks += 1;
        const good = route.request().headers().authorization === `Bearer ${key}`;
        await route.fulfill(good
          ? { contentType: "application/json", body: JSON.stringify({ model: "jev-browser-test", answers: { key_check: { type: "noul", probability: 1 } } }) }
          : { status: 401, contentType: "application/json", body: "{}" });
        return;
      }
      const longMatch = /^Long feed post number (\d+)/u.exec(request.state.post);
      if (longMatch) longRequests.push(Number(longMatch[1]));
      else if (request.state.post.startsWith("Quote check")) quoteRequests.push(request.state);
      else if (request.state.post.startsWith("Thread check")) threadRequests.push(request.state);
      else calls += 1;
      assert.equal(route.request().headers().authorization, `Bearer ${key}`);
      if (!/^(Quote|Thread) check/u.test(request.state.post)) assert.deepEqual(Object.keys(request.state), ["post"]);
      if (fail) { await route.fulfill({ status: 429, body: "Test quota failure" }); return; }
      const slop = request.state.post === samples[1];
      const scam = request.state.post === samples[2];
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        model: "jev-browser-test",
        answers: {
          slop: { type: "choice", choice: scam ? "scam" : slop ? "slop" : "not_slop", confidence: 1, probabilities: { slop: +slop, scam: scam ? 0.93 : 0, bot: 0, shill: 0, clickbait: 0, not_slop: scam ? 0.07 : +!slop, uncertain: 0 } },
          category: { type: "choice", choice: scam ? "scam" : slop ? "cadence" : "none", confidence: 1, probabilities: { contrast: 0, setup: 0, colon_reveal: 0, puffery: 0, buzzwords: 0, cadence: +slop, formatting: 0, scam: +scam, clickbait: 0, bot: 0, shill: 0, none: +(!slop && !scam) } }
        }
      }) });
    });
  }
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  // On install the extension opens its setup page in a new tab, which can land in
  // front of a test page at any moment. Close it; the test opens its own.
  const isSetup = (page) => page.url().includes("/options/options.html");
  let setupTab;
  for (let waited = 0; !setupTab && waited < 15000; waited += 100) {
    setupTab = context.pages().find(isSetup);
    if (!setupTab) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(setupTab, "The extension must open its setup page on install");
  await setupTab.close();
  const options = await context.newPage();
  await options.bringToFront();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await options.locator("#keyStatus").filter({ hasText: "No API key" }).waitFor();
  const feed = await context.newPage();
  await feed.bringToFront();
  await feed.goto("https://x.com/home");
  await feed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length === 3, null, { polling: 100 });
  assert.equal(await feed.locator("[data-scroll-guard-host]").count(), 0);
  assert.equal(calls, 0);
  if (!live) {
    // A key Jev rejects is not saved.
    await options.bringToFront();
    await options.locator("#jevApiKey").fill("wrong-key");
    await options.locator("#saveKey").click({ force: true });
    await options.locator("#keyStatus").filter({ hasText: "Jev rejected this key" }).waitFor();
    assert.equal(await options.locator("#jevApiKey").inputValue(), "wrong-key");
    assert.equal(await options.evaluate(() => JevKeyStore.get()), "");
    assert.equal(keyChecks, 1);
  }
  await options.bringToFront();
  await options.locator("#jevApiKey").fill(key);
  await options.locator("#saveKey").click({ force: true });
  await options.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
  assert.equal(await options.locator("#jevApiKey").inputValue(), "");
  if (!live) assert.equal(keyChecks, 2, "Saving must test the key with Jev first");
  if (!live) {
    await options.bringToFront();
    // Strictness starts at 50%. A typed value out of range is clamped to 99%.
    const threshold = options.locator(".threshold input");
    assert.equal(await threshold.inputValue(), "50");
    await threshold.fill("150");
    await threshold.press("Tab");
    assert.equal(await threshold.inputValue(), "99");
    await threshold.fill("90");
    await threshold.press("Tab");
    await options.waitForFunction(async () => {
      const { slopSpotterStateV1: state } = await chrome.storage.local.get("slopSpotterStateV1");
      return state?.settings.sensitivity === 90;
    }, null, { polling: 100 });
  }
  await feed.reload();
  await feed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length === 3, null, { timeout: 60000, polling: 100 });
  const diagnostics = await worker.evaluate(async () => (await chrome.storage.local.get("slopSpotterDiagnosticsV1")).slopSpotterDiagnosticsV1);
  // Model a feed card with intrinsic-size flex children, rather than only block layout.
  await feed.addStyleTag({ content: `
    article[data-testid="tweet"] { display:flex; flex-direction:column; align-items:flex-start; }
    article[data-testid="tweet"] > div { align-self:flex-start; }
  ` });
  for (const host of await feed.locator("[data-scroll-guard-host]").all()) {
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
  await rowFeed.bringToFront();
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
  await rowFeed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-host]").length === 2, null, { timeout: 60000, polling: 100 });
  for (const article of await rowFeed.locator("article:has([data-scroll-guard-host])").all()) {
    const text = await article.locator("[data-testid=tweetText]").boundingBox();
    const card = await article.locator("[data-scroll-guard-host]").boundingBox();
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
    await longFeed.bringToFront();
    await longFeed.setViewportSize({ width: 800, height: 700 });
    await longFeed.goto("https://x.com/long");
    await longFeed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length >= 5, null, { timeout: 30000, polling: 100 });
    await longFeed.waitForTimeout(1000);
    const first = [...longRequests];
    assert.ok(first.length >= 5 && first.length <= 8, `Expected only near-screen posts, got ${JSON.stringify(first)}`);
    assert.deepEqual(first.slice(0, 3), [0, 1, 2], `On-screen posts must go first: ${JSON.stringify(first)}`);
    assert.ok(Math.max(...first) < 8, `No far-off post may be requested: ${JSON.stringify(first)}`);
    for (let y = 700; y <= 7700; y += 700) {
      await longFeed.evaluate((top) => { window.scrollTo(0, top); window.dispatchEvent(new Event("scroll")); }, y);
      await longFeed.waitForTimeout(700);
    }
    await longFeed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length === 30, null, { timeout: 30000, polling: 100 });
    assert.equal(new Set(longRequests).size, 30);
    assert.equal(longRequests.length, 30, "No post may be requested twice");
    await longFeed.close();
    // Jev gets the post's own text with emoji, the quoted post as context, and only
    // the photo descriptions the author wrote. A repost with no text of its own is skipped.
    const quoteFeed = await context.newPage();
    await quoteFeed.bringToFront();
    await quoteFeed.goto("https://x.com/quote");
    await quoteFeed.waitForFunction(() => document.querySelector("[data-scroll-guard-processed]"), null, { timeout: 30000, polling: 100 });
    await quoteFeed.waitForTimeout(1000);
    assert.deepEqual(quoteRequests, [{
      post: "Quote check: movie night 🍿 with the team",
      quoted_post: "Original take 🎬",
      image_descriptions: ["A cinema hall full of people"]
    }]);
    await quoteFeed.close();
    // The parent is expanded before it is read, the reply carries the whole parent,
    // and the second copy of the repeated text is flagged without a Jev request.
    const threadFeed = await context.newPage();
    await threadFeed.bringToFront();
    await threadFeed.setViewportSize({ width: 800, height: 700 });
    await threadFeed.goto("https://x.com/thread");
    await threadFeed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length >= 3, null, { timeout: 30000, polling: 100 });
    await threadFeed.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); window.dispatchEvent(new Event("scroll")); });
    await threadFeed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length === 4, null, { timeout: 30000, polling: 100 });
    await threadFeed.waitForTimeout(500);
    assert.equal(await threadFeed.locator("[data-testid=tweet-text-show-more-link]").count(), 0);
    const byPost = Object.fromEntries(threadRequests.map((state) => [state.post, state]));
    assert.deepEqual(byPost[parentFull], { post: parentFull });
    assert.deepEqual(byPost["Thread check reply: love this"], { post: "Thread check reply: love this", parent_post: parentFull });
    assert.equal(threadRequests.filter((state) => state.post === repeatText).length, 1, "The repeated text must reach Jev only once");
    assert.equal(threadRequests.length, 3, JSON.stringify(threadRequests));
    const repeatCard = threadFeed.locator("article").nth(3).locator("[data-scroll-guard-host]");
    assert.match(await repeatCard.evaluate((host) => host.shadowRoot.textContent), /Likely bot spam.*Repeat/su);
    await threadFeed.close();
  }
  assert.equal(await feed.locator("[data-scroll-guard-host]").count(), 2, JSON.stringify(diagnostics));
  assert.match(await feed.locator("article").nth(1).locator("[data-scroll-guard-host]").evaluate((host) => host.shadowRoot.textContent), /Likely AI slop/);
  assert.match(await feed.locator("article").nth(2).locator("[data-scroll-guard-host]").evaluate((host) => host.shadowRoot.textContent), /Possible scam/);
  for (const [index, verdict, color] of [[1, "slop", "245, 166, 35"], [2, "scam", "255, 82, 107"]]) {
    const card = feed.locator("article").nth(index);
    assert.equal(await card.getAttribute("data-scroll-guard-verdict"), verdict);
    // X paints hover backgrounds on the post's children. The frame must stay above them.
    await feed.addStyleTag({ content: "article:hover > div { background: rgb(22, 24, 28) !important; position: relative; }" });
    await feed.bringToFront();
    await card.hover({ force: true });
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
    await button.click({ force: true });
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    await card.locator(".details").waitFor({ state: "visible" });
    await button.click({ force: true });
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
  assert.equal(await feed.locator("article").nth(1).locator("[data-scroll-guard-host]").count(), 1);
  for (const index of [1, 2]) {
    const card = feed.locator("article").nth(index);
    await card.getByRole("button", { name: "Block @TestAccount", exact: true }).waitFor({ state: "visible" });
    assert.equal(await card.locator(".summary").getAttribute("aria-expanded"), "false");
  }
  if (!live) {
    const opened = context.waitForEvent("page");
    await feed.bringToFront();
    await feed.locator("article").nth(2).getByRole("button", { name: "Block @TestAccount", exact: true }).click({ force: true });
    const handoff = await opened;
    await handoff.waitForURL("https://x.com/TestAccount#scroll-guard-block");
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
    await feed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-processed]").length === 3, null, { polling: 100 });
    assert.equal(calls, 3, "Reload should reuse cached decisions");
    await feed.locator("article").nth(1).evaluate((article, text) => {
      article.querySelector("[data-testid=tweetText]").textContent = text;
      // Another author, so the reused card is not the same account repeating itself.
      article.querySelector("a").href = "/OtherAccount/status/200";
    }, samples[0]);
    await feed.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-host]").length === 1 && document.querySelectorAll("[data-scroll-guard-processed]").length === 3, null, { polling: 100 });
    assert.equal(calls, 3, "Recycled cards must reclassify and reuse cached text decisions");
    assert.equal(await feed.locator("article").nth(1).evaluate((node) => node.hasAttribute("data-scroll-guard-verdict")), false);
    await options.bringToFront();
    await options.locator("#removeKey").click({ force: true });
    await options.locator("#keyStatus").filter({ hasText: "No API key" }).waitFor();
    fail = true;
    await options.locator("#jevApiKey").fill(key);
    await options.locator("#saveKey").click({ force: true });
    await options.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
    await feed.reload();
    await feed.waitForTimeout(1500);
    // The three posts run in parallel, so each sends one request before the first 429 returns.
    assert.equal(calls, 6, `Each post should try once (calls: ${calls})`);
    // Retries come after 4 s, but the worker's pause blocks them without new requests.
    await feed.waitForTimeout(5000);
    assert.equal(calls, 6, `The pause must block retries (calls: ${calls})`);
    // Failed posts stay unchecked so they retry after the pause; they are not dropped.
    assert.equal(await feed.locator("[data-scroll-guard-processed]").count(), 0);
    assert.equal(await feed.locator("[data-scroll-guard-host]").count(), 0);
    const popup = await context.newPage();
    await popup.bringToFront();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.locator("#diagnostics").filter({ hasText: "Scanner error" }).waitFor();
    // Unchecking the last verdict type pauses the extension; checking one resumes it;
    // the switch brings every type back.
    const settingsNow = () => popup.evaluate(async () => (await chrome.storage.local.get("slopSpotterStateV1")).slopSpotterStateV1.settings);
    for (const name of ["AI slop", "Clickbait", "Bot spam", "Shilling", "Scam"]) {
      await popup.locator(".row", { hasText: name }).click({ force: true });
    }
    await popup.waitForFunction(() => !document.querySelector("#enabled").checked, null, { polling: 100 });
    assert.equal((await settingsNow()).enabled, false);
    await popup.locator(".row", { hasText: "Scam" }).click({ force: true });
    await popup.waitForFunction(() => document.querySelector("#enabled").checked, null, { polling: 100 });
    assert.deepEqual((await settingsNow()).verdicts, { slop: false, clickbait: false, bot: false, shill: false, scam: true });
    await popup.locator(".row", { hasText: "Scam" }).click({ force: true });
    await popup.waitForFunction(() => !document.querySelector("#enabled").checked, null, { polling: 100 });
    await popup.locator("label.switch").click({ force: true });
    await popup.waitForFunction(() => [...document.querySelectorAll(".row .check")].every((box) => box.checked), null, { polling: 100 });
    const restored = await settingsNow();
    assert.equal(restored.enabled, true);
    assert.deepEqual(restored.verdicts, { slop: true, clickbait: true, bot: true, shill: true, scam: true });
    // The key must survive a restart. Chrome clears session storage then, as it
    // does on an extension reload.
    await context.close();
    context = await chromium.launchPersistentContext(profile, launchOptions);
    const reopened = await context.newPage();
    await reopened.bringToFront();
    // After a restart Chrome can load this page a second time, which Playwright
    // reports as an interrupted navigation. The page still lands on the setup page.
    await reopened.goto(`chrome-extension://${extensionId}/options/options.html`).catch((error) => {
      if (!/interrupted by another navigation/u.test(error.message)) throw error;
    });
    await reopened.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
  }
  console.log(`${live ? "LIVE" : "MOCK"} browser flow passed: key entry, worker requests, feed annotations, and private local storage${live ? "" : ", cache reuse and provider errors"}.`);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
