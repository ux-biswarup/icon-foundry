import { adjustHand, createIcon, type AgentResult, type Brief, type HandResult } from "@icon-foundry/icon-agent";
import type { IconLanguage } from "@icon-foundry/icon-language";
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

/**
 * Ask for a change to how parts are built, in words.
 *
 * Falls back to running in the browser with no model, which is not a
 * degradation so much as the honest half: the panel still reports every trait,
 * its range, and which parts it reaches. Only the suggestions need a key.
 */
export async function requestHandChange(
  request: string,
  language: IconLanguage,
  library: Library,
  status: AgentStatus,
): Promise<HandResult> {
  if (status.reachable && status.model) {
    const res = await fetch("/api/hand", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, languageId: language.id, files: await library.snapshot() }),
    });
    const body = (await res.json()) as HandResult | { error: string };
    if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : `request failed (${res.status})`);
    return body;
  }
  return adjustHand({ request, language, registry: library.registry() });
}
