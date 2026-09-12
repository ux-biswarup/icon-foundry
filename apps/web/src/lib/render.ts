import { compose } from "@icon-foundry/icon-composer";
import type { IconLanguage } from "@icon-foundry/icon-language";
import type { Library } from "@icon-foundry/icon-library";
import type { PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { renderSvg } from "@icon-foundry/icon-renderer";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec, type ValidationResult } from "@icon-foundry/icon-validator";

export interface Rendered {
  svg: string | undefined;
  validation: ValidationResult;
}

/**
 * Validate and render a spec under a given language. Never throws: a spec that
 * cannot be composed comes back with `svg: undefined` and the reason in
 * `validation`, which is what the studio shows while a language is being edited.
 */
export function renderWithLanguage(
  spec: IconSpec,
  language: IconLanguage,
  registry?: PrimitiveRegistry,
  onDark = false,
): Rendered {
  const options = registry ? { registry } : {};
  const validation = validateIconSpec(spec, language, options);
  // Validation never sees the ground. A grade is a correction for the eye, and
  // an icon must not pass on white and fail on black.
  const svg = validation.issues.some((i) => i.rule === "compose")
    ? undefined
    : renderSvg(compose(spec, language, options), language, { onDark });
  return { svg, validation };
}

/** Validate and render with the library's own vocabulary and the icon's language. */
export function renderSpec(spec: IconSpec, library: Library, onDark = false): Rendered {
  return renderWithLanguage(spec, library.languageFor(spec), library.registry(), onDark);
}

export function downloadBytes(name: string, bytes: Uint8Array, type = "application/octet-stream"): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(name: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
