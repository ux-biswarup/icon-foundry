import type { MainToUiMessage, Payload, PlannedChange, UiToMainMessage } from "./messages.js";

/**
 * Connect, check, sync, inspect. There is deliberately no way to draw an icon
 * here: the studio owns authoring, and a second authoring surface is how a set
 * ends up with two of everything.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const payloadEl = $<HTMLTextAreaElement>("payload");
const errorEl = $("error");
const planEl = $("plan");
const countsEl = $("counts");
const changesEl = $("changes");
const syncBtn = $<HTMLButtonElement>("sync");
const inspectEl = $("inspect");

let payload: Payload | undefined;

const post = (message: UiToMainMessage): void => parent.postMessage({ pluginMessage: message }, "*");
const showError = (text: string): void => {
  errorEl.textContent = text;
};

function readPayload(): Payload | undefined {
  const text = payloadEl.value.trim();
  if (!text) {
    showError("Paste the set first. In the studio: Library, then Copy for Figma.");
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Payload).icons) ||
      typeof (parsed as Payload).library !== "string"
    ) {
      showError("That is valid JSON but not a set from the studio.");
      return undefined;
    }
    showError("");
    return parsed as Payload;
  } catch {
    showError("That is not valid JSON.");
    return undefined;
  }
}

$("check").addEventListener("click", () => {
  payload = readPayload();
  if (payload) post({ type: "plan", payload });
});

syncBtn.addEventListener("click", () => {
  if (payload) post({ type: "sync", payload });
});

$("cancel").addEventListener("click", () => post({ type: "cancel" }));

function renderPlan(changes: PlannedChange[], pageName: string): void {
  planEl.hidden = false;
  const count = (kind: PlannedChange["kind"]) => changes.filter((c) => c.kind === kind).length;
  const parts: Array<[string, number]> = [
    ["new", count("new")],
    ["changed", count("changed")],
    ["deprecated", count("deprecated")],
    ["unchanged", count("unchanged")],
  ];
  countsEl.innerHTML = parts
    .map(([label, n]) => `<div><b>${n}</b><span class="muted">${label}</span></div>`)
    .join("");

  const willWrite = count("new") + count("changed");
  syncBtn.disabled = willWrite === 0;
  syncBtn.textContent = willWrite === 0 ? "Nothing to sync" : `Sync ${willWrite} into ${pageName}`;

  changesEl.innerHTML = changes
    .filter((c) => c.kind !== "unchanged")
    .map((c) => `<li><span>${c.name}</span><span class="kind ${c.kind}">${c.kind}</span></li>`)
    .join("");
}

window.onmessage = (event: MessageEvent<{ pluginMessage?: MainToUiMessage }>) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  switch (msg.type) {
    case "planned":
      renderPlan(msg.changes, msg.pageName);
      return;
    case "synced":
      showError("");
      countsEl.innerHTML = `<div><b>${msg.created}</b><span class="muted">created</span></div><div><b>${msg.updated}</b><span class="muted">updated in place</span></div>`;
      changesEl.innerHTML = "";
      syncBtn.disabled = true;
      syncBtn.textContent = "Synced";
      return;
    case "inspected":
      inspectEl.innerHTML = msg.found
        ? `<dl>
             <dt>Icon</dt><dd>${msg.name ?? ""}</dd>
             <dt>Library</dt><dd>${msg.library ?? ""}</dd>
             <dt>Language</dt><dd>${msg.language ?? ""}</dd>
             ${msg.concept ? `<dt>Concept</dt><dd>${msg.concept}</dd>` : ""}
             ${msg.codepoint ? `<dt>Codepoint</dt><dd>${msg.codepoint}</dd>` : ""}
             <dt>Synced</dt><dd>${msg.syncedAt ? new Date(msg.syncedAt).toLocaleString() : "unknown"}</dd>
           </dl>`
        : '<span class="muted">Nothing selected, or the selection did not come from a library.</span>';
      return;
    case "error":
      showError(msg.message);
      return;
  }
};
