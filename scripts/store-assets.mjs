// Renders the Chrome Web Store images from the real extension: a demo feed with
// mocked Jev answers, the popup, and the setup page. Output goes to store/.
// Demo accounts are fictional, so no real person appears in the listing. Handles
// stay within X's 15-character limit, or the adapter rightly skips the post.
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const project = resolve(new URL("..", import.meta.url).pathname);
const out = join(project, "store");
const shots = join(out, ".captures");
await mkdir(shots, { recursive: true });

const posts = [
  { name: "Jamie Builds", handle: "jamie_builds", avatar: "#5b6b7d", text: "Fixed the CSV importer: quoted commas were splitting columns. Added a regression test with a three-column file; all 42 tests pass.", verdict: "not_slop", p: 0.93, category: "none" },
  { name: "Growth Notes", handle: "growthnotes", avatar: "#7a5d45", text: "Most founders think growth is about hustle. It's not. It's about systems. Here's what nobody tells you: the best teams don't work harder. They work smarter. Let that sink in.", verdict: "slop", p: 0.94, category: "contrast" },
  { name: "Newsflash Daily", handle: "newsflash_daily", avatar: "#4b6b5c", text: "JUST IN: Study reveals people who drink 5+ cups of coffee a day have less body fat, more muscle, and higher testosterone.", verdict: "clickbait", p: 0.97, category: "clickbait" },
  { name: "Listing Alerts", handle: "listalerts8812", avatar: "#5d527d", text: "If you want $TOKEN listed you have to show up now, sitting back does nothing tinyurl.com/x9f2k1 E4Ap4icMLwKot8rkkT listing id: 88213", verdict: "bot", p: 0.91, category: "bot" },
  { name: "ETH Rewards Team", handle: "ethrewardsteam", avatar: "#7d4b55", text: "Official giveaway! Send 0.1 ETH to our wallet and receive 1 ETH back instantly. Guaranteed. DM your wallet recovery phrase to verify eligibility.", verdict: "scam", p: 0.96, category: "scam" }
];

// A neutral feed that follows X's post structure (the extension reads its test IDs),
// without X's logo or branding.
const feed = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; background:#000; color:#e7e9ea; font:15px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { width:600px; margin:0 auto; border-inline:1px solid #2f3336; min-height:100vh; }
  h1 { font-size:20px; margin:0; padding:14px 16px; border-bottom:1px solid #2f3336; }
  article { display:flex; gap:12px; padding:12px 16px 8px; border-bottom:1px solid #2f3336; }
  .avatar { flex:none; width:40px; height:40px; border-radius:50%; }
  .body { flex:1; min-width:0; display:flex; flex-direction:column; }
  .who { display:flex; gap:4px; color:#71767b; } .who b { color:#e7e9ea; }
  .who a { color:inherit; text-decoration:none; }
  .text { margin-top:2px; }
  .bar { display:flex; justify-content:space-between; color:#71767b; font-size:13px; margin:10px 0 2px; max-width:420px; }
</style></head><body><main><h1>Home</h1>${posts.map((post, i) => `
  <article data-testid="tweet"><span class="avatar" style="background:${post.avatar}"></span><div class="body">
    <div class="who" data-testid="User-Name"><b>${post.name}</b><span>@${post.handle}</span><span>·</span><a href="/${post.handle}/status/${700 + i}"><time>${i + 1}h</time></a></div>
    <div class="text" data-testid="tweetText">${post.text}</div>
    <div class="bar"><span>💬 ${12 + i * 7}</span><span>🔁 ${4 + i * 3}</span><span>♡ ${40 + i * 21}</span><span>📊 ${1 + i}.${i}K</span></div>
  </div></article>`).join("")}</main></body></html>`;

function answer(post) {
  const choices = ["slop", "scam", "bot", "shill", "clickbait", "not_slop", "uncertain"];
  const probabilities = Object.fromEntries(choices.map((key) => [key, 0]));
  probabilities[post.verdict] = post.p;
  probabilities[post.verdict === "not_slop" ? "uncertain" : "not_slop"] = Number((1 - post.p).toFixed(2));
  const categories = ["contrast", "setup", "colon_reveal", "puffery", "buzzwords", "cadence", "formatting", "scam", "clickbait", "bot", "shill", "none"];
  const categoryProbabilities = Object.fromEntries(categories.map((key) => [key, key === post.category ? 1 : 0]));
  return {
    model: "jev-demo",
    answers: {
      slop: { type: "choice", choice: post.verdict, confidence: 1, probabilities },
      category: { type: "choice", choice: post.category, confidence: 1, probabilities: categoryProbabilities }
    }
  };
}

// The page region from the top of one element to the bottom of another.
async function region(page, from, to, pad = 0) {
  return page.evaluate(([first, last, pad]) => {
    const top = document.querySelector(first).getBoundingClientRect();
    const bottom = document.querySelector(last).getBoundingClientRect();
    const left = Math.min(top.left, bottom.left);
    const right = Math.max(top.right, bottom.right);
    return { x: left - pad, y: top.top + scrollY - pad, width: right - left + pad * 2, height: bottom.bottom - top.top + pad + Math.min(pad, 8) };
  }, [from, to, pad]);
}

const profile = await mkdtemp(join(tmpdir(), "store-assets-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: "chromium" }),
  args: [`--disable-extensions-except=${project}`, `--load-extension=${project}`],
  deviceScaleFactor: 2
});
try {
  await context.route("https://x.com/**", (route) => route.fulfill({ contentType: "text/html", body: feed }));
  await context.route("https://api.typesafe.ai/**", async (route) => {
    const request = route.request().postDataJSON();
    if (request.questions?.key_check) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ model: "jev-demo", answers: { key_check: { type: "noul", probability: 1 } } }) });
      return;
    }
    const post = posts.find((item) => item.text === request.state.post);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(answer(post)) });
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;

  // Setup page before and after the key.
  const setup = await context.newPage();
  await setup.emulateMedia({ colorScheme: "dark" });
  await setup.setViewportSize({ width: 620, height: 900 });
  await setup.goto(`chrome-extension://${id}/options/options.html`);
  await setup.fill("#jevApiKey", "demo-key-for-store-images-x9Qz");
  await setup.click("#saveKey");
  await setup.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
  await setup.waitForTimeout(300);
  await setup.screenshot({ path: join(shots, "setup.png"), clip: await region(setup, ".brand", "#prefsCard", 28) });

  // The feed with every verdict type flagged.
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 640, height: 1400 });
  await page.goto("https://x.com/home");
  await page.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-host]").length === 4, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, "feed.png"), clip: await region(page, "article:nth-of-type(1)", "article:nth-of-type(5)") });
  const slopPost = page.locator("article").nth(1);
  await slopPost.locator("[data-scroll-guard-host]").evaluate((host) => host.shadowRoot.querySelector(".summary").click());
  await page.waitForTimeout(300);
  const box = await slopPost.boundingBox();
  await page.screenshot({ path: join(shots, "evidence.png"), clip: { x: box.x, y: box.y, width: box.width, height: box.height - 3 } });

  // The popup, with the demo posts counted.
  const popup = await context.newPage();
  await popup.emulateMedia({ colorScheme: "dark" });
  await popup.setViewportSize({ width: 300, height: 200 });
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.waitForTimeout(300);
  const height = await popup.evaluate(() => document.documentElement.scrollHeight);
  await popup.setViewportSize({ width: 300, height });
  await popup.screenshot({ path: join(shots, "popup.png") });
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}

