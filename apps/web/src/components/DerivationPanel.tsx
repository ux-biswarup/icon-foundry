import {
  AXIS_NAMES,
  DERIVABLE,
  TOKEN_UNITS,
  type AxisEndpoints,
  type AxisName,
  type Derivation,
  type DerivableToken,
  type DerivedTokens,
  type IconCharacter,
  type StrokeCap,
  type StrokeJoin,
} from "@icon-foundry/icon-language";
import { useState } from "react";
import { AxisSlider } from "./LanguageFields.js";

const LABELS: Record<DerivableToken, string> = {
  cornerRadius: "Radius",
  maxElements: "Parts",
  maxShapes: "Shapes",
  badgeRatio: "Badge",
  strokeCap: "Caps",
  strokeJoin: "Joins",
  interiorRadius: "Interior corners",
  grade: "Grade on dark",
  aperture: "Openings",
  inset: "Interior inset",
  accentSize: "Accent",
  slope: "Slope",
};

/**
 * Whether moving this value changes the picture or changes the checks.
 *
 * Stated per token because the difference is invisible and keeps catching
 * people out: two of the four sliders move only budgets, so dragging them does
 * nothing whatsoever to the canvas in the middle. That is correct behaviour —
 * a budget is a limit on what may be drawn, not an instruction to draw — but a
 * control that looks inert and is never explained reads as broken.
 */
const AFFECTS: Record<DerivableToken, "drawing" | "what passes"> = {
  cornerRadius: "drawing",
  maxElements: "what passes",
  maxShapes: "what passes",
  badgeRatio: "drawing",
  strokeCap: "drawing",
  strokeJoin: "drawing",
  interiorRadius: "drawing",
  grade: "drawing",
  aperture: "drawing",
  inset: "drawing",
  accentSize: "drawing",
  slope: "drawing",
};

const AXIS_POLES: Record<AxisName, [string, string]> = {
  geometric: ["organic", "geometric"],
  minimal: ["expressive", "minimal"],
  technical: ["friendly", "technical"],
  literal: ["abstract", "literal"],
};

const ENUM_OPTIONS: Partial<Record<DerivableToken, readonly string[]>> = {
  strokeCap: ["butt", "round", "square"] satisfies readonly StrokeCap[],
  strokeJoin: ["miter", "round", "bevel"] satisfies readonly StrokeJoin[],
};

/** Endpoints are stored canvas-relative so one derivation works at any size;
 * a designer should still read them in the units they draw in. */
const toDisplay = (token: DerivableToken, value: number, canvas: number): number =>
  TOKEN_UNITS[token] === "canvasFraction" ? Math.round(value * canvas * 100) / 100 : value;
const fromDisplay = (token: DerivableToken, value: number, canvas: number): number =>
  TOKEN_UNITS[token] === "canvasFraction" ? value / canvas : value;

const format = (token: DerivableToken, value: number | string): string => {
  if (typeof value === "string") return value;
  if (TOKEN_UNITS[token] === "fraction") return `${Math.round(value * 100)}%`;
  return String(Math.round(value * 100) / 100);
};

/**
 * A resolved value is stored in the units the token is defined in; a ratio is
 * far easier to type as a percentage. Only fractions convert — a radius is
 * already in canvas units by the time it reaches here, because derivation
 * multiplied the canvas fraction out.
 */
const valueIn = (token: DerivableToken, value: number): number =>
  TOKEN_UNITS[token] === "fraction" ? Math.round(value * 100) : Math.round(value * 100) / 100;
const valueOut = (token: DerivableToken, shown: number): number =>
  TOKEN_UNITS[token] === "fraction" ? shown / 100 : shown;

const stepFor = (token: DerivableToken): number =>
  TOKEN_UNITS[token] === "count" ? 1 : TOKEN_UNITS[token] === "fraction" ? 1 : 0.25;

export interface Override {
  /** True when the language file states this token rather than deriving it. */
  set: boolean;
  value: number | string | undefined;
  clear: () => void;
  /** Type a value here and the token stops being derived. */
  write: (value: number | string) => void;
}

