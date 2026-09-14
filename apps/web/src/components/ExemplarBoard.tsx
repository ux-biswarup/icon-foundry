import type { IconLanguage } from "@icon-foundry/icon-language";
import type { PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { useMemo } from "react";
import { renderWithLanguage } from "../lib/render.js";
import { useGround } from "../lib/theme.js";
import { IconSvg } from "./IconSvg.js";

/**
 * The exemplar set, rendered under whatever language is currently being
 * edited. It is on screen the whole time a language is open, because a token
 * should be chosen by looking at icons rather than by typing a number.
 *
 * True size first: the row a designer judges is the one at the language's own
 * canvas, not the zoomed one. It draws on whichever ground the app is in, so a
 * grade shows up here the moment the theme is switched.
 */
export function ExemplarBoard({
  exemplars,
  language,
  registry,
  compareWith,
}: {
  exemplars: IconSpec[];
  language: IconLanguage;
  registry?: PrimitiveRegistry;
  /** When given, each exemplar is shown before and after, for a publish diff. */
  compareWith?: IconLanguage;
}) {
  const ground = useGround();
  const onDark = ground === "dark";
  const rendered = useMemo(
    () =>
      exemplars.map((spec) => ({
        spec,
        after: renderWithLanguage(spec, language, registry, onDark),
        before: compareWith ? renderWithLanguage(spec, compareWith, registry, onDark) : undefined,
      })),
    [exemplars, language, registry, compareWith, onDark],
  );

  // The second row is the language's own smallest size, which is where a
  // detail either survives or does not.
  const smallest = Math.min(...Object.keys(language.sizes).map(Number));
  const broken = rendered.filter((r) => !r.after.svg);
  const changed = rendered.filter((r) => r.before && r.before.svg !== r.after.svg);

  if (exemplars.length === 0) {
    return (
      <div className="exemplar-board empty">
        <p className="muted">
          This language has no reference icons yet. They are what the controls are judged against, so add a few from the
          library once you have some.
        </p>
      </div>
    );
  }

  return (
    <div className="exemplar-board">
      <div className="board-head">
        <h3>Reference icons</h3>
        <span className="muted small-text">
          {compareWith
            ? `${changed.length} of ${rendered.length} change`
            : smallest === language.defaultCanvas
              ? `${rendered.length} icons at ${language.defaultCanvas}px, on ${ground}`
              : `${rendered.length} icons at ${language.defaultCanvas}px and ${smallest}px, on ${ground}`}
        </span>
      </div>

      {broken.length > 0 && (
        <p className="error-text">
          {broken.length} no longer fit this language: {broken.map((b) => b.spec.name).join(", ")}.
        </p>
      )}

      <div className={`swatch ${ground} board-row`}>
        {rendered.map(({ spec, after }) => (
          <IconSvg key={spec.name} svg={after.svg} size={spec.canvas} title={spec.name} />
        ))}
      </div>
      {/* The second row was the same icons on the other ground. The theme
          control does that now, so this row earns its place only when it shows
          a size the first one does not. */}
      {smallest !== language.defaultCanvas && (
        <div className={`swatch ${ground} board-row`}>
          {rendered.map(({ spec, after }) => (
            <IconSvg key={spec.name} svg={after.svg} size={smallest} title={`${spec.name} at ${smallest}px`} />
          ))}
        </div>
      )}

      <div className="exemplar-grid">
        {rendered.map(({ spec, after, before }) => (
          <figure key={spec.name} className={before && before.svg !== after.svg ? "changed" : ""}>
            <div className="pair">
              {before && (
                <div className={`swatch ${ground}`}>
                  <IconSvg svg={before.svg} size={64} />
                </div>
              )}
              <div className={`swatch ${ground}`}>
                <IconSvg svg={after.svg} size={64} />
              </div>
            </div>
            <figcaption>
              {spec.name}
              {typeof spec.meta?.description === "string" && <span className="muted"> — {spec.meta.description}</span>}
              {after.validation.issues.length > 0 && (
                <span className="warn-text"> ⚠ {after.validation.issues.map((i) => i.rule).join(", ")}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
