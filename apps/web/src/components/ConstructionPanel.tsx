import {
  CONSTRUCTION_TRAITS,
  DEFAULT_CONSTRUCTION,
  TRAIT_CONSUMERS,
  deriveTokens,
  type ApertureStyle,
  type Construction,
  type ConstructionTrait,
  type IconCharacter,
  type SlopeStyle,
} from "@icon-foundry/icon-language";
import type { PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import type { Derivation } from "@icon-foundry/icon-language";
import { Field, Lands, NumberField } from "./LanguageFields.js";

/**
 * The construction traits: how a part is built, as opposed to how big it is.
 *
 * Two things this panel has to do that a list of sliders would not. It says how
 * many parts each control reaches and lets you point at them, because a shared
 * control nobody can scope is a control nobody trusts. And it distinguishes a
 * value you set from a value the axes proposed, using the same words as the
 * size tokens: absent means derived, present means an override.
 */

interface Meta {
  label: string;
  hint: string;
  /** Attested independently by two published icon systems, rather than ours. */
  attested?: boolean;
}

const META: Record<ConstructionTrait, Meta> = {
  interiorRadius: {
    label: "Interior corners",
    hint: "How much of the exterior radius a corner inside the silhouette takes. Zero is square, which is what both Google and IBM specify; one follows the outline.",
    attested: true,
  },
  grade: {
    label: "Grade on dark",
    hint: "Thinning applied only on a dark ground, as a share of stroke width. A light shape on a dark ground reads heavier than the same shape inverted.",
    attested: true,
  },
  aperture: {
    label: "How an opening is drawn",
    hint: "Mixed is not a style, it is an unmade decision: your parts currently answer this more than one way and each keeps its own answer.",
  },
  inset: {
    label: "Interior inset",
    hint: "How far detail sits from the contour it is inside. One leaves every part at the inset it was drawn with.",
  },
  accentSize: {
    label: "Accent size",
    hint: "The signature round part: a head, a wheel, the dot of a pin. One leaves every part as drawn.",
  },
  slope: {
    label: "Slope of a plane",
    hint: "The pitch of a sloping or receding face. A value here can break a metaphor, so watch the whole set rather than the number.",
  },
};

const APERTURES: ApertureStyle[] = ["mixed", "line", "outline", "notch"];
const SLOPES: SlopeStyle[] = ["mixed", "shallow", "iso", "45"];

export function ConstructionPanel({
  construction,
  authored,
  character,
  derivation,
  registry,
  onChange,
  onClear,
  onFocus,
}: {
  /** Fully resolved values, so a derived one shows as a real number. */
  construction: Construction;
  /** What the file actually says, so an override can be told from a proposal. */
  authored: Partial<Construction> | undefined;
  character: IconCharacter;
  derivation: Derivation;
  registry: PrimitiveRegistry;
  onChange: (next: Partial<Construction>) => void;
  onClear: (trait: ConstructionTrait) => void;
  /** Hovering a control scopes the canvas to the parts it reaches. */
  onFocus: (trait: ConstructionTrait | undefined) => void;
}) {
  const derived = deriveTokens(character, derivation, 16);

  return (
    <>
      {CONSTRUCTION_TRAITS.map((trait) => {
        const meta = META[trait];
        const manual = authored?.[trait] !== undefined;
        const consumers = registry.consumersOf(trait);
        const value = construction[trait];
        const contributions = derived[trait]?.contributions ?? [];

        return (
          <div
            key={trait}
            className="ctrl"
            onMouseEnter={() => onFocus(trait)}
            onMouseLeave={() => onFocus(undefined)}
          >
            <Field
              label={meta.label}
              hint={
                <>
                  <Lands>{meta.hint}</Lands>
                  {meta.attested && (
                    <span className="attested" title="Specified independently by two published icon systems">
                      documented craft
                    </span>
                  )}
                </>
              }
            >
              <div className="ctrl-row">
                {trait === "aperture" || trait === "slope" ? (
                  <div className="seg">
                    {(trait === "aperture" ? APERTURES : SLOPES).map((option) => (
                      <button
                        key={option}
                        className={value === option ? "on" : ""}
                        onClick={() => onChange({ [trait]: option } as Partial<Construction>)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <NumberField
                    value={value as number}
                    step={trait === "interiorRadius" || trait === "grade" ? 0.05 : 0.1}
                    min={trait === "grade" ? -1 : 0}
                    max={trait === "interiorRadius" ? 1 : trait === "grade" ? 1 : 3}
                    onChange={(n) => onChange({ [trait]: n } as Partial<Construction>)}
                  />
                )}
                <span className={`badge ${manual ? "manual" : "derived"}`}>{manual ? "set by hand" : "derived"}</span>
              </div>
            </Field>
            <p className="muted small-text affects">
              {TRAIT_CONSUMERS[trait] === "renderer" ? (
                "Applied when an icon is drawn, not by any one part."
              ) : consumers.length === 0 ? (
                "No part reads this yet."
              ) : (
                <>
                  {consumers.length} parts · <b>{consumers.slice(0, 3).join(", ")}</b>
                  {consumers.length > 3 ? " and more" : ""}
                </>
              )}
              {manual && value !== DEFAULT_CONSTRUCTION[trait] && (
                <>
                  {" · "}
                  <button className="link" onClick={() => onClear(trait)}>
                    use the proposal
                  </button>
                </>
              )}
            </p>
            {!manual && contributions.length > 0 && (
              <p className="muted small-text">
                {contributions.map((c) => `${c.axis} → ${typeof c.value === "number" ? c.value.toFixed(2) : c.value}`).join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