/**
 * Personality, led by the value rather than by the slider.
 *
 * The earlier version put four sliders first and a table of consequences
 * underneath, which got the hierarchy backwards: the slider is the input, but
 * the value is the thing a designer is actually deciding, and it is the value
 * they need to see, type, and override. So the values are the fields here, and
 * the sliders sit beneath as the source that feeds them.
 *
 * The override rule — absent means derived, present means an override — used to
 * be a paragraph of prose. It is now a dot: filled when a slider drives the
 * value, hollow when someone typed one. That one change removes most of the
 * text, because a rule you can see does not need explaining.
 */
export function DerivationPanel({
  derived,
  derivation,
  canvas,
  character,
  overrides,
  onChangeAxes,
  onChangeDerivation,
}: {
  derived: DerivedTokens;
  derivation: Derivation;
  canvas: number;
  character: IconCharacter;
  overrides: Partial<Record<DerivableToken, Override>>;
  onChangeAxes: (axes: IconCharacter["axes"]) => void;
  onChangeDerivation: (next: Derivation) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState<DerivableToken>();
  const moved = DERIVABLE.filter((t) => derived[t] !== undefined);

  const patchAxis = (axis: AxisName, next: AxisEndpoints) => {
    const out: Derivation = { ...derivation };
    if (Object.keys(next).length === 0) delete out[axis];
    else out[axis] = next;
    onChangeDerivation(out);
  };

  return (
    <div className="derivation">
      {moved.length === 0 ? (
        <p className="muted small-text">No slider moves any value yet. Dragging one will change nothing.</p>
      ) : (
        <div className="value-rows">
          <div className="vr-head">
            <span>Value</span>
            <span>From</span>
          </div>
          {moved.map((token) => {
            const d = derived[token]!;
            const override = overrides[token];
            const overridden = override?.set === true;
            const shown = overridden ? override!.value : d.value;
            const options = ENUM_OPTIONS[token];
            const open = why === token;

            return (
              <div className={`value-row${overridden ? " is-typed" : ""}`} key={token}>
                <div className="vr-name">
                  <button
                    className="vr-label"
                    aria-expanded={open}
                    title="Where this value comes from"
                    onClick={() => setWhy(open ? undefined : token)}
                  >
                    <span className="vr-caret">{open ? "▾" : "▸"}</span>
                    {LABELS[token]}
                  </button>
                  <span className="vr-affects">{AFFECTS[token]}</span>
                </div>

                {options ? (
                  <select
                    className="vr-value"
                    value={String(shown ?? d.value)}
                    onChange={(e) => override?.write(e.target.value)}
                  >
                    {options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  // The unit sits in the field rather than in the label, so a
                  // percentage reads the same here as it does on the revert
                  // button beside it. A bare "35" next to "↺ 31%" invites the
                  // reading that the two are different quantities.
                  <span className="vr-field">
                    <input
                      type="number"
                      step={stepFor(token)}
                      value={valueIn(token, Number(shown ?? 0))}
                      onChange={(e) => override?.write(valueOut(token, Number(e.target.value)))}
                    />
                    {TOKEN_UNITS[token] === "fraction" && <i className="vr-unit">%</i>}
                  </span>
                )}

                <span className="vr-source" title={overridden ? "Typed by hand. The slider is ignored." : "Driven by the sliders below."}>
                  <span className={overridden ? "dot hollow" : "dot"} aria-hidden />
                  {overridden ? "typed" : "personality"}
                </span>

                <span className="vr-revert">
                  {overridden && (
                    <button className="ghost small" title={`Hand this back to the sliders (${format(token, d.value)})`} onClick={override!.clear}>
                      ↺ {format(token, d.value)}
                    </button>
                  )}
                </span>

                {open && (
                  <div className="vr-contrib">
                    {d.contributions.map((c) => (
                      <div key={c.axis}>
                        <span className="muted">{AXIS_POLES[c.axis][1]}</span> at {c.position} → {format(token, c.value)}
                      </div>
                    ))}
                    {d.contributions.length > 1 && <div className="muted">averaged → {format(token, d.value)}</div>}
                    {overridden && <div className="muted">not used while this is typed</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="axes-strip">
        {AXIS_NAMES.map((axis) => (
          <AxisSlider
            key={axis}
            low={AXIS_POLES[axis][0]}
            high={AXIS_POLES[axis][1]}
            value={character.axes[axis]}
            onChange={(v) => onChangeAxes({ ...character.axes, [axis]: v })}
          />
        ))}
        <button className="ghost small endpoints-toggle" onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "What they mean"}
        </button>
      </div>

      {editing && (
        <div className="endpoints">
          <p className="muted small-text">
            What a value is worth at each end of a slider. These are the language's own, not ours. Lengths shown at {canvas}px.
          </p>
          {AXIS_NAMES.map((axis) => (
            <AxisEndpointsEditor
              key={axis}
              axis={axis}
              endpoints={derivation[axis] ?? {}}
              canvas={canvas}
              onChange={(next) => patchAxis(axis, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AxisEndpointsEditor({
  axis,
  endpoints,
  canvas,
  onChange,
}: {
  axis: AxisName;
  endpoints: AxisEndpoints;
  canvas: number;
  onChange: (next: AxisEndpoints) => void;
}) {
  const [low, high] = AXIS_POLES[axis];
  const used = DERIVABLE.filter((t) => endpoints[t] !== undefined);
  const unused = DERIVABLE.filter((t) => endpoints[t] === undefined);

  const setPair = (token: DerivableToken, pair: [number, number] | [string, string]) =>
    onChange({ ...endpoints, [token]: pair });
  const remove = (token: DerivableToken) => {
    const next = { ...endpoints };
    delete next[token];
    onChange(next);
  };

  return (
    <div className="axis-endpoints">
      <h4>
        {low} <span className="muted">↔</span> {high}
      </h4>
      {used.length === 0 && <p className="muted small-text">Moves nothing.</p>}
      {used.map((token) => {
        const pair = endpoints[token]!;
        const options = ENUM_OPTIONS[token];
        return (
          <div className="endpoint-row" key={token}>
            <span className="endpoint-label">{LABELS[token]}</span>
            {options ? (
              <>
                <select
                  value={String(pair[0])}
                  onChange={(e) => setPair(token, [e.target.value, String(pair[1])] as [string, string])}
                >
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <span className="muted">→</span>
                <select
                  value={String(pair[1])}
                  onChange={(e) => setPair(token, [String(pair[0]), e.target.value] as [string, string])}
                >
                  {options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <input
                  type="number"
                  step={TOKEN_UNITS[token] === "count" ? 1 : 0.25}
                  value={toDisplay(token, pair[0] as number, canvas)}
                  onChange={(e) =>
                    setPair(token, [fromDisplay(token, Number(e.target.value), canvas), pair[1] as number])
                  }
                />
                <span className="muted">→</span>
                <input
                  type="number"
                  step={TOKEN_UNITS[token] === "count" ? 1 : 0.25}
                  value={toDisplay(token, pair[1] as number, canvas)}
                  onChange={(e) =>
                    setPair(token, [pair[0] as number, fromDisplay(token, Number(e.target.value), canvas)])
                  }
                />
              </>
            )}
            <button className="ghost small" aria-label="Stop moving this" onClick={() => remove(token)}>
              ✕
            </button>
          </div>
        );
      })}
      {unused.length > 0 && (
        <select
          className="add-token"
          value=""
          onChange={(e) => {
            const token = e.target.value as DerivableToken;
            if (!token) return;
            const options = ENUM_OPTIONS[token];
            setPair(token, options ? ([options[0]!, options[1] ?? options[0]!] as [string, string]) : [0, 1]);
          }}
        >
          <option value="">Also move…</option>
          {unused.map((t) => (
            <option key={t} value={t}>
              {LABELS[t]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
