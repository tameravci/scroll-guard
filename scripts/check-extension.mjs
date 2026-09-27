import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const manifestPath = resolve(projectRoot, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

function requireFile(relativePath) {
  const fullPath = resolve(projectRoot, relativePath);
  try {
    if (!statSync(fullPath).isFile()) {
      failures.push(`${relativePath} is not a file`);
    }
  } catch {
    failures.push(`${relativePath} is missing`);
  }
}

if (manifest.manifest_version !== 3) {
  failures.push("manifest_version must be 3");
}
if (JSON.stringify(manifest.permissions) !== JSON.stringify(["storage"])) {
  failures.push("The extension must request only the storage permission");
}
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["https://api.typesafe.ai/*"])) {
  failures.push("Only the TypeSafe API host permission is allowed");
}
requireFile(manifest.background.service_worker);

for (const script of manifest.content_scripts?.flatMap((entry) => entry.js || []) || []) {
  requireFile(script);
}
for (const stylesheet of manifest.content_scripts?.flatMap((entry) => entry.css || []) || []) {
  requireFile(stylesheet);
}
requireFile(manifest.action.default_popup);
requireFile(manifest.options_page);
for (const iconPath of Object.values(manifest.icons || {})) {
  requireFile(iconPath);
}

const javascriptFiles = [
  "scripts/check-extension.mjs",
  "scripts/generate-icons.mjs",
  "scripts/package-extension.mjs",
  "scripts/serve-browser-fixture.mjs",
  "scripts/store-assets.mjs",
  "scripts/store-video.mjs",
  "scripts/test-jev-live.mjs",
  "scripts/test-jev-browser.mjs",
  "src/jev.js",
  "src/key-store.js",
  "src/panel.js",
  "src/scheduler.js",
  "src/jev-content.js",
  "src/background.js",
  "src/storage.js",
  "src/x-adapter.js",
  "src/ui.js",
  "src/content.js",
  "popup/popup.js",
  "options/options.js",
  "tests/jev.test.js",
  "tests/run-tests.js",
  "tests/scheduler.test.js",
  "tests/storage.test.js",
  "tests/x-adapter.test.js"
];

for (const relativePath of javascriptFiles) {
  requireFile(relativePath);
  const checked = spawnSync(process.execPath, ["--check", resolve(projectRoot, relativePath)], {
    encoding: "utf8"
  });
  if (checked.status !== 0) {
    failures.push(`${relativePath} failed syntax check:\n${checked.stderr.trim()}`);
  }
}

const htmlFiles = ["popup/popup.html", "options/options.html"];
for (const relativePath of htmlFiles) {
  const html = readFileSync(resolve(projectRoot, relativePath), "utf8");
  if (/<script[^>]+src=["']https?:/iu.test(html)) {
    failures.push(`${relativePath} loads remote code`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Manifest, referenced files, permissions, local-code policy, and JavaScript syntax passed.");
