// Renders icons/icon.svg (and any icon-<size>.svg override) to the PNG sizes Chrome
// needs, using Playwright's Chromium.
import { readFileSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const sizes = [16, 32, 48, 128];
const iconDirectory = new URL("../icons/", import.meta.url);
const source = (name) => readFileSync(new URL(name, iconDirectory), "utf8");
// Small sizes can have their own simplified drawing (icons/icon-16.svg).
const svgFor = (size) => {
  try { return source(`icon-${size}.svg`); } catch { return source("icon.svg"); }
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svgFor(size).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: new URL(`icon-${size}.png`, iconDirectory).pathname, omitBackground: true });
  }
} finally {
  await browser.close();
}
console.log(`Rendered ${sizes.join(", ")} px icons from icons/icon.svg.`);
