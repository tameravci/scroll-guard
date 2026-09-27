// Records a short promo video of the real extension on the demo feed (mocked Jev
// answers, fictional accounts) and converts it to store/promo.mp4 with ffmpeg.
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const project = resolve(new URL("..", import.meta.url).pathname);
const out = join(project, "store");
const size = { width: 1280, height: 800 };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const icon = `data:image/png;base64,${readFileSync(join(project, "icons", "icon-128.png")).toString("base64")}`;

const posts = [
  { name: "Jamie Builds", handle: "jamie_builds", avatar: "#5b6b7d", text: "Fixed the CSV importer: quoted commas were splitting columns. Added a regression test with a three-column file; all 42 tests pass.", verdict: "not_slop", p: 0.93, category: "none" },
  { name: "Growth Notes", handle: "growthnotes", avatar: "#7a5d45", text: "Most founders think growth is about hustle. It's not. It's about systems. Here's what nobody tells you: the best teams don't work harder. They work smarter. Let that sink in.", verdict: "slop", p: 0.94, category: "contrast" },
  { name: "Newsflash Daily", handle: "newsflash_daily", avatar: "#4b6b5c", text: "JUST IN: Study reveals people who drink 5+ cups of coffee a day have less body fat, more muscle, and higher testosterone.", verdict: "clickbait", p: 0.97, category: "clickbait" },
  { name: "Sam Rivera", handle: "samrivera", avatar: "#6b5b7d", text: "Finally finished the trail run I've been training for since March. Legs are gone, but so worth it.", verdict: "not_slop", p: 0.95, category: "none" },
  { name: "Listing Alerts", handle: "listalerts8812", avatar: "#5d527d", text: "If you want $TOKEN listed you have to show up now, sitting back does nothing tinyurl.com/x9f2k1 E4Ap4icMLwKot8rkkT listing id: 88213", verdict: "bot", p: 0.91, category: "bot" },
  { name: "ETH Rewards Team", handle: "ethrewardsteam", avatar: "#7d4b55", text: "Official giveaway! Send 0.1 ETH to our wallet and receive 1 ETH back instantly. Guaranteed. DM your wallet recovery phrase to verify eligibility.", verdict: "scam", p: 0.96, category: "scam" }
];

