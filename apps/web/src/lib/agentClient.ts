import { createIcon, type AgentResult, type Brief } from "@icon-foundry/icon-agent";
import type { Library } from "@icon-foundry/icon-library";

export interface AgentStatus {
  model: string | null;
  error: string | null;
  reachable: boolean;
}

export async function agentStatus(): Promise<AgentStatus> {
  try {
    const res = await fetch("/api/agent");
    if (!res.ok) return { model: null, error: null, reachable: false };
    const body = (await res.json()) as { model: string | null; error: string | null };
    return { ...body, reachable: true };
  } catch {
    return { model: null, error: null, reachable: false };
  }
}

/** Use the server agent when a model is configured; otherwise plan in the browser. */
export async function requestCandidates(brief: Brief, library: Library, status: AgentStatus): Promise<AgentResult> {
  if (status.reachable && status.model) {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief, files: await library.snapshot() }),
    });
    const body = (await res.json()) as AgentResult | { error: string };
    if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `agent request failed (${res.status})`);
    return body;
  }
  return createIcon({ brief, library });
}
