import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * The agent runs server-side so model keys never reach the browser. In dev it
 * is a Vite middleware loaded through Vite's own module runner (so workspace
 * TypeScript sources resolve); `server/index.ts` serves the same handler in
 * production.
 */
function serverApi(env: Record<string, string>): Plugin {
  /** One middleware per route, each loading its handler through Vite's module
   * runner so workspace TypeScript sources resolve without a build step. */
  const routes: Array<[string, string, string]> = [
    ["/api/agent", "/server/agent.ts", "createAgentHandler"],
    ["/api/hand", "/server/hand.ts", "createHandHandler"],
  ];
  return {
    name: "icon-foundry-api",
    configureServer(server) {
      for (const [path, module, factory] of routes) {
        const handlerPromise = server
          .ssrLoadModule(module)
          .then((mod) => (mod as Record<string, (e: Record<string, string>) => AgentHandler>)[factory]!(env));
        server.middlewares.use(path, (req, res) => {
          void handlerPromise.then((handler) => handler(req, res)).catch((error: unknown) => {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          });
        });
      }
    },
  };
}

type AgentHandler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), serverApi(env)],
    server: { port: 5180 },
  };
});
