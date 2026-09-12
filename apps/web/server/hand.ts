import type { IncomingMessage, ServerResponse } from "node:http";
import { adjustHand, type AgentModel } from "@icon-foundry/icon-agent";
import { createModel, modelConfigFromEnv } from "@icon-foundry/icon-agent/providers";
import { Library, MemoryStore } from "@icon-foundry/icon-library";

/**
 * POST /api/hand   { request, languageId, files }  → HandResult
 *
 * The second route, and it exists for the same reason as the first: the key
 * stays on this side. The browser sends a snapshot of the folder, the server
 * holds no state, and nothing is written — the answer is a set of proposed
 * trait values that a person reviews on the canvas before saving.
 */
export function createHandHandler(env: Record<string, string | undefined>) {
  let model: AgentModel | undefined;
  try {
    const config = modelConfigFromEnv(env);
    if (config) model = createModel(config);
  } catch {
    // No model is a supported state: the panel reports the traits and nothing more.
  }

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "POST") {
      json(res, 405, { error: "method not allowed" });
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        request: string;
        languageId?: string;
        files: Record<string, string>;
      };
      const library = await Library.open(new MemoryStore(body.files));
      const language = body.languageId ? library.getLanguage(body.languageId) : library.language;
      const result = await adjustHand({
        request: body.request,
        language,
        registry: library.registry(),
        ...(model && { model }),
      });
      json(res, 200, result);
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}