const baseStyle = `body { margin:0; background:#000; color:#e7e9ea; font:17px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }`;
const card = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyle}
  body { height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#111; text-align:center; }
  img { width:88px; height:88px; margin-bottom:26px; }
  h1 { font-size:52px; letter-spacing:-0.03em; margin:0 0 14px; font-weight:650; color:#ececec; }
  p { font-size:24px; color:#9a9a9a; margin:0; max-width:820px; line-height:1.45; }
  .fade { animation: in 600ms ease both; } @keyframes in { from { opacity:0; transform:translateY(8px); } }
</style></head><body><div class="fade"><img src="${icon}"><h1>${title}</h1><p>${body}</p></div></body></html>`;

const feed = `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyle}
  main { width:640px; margin:0 auto; border-inline:1px solid #2f3336; min-height:100vh; padding-bottom:400px; }
  h1 { font-size:21px; margin:0; padding:16px; border-bottom:1px solid #2f3336; }
  article { display:flex; gap:12px; padding:14px 16px 10px; border-bottom:1px solid #2f3336; }
  .avatar { flex:none; width:44px; height:44px; border-radius:50%; }
  .body { flex:1; min-width:0; display:flex; flex-direction:column; }
  .who { display:flex; gap:5px; color:#71767b; } .who b { color:#e7e9ea; } .who a { color:inherit; text-decoration:none; }
  .text { margin-top:2px; }
  .bar { display:flex; justify-content:space-between; color:#71767b; font-size:14px; margin:10px 0 2px; max-width:440px; }
  .caption { position:fixed; left:32px; bottom:32px; max-width:300px; font-size:22px; line-height:1.35; color:#ececec; font-weight:600;
    letter-spacing:-0.01em; transition:opacity 300ms ease; }
  .caption small { display:block; font-size:16px; font-weight:400; color:#9a9a9a; margin-top:6px; }
</style></head><body><main><h1>Home</h1>${posts.map((post, i) => `
  <article data-testid="tweet"><span class="avatar" style="background:${post.avatar}"></span><div class="body">
    <div class="who" data-testid="User-Name"><b>${post.name}</b><span>@${post.handle}</span><span>·</span><a href="/${post.handle}/status/${800 + i}"><time>${i + 1}h</time></a></div>
    <div class="text" data-testid="tweetText">${post.text}</div>
    <div class="bar"><span>💬 ${12 + i * 7}</span><span>🔁 ${4 + i * 3}</span><span>♡ ${40 + i * 21}</span><span>📊 ${1 + i}.${i}K</span></div>
  </div></article>`).join("")}</main><div class="caption" id="caption"></div></body></html>`;

function answer(post) {
  const choices = ["slop", "scam", "bot", "clickbait", "not_slop", "uncertain"];
  const probabilities = Object.fromEntries(choices.map((key) => [key, 0]));
  probabilities[post.verdict] = post.p;
  probabilities[post.verdict === "not_slop" ? "uncertain" : "not_slop"] = Number((1 - post.p).toFixed(2));
  const categories = ["contrast", "setup", "colon_reveal", "puffery", "buzzwords", "cadence", "formatting", "scam", "clickbait", "bot", "none"];
  return {
    model: "jev-demo",
    answers: {
      slop: { type: "choice", choice: post.verdict, confidence: 1, probabilities },
      category: { type: "choice", choice: post.category, confidence: 1, probabilities: Object.fromEntries(categories.map((key) => [key, key === post.category ? 1 : 0])) }
    }
  };
}

const profile = await mkdtemp(join(tmpdir(), "store-video-"));
const videoDir = await mkdtemp(join(tmpdir(), "store-video-raw-"));
let context;
let id;
let answerDelay = 0;
let demoVideo;
async function routes(target) {
  await target.route("https://x.com/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/intro"
      ? card("Scroll Guard", "AI slop, clickbait, bot spam, and scams, flagged as you scroll.")
      : path === "/outro"
        ? card("Your key. Pennies a day.", "Bring your own Jev key: about 1–2 cents for a typical day of scrolling.<br>Open source · github.com/tameravci/scroll-guard")
        : feed;
    route.fulfill({ contentType: "text/html", body });
  });
  await target.route("https://api.typesafe.ai/**", async (route) => {
    const request = route.request().postDataJSON();
    if (request.questions?.key_check) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ model: "jev-demo", answers: { key_check: { type: "noul", probability: 1 } } }) });
      return;
    }
    // Answers arrive one after another, as they would from the real API.
    const post = posts.find((item) => item.text === request.state.post);
    await sleep(answerDelay * (1 + posts.indexOf(post) * 0.5));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(answer(post)) });
  });
}

try {
  // One browser session throughout, so the mocks are in place before the extension's
  // worker makes any request. Each page records its own video; only the demo page is kept.
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : { channel: "chromium" }),
    args: [`--disable-extensions-except=${project}`, `--load-extension=${project}`],
    viewport: size,
    recordVideo: { dir: videoDir, size },
    colorScheme: "dark"
  });
  await routes(context);
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  id = new URL(worker.url()).host;
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${id}/options/options.html`);
  await setup.fill("#jevApiKey", "demo-key-for-promo-video-x9Qz");
  await setup.click("#saveKey");
  await setup.locator("#keyStatus").filter({ hasText: /^Key saved/ }).waitFor();
  await setup.close();
  answerDelay = 700;
  const page = await context.newPage();
  demoVideo = page.video();
  const caption = (title, detail = "") => page.evaluate(([t, d]) => {
    const node = document.querySelector("#caption");
    node.innerHTML = `${t}${d ? `<small>${d}</small>` : ""}`;
  }, [title, detail]);

  await page.goto("https://x.com/intro");
  await sleep(2800);

  await page.goto("https://x.com/home");
  await caption("Posts are checked as you read.", "Only posts on or near your screen go to Jev.");
  await page.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-host]").length >= 2, null, { timeout: 30000 });
  await sleep(1800);
  for (let step = 0; step < 6; step += 1) {
    await page.mouse.wheel(0, 110);
    await sleep(260);
  }
  await page.waitForFunction(() => document.querySelectorAll("[data-scroll-guard-host]").length === 4, null, { timeout: 30000 });
  await caption("Four kinds of junk, four colors.", "AI slop, clickbait, bot spam, and scams. Real posts stay untouched.");
  await sleep(2600);

  // Open the AI slop verdict to show its reason.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(900);
  await caption("Every flag explains itself.", "Open a verdict to see the pattern Jev found.");
  await page.locator("article").nth(1).locator("[data-scroll-guard-host]").evaluate((host) => host.shadowRoot.querySelector(".summary").click());
  await sleep(3200);
  await caption("Block in one click.", "X asks you to confirm. Nothing is blocked automatically.");
  await sleep(2400);

  // The popup, shown large in the middle of the frame.
  const popup = page;
  await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  await popup.addStyleTag({ content: `
    html { background:#111; height:100%; }
    body { width:300px; margin:0 auto; zoom:1.7; transform-origin:top center; position:relative; top:16px;
      border-radius:12px; box-shadow:0 0 0 1px #2a2a2a, 0 24px 60px #000c; overflow:hidden; }
  ` });
  await sleep(1600);
  await popup.locator(".row", { hasText: "Clickbait" }).click();
  await sleep(1200);
  await popup.locator(".row", { hasText: "Clickbait" }).click();
  await sleep(900);
  await popup.locator(".segment", { hasText: "More" }).click();
  await sleep(1500);

  await page.goto("https://x.com/outro");
  await sleep(3400);
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}

// Convert the demo page's recording to an H.264 MP4 that YouTube and browsers accept.
const raw = await demoVideo.path();
await mkdir(out, { recursive: true });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(out, "promo.mp4")]);
await rm(videoDir, { recursive: true, force: true });
console.log(`Promo video written to ${join(out, "promo.mp4")}.`);
