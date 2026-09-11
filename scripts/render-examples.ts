/**
 * Render every example IconSpec to SVG and print the validation summary.
 *
 *   pnpm examples
 *
 * Output goes to examples/out/ (git-ignored) with an index.html contact sheet.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { compose } from "@icon-foundry/icon-composer";
import { getBuiltInLanguage } from "@icon-foundry/icon-language";
import { defaultRegistry, definePathPrimitive } from "@icon-foundry/icon-primitives";
import { renderSvg } from "@icon-foundry/icon-renderer";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec } from "@icon-foundry/icon-validator";

const root = new URL("../examples/", import.meta.url).pathname;
const out = join(root, "out");
mkdirSync(out, { recursive: true });

// User-defined elements extend the built-in vocabulary.
const elementsDir = join(root, "elements");
const registry = defaultRegistry.extend(
  readdirSync(elementsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => definePathPrimitive(JSON.parse(readFileSync(join(elementsDir, f), "utf8")))),
);

const files = [
  ...readdirSync(root).filter((f) => f.endsWith(".json")).map((f) => join(root, f)),
  ...readdirSync(join(root, "invalid")).filter((f) => f.endsWith(".json")).map((f) => join(root, "invalid", f)),
];

const cards: string[] = [];
let failures = 0;

for (const file of files) {
  const spec = parseIconSpec(JSON.parse(readFileSync(file, "utf8")));
  const language = getBuiltInLanguage(spec.language);
  const result = validateIconSpec(spec, language, { registry });
  const svg = result.issues.some((i) => i.rule === "compose") ? "" : renderSvg(compose(spec, language, { registry }), language);
  if (svg) writeFileSync(join(out, `${spec.name}.svg`), svg);

  const status = result.valid ? "valid" : "INVALID";
  if (!result.valid) failures++;
  console.log(`${status.padEnd(8)} ${basename(file).padEnd(36)} ${String(spec.canvas).padStart(2)}px issues=${result.issues.length}`);
  for (const issue of result.issues) console.log(`         ${issue.severity.padEnd(7)} ${issue.rule.padEnd(12)} ${issue.message}`);

  cards.push(`<figure class="${result.valid ? "ok" : "bad"}">
  <div class="lg">${svg}</div><div class="sm">${svg}</div>
  <figcaption><strong>${spec.name}</strong><br/>${status} · ${result.issues.length} issue(s)</figcaption>
</figure>`);
}

writeFileSync(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Icon Foundry examples</title>
<style>
body{font:13px system-ui;margin:24px;color:#111}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
figure{margin:0;padding:12px;border:1px solid #ddd;border-radius:8px;text-align:center}
figure.bad{border-color:#e55}
.lg svg{width:96px;height:96px}.sm svg{width:24px;height:24px;margin-top:8px}
</style><h1>Icon Foundry examples</h1><main>${cards.join("\n")}</main>`,
);

console.log(`\nWrote ${files.length} example(s) to ${out} (${failures} intentionally invalid).`);
