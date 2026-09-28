// Renders the 15-second promo reel frame by frame: an HTML scene with a seek(t)
// timeline, captured with Playwright at 60 fps and encoded with ffmpeg.
// Output: store/promo.mp4 (1920x1080, H.264, with the original score from
// store-music.mjs). Cues sit on the score's 160 BPM grid, anchored at 2.6 s.
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { renderMusic, BEAT, CHIPS, FINAL, DURATION } from "./store-music.mjs";
import { join, resolve } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const project = resolve(new URL("..", import.meta.url).pathname);
const FPS = Number(process.env.REEL_FPS || 60);

const scene = String.raw`<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@600;700&display=block" rel="stylesheet">
<style>
  * { box-sizing:border-box; }
  html, body { margin:0; width:1920px; height:1080px; overflow:hidden; background:#0a0a0b; }
  body { font-family:"Inter Tight", sans-serif; color:#f2f1ed; -webkit-font-smoothing:antialiased; }
  .abs { position:absolute; left:0; top:0; will-change:transform, opacity; }
  .card { border-radius:22px; background:#161719; overflow:hidden; }
  .avatar { position:absolute; left:26px; top:24px; width:56px; height:56px; border-radius:50%; background:#2c2d31; }
  .line { position:absolute; height:14px; border-radius:7px; background:#2e2f33; }
  .pill { position:absolute; right:22px; bottom:18px; display:flex; align-items:center; gap:12px; padding:9px 16px 9px 14px;
    border-radius:12px; font:600 22px/1 "Inter Tight"; letter-spacing:-0.01em; color:#f2f1ed; transform-origin:right center; }
  .pill .dot { width:11px; height:11px; border-radius:50%; }
  .pill .pct { font:700 22px/1 "JetBrains Mono"; font-variant-numeric:tabular-nums; }
  svg.frame { position:absolute; overflow:visible; }
  .mask { position:absolute; overflow:hidden; }
  .mask > div { will-change:transform; }
  .headline { font-weight:800; font-size:118px; line-height:1.02; letter-spacing:-0.045em; white-space:nowrap; }
  .label { font-weight:500; font-size:40px; color:#8d8f94; letter-spacing:-0.01em; }
  .word { font-weight:900; font-size:146px; line-height:1; letter-spacing:-0.05em; white-space:nowrap; }
  .shape { position:absolute; left:0; top:0; will-change:transform; }
  .wordmark { position:absolute; left:0; top:0; width:1920px; text-align:center; font-weight:800; font-size:158px;
    letter-spacing:-0.05em; line-height:1; white-space:nowrap; }
  .wordmark span { display:inline-block; will-change:transform, opacity, filter; }
  .tagline { position:absolute; left:0; width:1920px; text-align:center; font-weight:500; font-size:38px; color:#8d8f94; letter-spacing:-0.01em; }
  .chips { position:absolute; left:0; width:1920px; display:flex; justify-content:center; gap:22px; }
  .chip { padding:18px 30px; border-radius:18px; border:2px solid #2d2e32; background:#121315; font-weight:700; font-size:40px;
    letter-spacing:-0.02em; white-space:nowrap; will-change:transform, opacity; }
  .chip b { color:#f5a623; font-weight:800; }
  .footer { position:absolute; left:0; width:1920px; text-align:center; font:500 26px/1 "Inter Tight"; color:#6f7176; letter-spacing:0.01em; }
  #vignette { position:absolute; inset:0; background:radial-gradient(120% 90% at 50% 45%, transparent 55%, #000a 100%); pointer-events:none; }
  #grain { position:absolute; inset:-50%; opacity:0.07; mix-blend-mode:overlay; pointer-events:none;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
  #glow { position:absolute; width:1400px; height:1400px; border-radius:50%; pointer-events:none;
    background:radial-gradient(closest-side, rgba(245,166,35,0.26), rgba(245,166,35,0.07) 45%, transparent 72%); }
  .ring { position:absolute; border-radius:50%; border:3px solid #f5a623; pointer-events:none; }
</style></head><body>
<div id="glow" class="abs"></div>
<div id="feed"></div>
<div id="copy"></div>
<div id="logo"></div>
<div id="end"></div>
<div id="vignette"></div>
<div id="grain"></div>
<script>
// Cue times from store-music.mjs, injected so picture and score share one timeline.
const BEAT = ${BEAT}, CHIPS = ${CHIPS}, FINAL = ${FINAL}, DURATION = ${DURATION};
// ---------- easing and helpers ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const outExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const inExpo = (p) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10));
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const outBack = (p, s = 1.8) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const inOutQuint = (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2);
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
const el = (tag, cls, parent, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html !== undefined) n.innerHTML = html; parent.appendChild(n); return n; };
const place = (n, x, y, w, h) => { n.style.transform = "translate(" + x + "px," + y + "px)"; if (w !== undefined) { n.style.width = w + "px"; n.style.height = h + "px"; } };

// ---------- the feed ----------
const VERDICTS = {
  1: { key: "slop", label: "AI slop", color: "#f5a623", rgb: "245,166,35", pct: 94, at: 2.6, word: "AI SLOP" },
  2: { key: "clickbait", label: "Clickbait", color: "#2dd4bf", rgb: "45,212,191", pct: 97, at: 3.35, word: "CLICKBAIT" },
  4: { key: "bot", label: "Bot spam", color: "#a78bfa", rgb: "167,139,250", pct: 91, at: 4.1, word: "BOT SPAM" },
  5: { key: "scam", label: "Scam", color: "#ff526b", rgb: "255,82,107", pct: 96, at: 4.85, word: "SCAMS" }
};
const FX = 930, CW = 820, CH = 136, PITCH = 158, TOP0 = 86;
const feed = document.getElementById("feed");
const cards = [];
const random = rng(7);
for (let k = -20; k <= 6; k += 1) {
  const node = el("div", "card abs", feed);
  el("div", "avatar", node);
  const lines = [];
  const count = 2 + Math.floor(random() * 2);
  for (let i = 0; i < count; i += 1) {
    const line = el("div", "line", node);
    // Lines stop short of the pill area on the right.
    const width = i === 0 ? 180 + random() * 140 : 300 + random() * 170;
    line.style.left = "104px"; line.style.top = (30 + i * 28) + "px"; line.style.width = width + "px";
    if (i === 0) line.style.background = "#44464b";
    lines.push({ node: line, width, top: 30 + i * 28 });
  }
  const verdict = VERDICTS[k];
  let frame, rect, pill, pct;
  if (verdict) {
    // SVG must be created in its own namespace, or Chrome never renders it.
    const NS = "http://www.w3.org/2000/svg";
    frame = document.createElementNS(NS, "svg");
    frame.setAttribute("class", "frame abs");
    rect = document.createElementNS(NS, "rect");
    rect.setAttribute("pathLength", "1"); rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", verdict.color); rect.setAttribute("stroke-width", "5"); rect.setAttribute("stroke-linecap", "round");
    frame.appendChild(rect);
    feed.appendChild(frame);
    pill = el("div", "pill", node, '<span class="dot" style="background:' + verdict.color + '"></span><span>' + verdict.label + '</span><span class="pct" style="color:' + verdict.color + '">0%</span>');
    pill.style.background = "rgba(" + verdict.rgb + ",0.13)";
    pill.style.border = "1px solid rgba(" + verdict.rgb + ",0.45)";
    pct = pill.lastChild;
  }
  cards.push({ k, node, lines, verdict, frame, rect, pill, pct });
}

// ---------- copy on the left ----------
const copy = document.getElementById("copy");
function maskLine(text, cls, x, y, h) {
  const mask = el("div", "mask", copy); mask.style.left = x + "px"; mask.style.top = y + "px"; mask.style.height = h + "px"; mask.style.width = "900px";
  const inner = el("div", cls, mask, text); return inner;
}
const head1 = maskLine("Your feed", "headline", 120, 350, 130);
const head2 = maskLine('is full of <span style="color:#f5a623">junk.</span>', "headline", 120, 480, 130);
const label = maskLine("Scroll Guard flags", "label", 124, 360, 56);
const words = Object.values(VERDICTS).map((v) => { const n = maskLine(v.word, "word", 116, 430, 170); n.style.color = v.color; return { n, v }; });

// ---------- logo parts (morph targets) ----------
const logo = document.getElementById("logo");
const tile = el("div", "shape", logo); tile.style.background = "#161616"; tile.style.boxShadow = "0 0 0 2px #26272a, 0 40px 120px #000";
const barTop = el("div", "shape", logo), barBottom = el("div", "shape", logo), innerBar = el("div", "shape", logo);
const frameShape = el("div", "shape", logo); frameShape.style.border = "solid #f5a623";
const rings = [el("div", "ring abs", logo), el("div", "ring abs", logo)];
const glow = document.getElementById("glow");
// Icon geometry in 128-unit space, from icons/icon.svg.
function iconRects(cx, cy, size) {
  const u = size / 128, ox = cx - size / 2, oy = cy - size / 2;
  const r = (x, y, w, h, rad) => ({ x: ox + x * u, y: oy + y * u, w: w * u, h: h * u, r: rad * u });
  return { u, tile: r(4, 4, 120, 120, 28), top: r(26, 22, 76, 14, 7), frame: r(21, 48, 86, 32, 11), inner: r(32, 59, 64, 10, 5), bottom: r(26, 92, 76, 14, 7) };
}
const mixRect = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p), r: lerp(a.r, b.r, p) });
const setRect = (n, R) => { place(n, R.x, R.y, R.w, R.h); n.style.borderRadius = R.r + "px"; };
const mixColor = (a, b, p) => "rgb(" + a.map((c, i) => Math.round(lerp(c, b[i], p))).join(",") + ")";

// ---------- wordmark and end card ----------
const end = document.getElementById("end");
const wordmark = el("div", "wordmark", end);
const letters = [..."Scroll Guard"].map((ch) => el("span", "", wordmark, ch === " " ? "&nbsp;" : ch));
const tagline = el("div", "tagline", end, "Flags AI slop, clickbait, bot spam, and scams as you scroll.");
const chipRow = el("div", "chips", end);
const chips = ['<b>≈1–2¢</b> a day', "Your own Jev key", "Open source"].map((html) => el("div", "chip", chipRow, html));
const footer = el("div", "footer", end, "Chrome extension for X&nbsp;&nbsp;·&nbsp;&nbsp;github.com/tameravci/scroll-guard");

const feedOffset = (t) => 2600 * (1 - outExpo(clamp(t / 2.8)));

window.seek = (t, frameIndex) => {
  // Grain moves every frame so it reads as film, not dirt.
  const g = rng(frameIndex + 11);
  document.getElementById("grain").style.transform = "translate(" + Math.round(g() * 200 - 100) + "px," + Math.round(g() * 200 - 100) + "px)";

  // ----- feed: whip, brake, flag -----
  const S = feedOffset(t);
  const v = Math.abs(feedOffset(t + 1 / 120) - S) * 120; // px per second
  const blur = Math.min(v / 1400, 7);
  const stretch = 1 + Math.min(v / 9000, 0.4);
  const exit = prog(t, 5.9, 6.4);
  const morph = inOutQuint(prog(t, 6.35, 7.55));
  const inMorph = t >= 6.35;
  for (const c of cards) {
    const top = TOP0 + c.k * PITCH + S;
    const survivor = c.k >= 0 && c.k <= 2;
    let opacity = 1, drop = 0;
    if (!survivor) { opacity = 1 - outCubic(exit); drop = 60 * inExpo(exit); }
    c.node.style.transform = "translate(" + FX + "px," + (top + drop) + "px) scaleY(" + stretch + ")";
    c.node.style.width = CW + "px"; c.node.style.height = CH + "px";
    c.node.style.filter = blur > 0.2 ? "blur(" + blur.toFixed(2) + "px)" : "none";
    c.node.style.opacity = inMorph && survivor ? 0 : opacity;
    // Survivors lose their content before they become icon parts.
    const strip = survivor ? outCubic(prog(t, 5.95, 6.35)) : 0;
    c.node.querySelector(".avatar").style.opacity = 1 - strip;
    c.lines.forEach((line, i) => { line.node.style.opacity = c.k === 1 && i === 0 ? 1 : 1 - strip; });
    if (c.verdict) {
      const V = c.verdict;
      const draw = outExpo(prog(t, V.at, V.at + 0.5));
      const pad = 4;
      place(c.frame, FX - pad, top - pad + drop, CW + pad * 2, CH + pad * 2);
      c.rect.setAttribute("x", 0); c.rect.setAttribute("y", 0);
      c.rect.setAttribute("width", CW + pad * 2); c.rect.setAttribute("height", CH + pad * 2);
      c.rect.setAttribute("rx", 24);
      c.rect.style.strokeDasharray = "1 1";
      c.rect.style.strokeDashoffset = String(1 - draw);
      const keepFrame = c.k === 1 ? 1 : 1 - outCubic(prog(t, 5.9, 6.3));
      c.frame.style.opacity = (draw > 0 ? 1 : 0) * keepFrame * (inMorph ? 0 : 1) * (survivor ? 1 : 1 - outCubic(exit));
      c.frame.style.filter = draw > 0 && draw < 1 ? "drop-shadow(0 0 " + (14 * (1 - draw)).toFixed(1) + "px " + V.color + ")" : "none";
      c.node.style.background = "linear-gradient(rgba(" + V.rgb + "," + (0.09 * draw * keepFrame).toFixed(3) + "), rgba(" + V.rgb + "," + (0.09 * draw * keepFrame).toFixed(3) + ")), #161719";
      const pop = prog(t, V.at + 0.18, V.at + 0.62);
      const pillOut = survivor ? outCubic(prog(t, 5.9, 6.2)) : 0;
      c.pill.style.opacity = (pop > 0 ? clamp(pop * 4) : 0) * (1 - pillOut);
      c.pill.style.transform = "scale(" + (pop > 0 ? outBack(pop) : 0.6).toFixed(4) + ")";
      c.pct.textContent = Math.round(V.pct * outCubic(prog(t, V.at + 0.18, V.at + 0.8))) + "%";
    }
  }

  // ----- copy: headline, then the kinetic verdict words -----
  const rise = (node, tin, tout, dist = 140) => {
    const pin = outExpo(prog(t, tin, tin + 0.55));
    const pout = inExpo(prog(t, tout, tout + 0.32));
    node.style.transform = "translateY(" + ((1 - pin) * dist - pout * dist) + "px)";
  };
  rise(head1, 0.15, 2.25); rise(head2, 0.32, 2.3);
  rise(label, 2.5, 5.85, 60);
  const times = Object.values(VERDICTS).map((v) => v.at);
  words.forEach((w, i) => rise(w.n, times[i], i < 3 ? times[i + 1] - 0.05 : 5.8, 200));

  // ----- the morph: neighbours collapse into the icon -----
  const hold = iconRects(960, 540, 380);
  const settle = inOutCubic(prog(t, 8.45, 9.25));
  // During the hold, the lockup pushes in slowly and settles before the chips land.
  const drift = lerp(1, 1.05, inOutCubic(prog(t, 9.25, CHIPS - 0.1)));
  const lockup = iconRects(960, lerp(540, 330, settle), lerp(380, 220, settle) * drift);
  const target = settle > 0 ? lockup : hold;
  const cardRect = (k) => ({ x: FX, y: TOP0 + k * PITCH, w: CW, h: CH, r: 22 });
  const show = inMorph ? 1 : 0;
  [barTop, barBottom, innerBar, frameShape].forEach((n) => { n.style.opacity = show; });
  if (inMorph) {
    const p = settle > 0 ? 1 : morph;
    setRect(barTop, mixRect(cardRect(0), target.top, p));
    setRect(barBottom, mixRect(cardRect(2), target.bottom, p));
    barTop.style.background = barBottom.style.background = mixColor([22, 23, 25], [74, 74, 74], p);
    const line = cards.find((c) => c.k === 1).lines[0];
    setRect(innerBar, mixRect({ x: FX + 104, y: TOP0 + PITCH + line.top, w: line.width, h: 14, r: 7 }, target.inner, p));
    innerBar.style.background = mixColor([68, 70, 75], [236, 236, 236], p);
    const F = mixRect({ x: FX - 4, y: TOP0 + PITCH - 4, w: CW + 8, h: CH + 8, r: 24 }, target.frame, p);
    const stroke = lerp(5, 7 * target.u, p);
    // The frame is drawn as a border, so offset by half the stroke to match the SVG.
    setRect(frameShape, { x: F.x - stroke / 2, y: F.y - stroke / 2, w: F.w + stroke, h: F.h + stroke, r: F.r + stroke / 2 });
    frameShape.style.borderWidth = stroke + "px";
    frameShape.style.background = "rgba(245,166,35," + (0.09 * (1 - p)).toFixed(3) + ")";
  }
  const tileIn = prog(t, 7.2, 7.85);
  tile.style.opacity = outCubic(clamp(tileIn * 2));
  const tileScale = tileIn > 0 ? outBack(tileIn, 1.6) : 0.5;
  const T = target.tile;
  tile.style.transform = "translate(" + T.x + "px," + T.y + "px) scale(" + tileScale.toFixed(4) + ")";
  tile.style.width = T.w + "px"; tile.style.height = T.h + "px"; tile.style.borderRadius = T.r + "px";
  // Glow and ring pulses from the icon.
  const icx = 960, icy = lerp(540, 330, settle);
  const glowP = prog(t, 7.4, 8.6);
  const glowEnd = prog(t, FINAL + 0.7, DURATION);
  // After the impact the glow breathes once per bar, in time with the score.
  const breathe = t > 8.6 ? 0.1 * Math.sin((2 * Math.PI * (t - 8.6)) / (4 * BEAT)) : 0;
  glow.style.opacity = (Math.sin(Math.PI * clamp(glowP)) * 0.9 + (t > 8.6 ? 0.35 + breathe + 0.25 * Math.sin(Math.PI * glowEnd) : 0)).toFixed(3);
  glow.style.transform = "translate(" + (icx - 700) + "px," + (icy - 700) + "px)";
  [[7.85, 0], [FINAL, 1]].forEach(([at, i]) => {
    const p = prog(t, at, at + 1.0);
    const radius = lerp(120, 900, outCubic(p));
    rings[i].style.opacity = p > 0 && p < 1 ? (0.55 * (1 - p)).toFixed(3) : 0;
    rings[i].style.width = rings[i].style.height = radius * 2 + "px";
    rings[i].style.transform = "translate(" + (icx - radius) + "px," + (icy - radius) + "px)";
  });

  // ----- wordmark, tagline, proof chips -----
  wordmark.style.transform = "translateY(470px) scale(" + drift.toFixed(4) + ")";
  letters.forEach((span, i) => {
    const p = outExpo(prog(t, 8.975 + i * 0.035, 8.975 + i * 0.035 + 0.6));
    span.style.opacity = p;
    span.style.transform = "translateY(" + ((1 - p) * 90).toFixed(2) + "px)";
    span.style.filter = p < 1 ? "blur(" + ((1 - p) * 16).toFixed(2) + "px)" : "none";
  });
  const tagIn = outExpo(prog(t, 9.85, 10.5)), tagOut = inExpo(prog(t, CHIPS - 0.3, CHIPS + 0.05));
  tagline.style.top = "680px";
  tagline.style.opacity = tagIn * (1 - tagOut);
  tagline.style.transform = "translateY(" + ((1 - tagIn) * 30 - tagOut * 24) + "px)";
  chipRow.style.top = "700px";
  chips.forEach((chip, i) => {
    const at = CHIPS + i * BEAT;
    const p = prog(t, at, at + 0.5);
    chip.style.opacity = clamp(p * 5);
    chip.style.transform = "scale(" + (p > 0 ? lerp(1.55, 1, outBack(p, 2.2)) : 1.55).toFixed(4) + ")";
    const flash = 1 - outCubic(prog(t, at, at + 0.5));
    chip.style.borderColor = mixColor([45, 46, 50], [245, 166, 35], p > 0 ? flash : 0);
  });
  const foot = outExpo(prog(t, FINAL + 0.15, FINAL + 0.8));
  footer.style.top = "880px";
  footer.style.opacity = foot;
  footer.style.transform = "translateY(" + ((1 - foot) * 20) + "px)";
};
window.seek(0, 0);
</script></body></html>`;

const frames = await mkdtemp(join(tmpdir(), "reel-frames-"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent(scene, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // REEL_STILLS="1.2,3.4" renders only those timestamps, to check the storyboard quickly.
  if (process.env.REEL_STILLS) {
    for (const t of process.env.REEL_STILLS.split(",").map(Number)) {
      await page.evaluate(([time, i]) => window.seek(time, i), [t, Math.round(t * FPS)]);
      await page.screenshot({ path: join(process.env.REEL_STILLS_DIR || frames, `still-${t.toFixed(2)}.png`) });
    }
    await browser.close();
    process.exit(0);
  }
  const total = Math.round(DURATION * FPS);
  for (let i = 0; i < total; i += 1) {
    await page.evaluate(([t, i]) => window.seek(t, i), [i / FPS, i]);
    await page.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 94 });
  }
} finally {
  await browser.close();
}
const output = process.env.REEL_OUT || join(project, "store", "promo.mp4");
const score = join(frames, "score.wav");
renderMusic(score, DURATION);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%04d.jpg"), "-i", score,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", output]);
await rm(frames, { recursive: true, force: true });
console.log(`Promo reel written to ${output}.`);
