import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const keyPath = process.argv[2];
const certificatePath = process.argv[3];
const port = Number(process.argv[4] || 8443);

if (!keyPath || !certificatePath) {
  console.error("Usage: node scripts/serve-browser-fixture.mjs <key> <cert> [port]");
  process.exit(1);
}

const feedFixture = readFileSync(
  resolve(new URL("..", import.meta.url).pathname, "tests/browser-fixture.html")
);
const profileFixture = readFileSync(
  resolve(new URL("..", import.meta.url).pathname, "tests/profile-fixture.html")
);

const server = createServer(
  {
    key: readFileSync(keyPath),
    cert: readFileSync(certificatePath)
  },
  (request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(request.url?.startsWith("/TemplateBot") ? profileFixture : feedFixture);
  }
);

server.listen(port, "127.0.0.1", () => {
  console.log(`Browser fixture listening on https://127.0.0.1:${port}`);
});
