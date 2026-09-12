/**
 * Production server: static files from dist/ plus the agent API.
 *   pnpm --filter @icon-foundry/web build && pnpm --filter @icon-foundry/web start
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { createAgentHandler } from "./agent.js";
import { createHandHandler } from "./hand.js";

const dist = new URL("../dist/", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 5180);
const agent = createAgentHandler(process.env);
const hand = createHandHandler(process.env);
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/agent")) {
    void agent(req, res);
    return;
  }
  if (url.pathname.startsWith("/api/hand")) {
    void hand(req, res);
    return;
  }
  let file = join(dist, normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Icon Foundry web on http://localhost:${port}`));
