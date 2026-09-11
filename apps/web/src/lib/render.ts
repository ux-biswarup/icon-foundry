import { compose } from "@icon-foundry/icon-composer";
import type { Library } from "@icon-foundry/icon-library";
import { renderSvg } from "@icon-foundry/icon-renderer";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec, type ValidationResult } from "@icon-foundry/icon-validator";

export interface Rendered {
  svg: string | undefined;
  validation: ValidationResult;
}

/** Validate and render with the library's vocabulary. Never throws. */
export function renderSpec(spec: IconSpec, library: Library): Rendered {
  const registry = library.registry();
  const validation = validateIconSpec(spec, library.language, { registry });
  const svg = validation.issues.some((i) => i.rule === "compose")
    ? undefined
    : renderSvg(compose(spec, library.language, { registry }), library.language);
  return { svg, validation };
}

export function downloadText(name: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