// Compose the store images: one caption, one real capture, on a quiet background.
const icon = readFileSync(join(project, "icons", "icon-128.png")).toString("base64");
const image = (name) => `data:image/png;base64,${readFileSync(join(shots, name)).toString("base64")}`;
const frame = ({ title, body, shot, width }) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; width:1280px; height:800px; background:#111; color:#ececec; display:flex; align-items:center;
    font:16px/1.5 -apple-system, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow:hidden; }
  .copy { width:430px; padding:0 40px 0 72px; box-sizing:border-box; flex:none; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:600; font-size:15px; color:#bdbdbd; margin-bottom:28px; }
  .brand img { width:28px; height:28px; }
  h1 { font-size:38px; line-height:1.12; letter-spacing:-0.025em; margin:0 0 16px; font-weight:650; }
  p { color:#9a9a9a; font-size:18px; margin:0; }
  .shot { flex:1; display:flex; justify-content:center; align-items:center; height:800px; overflow:hidden; }
  .shot img { max-width:${width}px; max-height:704px; width:auto; height:auto; border-radius:14px; box-shadow:0 0 0 1px #2a2a2a, 0 24px 60px #000c; }
</style></head><body><div class="copy"><div class="brand"><img src="data:image/png;base64,${icon}">Scroll Guard</div>
<h1>${title}</h1><p>${body}</p></div><div class="shot"><img src="${image(shot)}"></div></body></html>`;

const slides = [
  { file: "screenshot-1-feed.png", title: "See slop, bots, and scams as you scroll.", body: "Each flagged post gets a colored frame and a short verdict: AI slop, clickbait, bot spam, or scam.", shot: "feed.png", width: 520 },
  { file: "screenshot-2-evidence.png", title: "Every flag explains itself.", body: "Open a verdict to see the strongest pattern Jev found. Block the account in one click, with X's own confirmation.", shot: "evidence.png", width: 640 },
  { file: "screenshot-3-popup.png", title: "Choose what to flag.", body: "Turn each type on or off, set how strict it is, and see what it caught in the last 24 hours.", shot: "popup.png", width: 330 },
  { file: "screenshot-4-setup.png", title: "Your key, your costs.", body: "Paste your own Jev API key. It is tested before saving and never leaves your device except to call Jev.", shot: "setup.png", width: 520 }
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const slide of slides) {
    await page.setContent(frame(slide));
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(out, slide.file) });
  }
  // Small promo tile, 440 x 280.
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; width:440px; height:280px; background:#111; color:#ececec; display:flex; flex-direction:column;
      justify-content:center; padding:0 40px; box-sizing:border-box; font:15px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    img { width:56px; height:56px; margin-bottom:18px; }
    h1 { font-size:30px; letter-spacing:-0.025em; margin:0 0 6px; font-weight:650; }
    p { margin:0; color:#9a9a9a; }
  </style></head><body><img src="data:image/png;base64,${icon}"><h1>Scroll Guard</h1><p>Flags AI slop, clickbait, bot spam, and scams on X.</p></body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, "promo-small-440x280.png") });
} finally {
  await browser.close();
}
writeFileSync(join(out, ".captures", ".gitignore"), "*\n");
console.log(`Store images written to ${out}.`);
