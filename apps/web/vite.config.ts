import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * The agent runs server-side so model keys never reach the browser. In dev it
 * is a Vite middleware loaded through Vite's own module runner (so workspace
 * TypeScript sources resolve); `server/index.ts` serves the same handler in
 * production.
 */
function agentApi(env: Record<string, string>): Plugin {
  return {
    name: "icon-foundry-agent-api",
    configureServer(server) {
      const handlerPromise = server
        .ssrLoadModule("/server/agent.ts")
        .then((mod) => (mod as { createAgentHandler: (e: Record<string, string>) => AgentHandler }).createAgentHandler(env));
      server.middlewares.use("/api/agent", (req, res) => {
        void handlerPromise.then((handler) => handler(req, res)).catch((error: unknown) => {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        });
      });
    },
  };
}

type AgentHandler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), agentApi(env)],
    server: { port: 5180 },
  };
});
