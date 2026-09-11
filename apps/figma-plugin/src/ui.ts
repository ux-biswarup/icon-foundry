import { intentToSpec, parseIntentKeywords } from "@icon-foundry/icon-ai";
import { compose } from "@icon-foundry/icon-composer";
import { builtInLanguages, type IconLanguage, type IconStyle } from "@icon-foundry/icon-language";
import { renderSvg } from "@icon-foundry/icon-renderer";
import { parseIconSpec, type IconSpec } from "@icon-foundry/icon-spec";
import { builtInRules, validateIconSpec, type ValidationResult } from "@icon-foundry/icon-validator";
import type { MainToUiMessage, UiToMainMessage } from "./messages.js";

/**
 * Plugin UI. Everything here runs the deterministic core in the browser
 * iframe; the sandbox (main.ts) only receives a finished SVG.
 */

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const descriptionEl = $<HTMLInputElement>("description");
const languageEl = $<HTMLSelectElement>("language");
const previewEl = $("preview");
const checksEl = $("checks");
const errorEl = $("error");
const specEl = $<HTMLTextAreaElement>("spec");
const createBtn = $<HTMLButtonElement>("create");

interface State {
  spec: IconSpec | undefined;
  language: IconLanguage;
  svg: string | undefined;
  result: ValidationResult | undefined;
}

const languages = Object.values(builtInLanguages);
for (const lang of languages) {
  const option = document.createElement("option");
  option.value = lang.id;
  option.textContent = `${lang.name} v${lang.version}`;
  languageEl.append(option);
}

const state: State = { spec: undefined, language: languages[0]!, svg: undefined, result: undefined };

function selectedStyle(): IconStyle {
  const checked = document.querySelector<HTMLInputElement>('input[name="style"]:checked');
  return checked?.value === "filled" ? "filled" : "outline";
}

function post(message: UiToMainMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function showError(message: string): void {
  errorEl.textContent = message;
}

function render(spec: IconSpec): void {
  const language = state.language;
  const result = validateIconSpec(spec, language);
  state.spec = spec;
  state.result = result;

  if (result.issues.some((i) => i.rule === "compose")) {
    state.svg = undefined;
    previewEl.innerHTML = '<span class="muted">Cannot compose this spec.</span>';
  } else {
    const svg = renderSvg(compose(spec, language), language);
    state.svg = svg;
    previewEl.innerHTML = `<div class="lg">${svg}</div><div class="sm">${svg}</div>`;
  }

  checksEl.innerHTML = "";
  for (const rule of builtInRules) {
    const issues = result.issues.filter((i) => i.rule === rule.id);
    const li = document.createElement("li");
    if (issues.length === 0) {
      li.className = "ok";
      li.textContent = `✓ ${rule.label}`;
    } else {
      const worst = issues.some((i) => i.severity === "error") ? "error" : "warning";
      li.className = worst;
      li.textContent = `${worst === "error" ? "✕" : "⚠"} ${rule.label}: ${issues.map((i) => i.message).join(" ")}`;
    }
    checksEl.append(li);
  }
  for (const issue of result.issues.filter((i) => i.rule === "compose")) {
    const li = document.createElement("li");
    li.className = "error";
    li.textContent = `✕ ${issue.message}`;
    checksEl.prepend(li);
  }

  specEl.value = JSON.stringify(spec, null, 2);
  createBtn.disabled = !(result.valid && state.svg);
  showError("");
}

function generate(): void {
  const text = descriptionEl.value.trim();
  if (!text) {
    showError("Describe the icon first.");
    return;
  }
  try {
    const intent = parseIntentKeywords(text);
    intent.style = selectedStyle();
    render(intentToSpec(intent, state.language));
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

function applySpec(): void {
  try {
    const parsed = parseIconSpec(JSON.parse(specEl.value));
    render(parsed);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

$("generate").addEventListener("click", generate);
descriptionEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") generate();
});
$("apply").addEventListener("click", applySpec);
$("cancel").addEventListener("click", () => post({ type: "cancel" }));

languageEl.addEventListener("change", () => {
  state.language = builtInLanguages[languageEl.value] ?? languages[0]!;
  if (state.spec) render({ ...state.spec, language: state.language.id, canvas: state.language.canvas });
});

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="style"]')) {
  radio.addEventListener("change", () => {
    if (state.spec) render({ ...state.spec, style: selectedStyle() });
  });
}

createBtn.addEventListener("click", () => {
  if (!state.spec || !state.svg || !state.result?.valid) return;
  const { id, name, version } = state.language;
  post({
    type: "create-component",
    svg: state.svg,
    name: state.spec.name,
    canvas: state.spec.canvas,
    style: state.spec.style ?? state.language.style.default,
    language: { id, name, version },
    spec: JSON.stringify(state.spec),
  });
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: MainToUiMessage }>) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === "error") showError(msg.message);
};
