import type { IncomingMessage, ServerResponse } from "node:http";
import { createIcon, type AgentModel, type Brief } from "@icon-foundry/icon-agent";
import { createModel, modelConfigFromEnv } from "@icon-foundry/icon-agent/providers";
import { Library, MemoryStore } from "@icon-foundry/icon-library";

/**
 * POST /api/agent   { brief, files }  → AgentResult
 * GET  /api/agent   → { model: string | null }
 *
 * The browser sends a snapshot of the library folder with each request, so
 * the server holds no state and no keys ever leave it.
 */
export function createAgentHandler(env: Record<string, string | undefined>) {
  let model: AgentModel | undefined;
  let configError: string | undefined;
  try {
    const config = modelConfigFromEnv(env);
    if (config) model = createModel(config);
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === "GET") {
      json(res, 200, { model: model?.id ?? null, error: configError ?? null });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { error: "method not allowed" });
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { brief: Brief; files: Record<string, string> };
      const library = await Library.open(new MemoryStore(body.files));
      const result = await createIcon({ brief: body.brief, library, ...(model && { model }) });
      json(res, 200, result);
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}
