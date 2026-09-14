import type { Box, OpticalShape, SizeTokens } from "@icon-foundry/icon-language";
import type { Recognition } from "@icon-foundry/icon-primitives";
import { Fragment } from "react";
import type { FilletView, Gap, JointView, NearMiss, SegmentView } from "../lib/method-geometry.js";

/**
 * What the construction editor draws on top of the drawing.
 *
 * Every layer here is pure: it takes measurements someone else made and turns
 * them into marks. Nothing in this file decides whether geometry is wrong — the
 * language, the validator and `method-geometry` do that — which is the same
 * division `IconPreview` keeps, and for the same reason. A layer that measured
 * its own violations could disagree with the audit, and then the studio would
 * be telling designers something the build does not believe.
 *
 * The layers are stacked in the order the eye should resolve them: the ink
 * first, faintly, because that is what ships; then the construction over it;
 * then the faults on top, because a fault has to win. Annotation weights are
 * all multiples of `u`, one screen pixel, so the marks stay the same size at
 * every zoom while the drawing under them grows.
 */

/** Distinct hues per subpath, so "how many pieces is this?" needs no counting. */
const HUES = [
  "#1982c4",
  "#4267AC",
  "#6a4c93",
  "#B55379",
  "#FF595E",
  "#FF7655",
  "#ff924c",
  "#FFAE43",
  "#ffca3a",
  "#C5CA30",
  "#8ac926",
  "#52A675",
];

export const hueFor = (sub: number): string => HUES[sub % HUES.length] as string;

/** Rounded to something a person would read, and marked when it is not whole. */
const tidyNumber = (value: number): string => String(Math.round(value * 100) / 100);

/* ------------------------------------------------------------------ */

/**
 * The rule the drawing is being judged against: canvas edge, safe area, the
 * four optical boxes, and the grid.
 *
 * This is the backdrop the Keylines tab draws on its own, brought underneath
 * the editor so the two tabs stop being separate arguments about the same
 * drawing. A part that reaches past its optical box is not a construction fault
 * and this does not mark it as one — it is context, drawn quietly, so the
 * question "is this the right size for what it is" can be asked while the
 * question "is this built right" is being answered.
 *
 * One keyline, not four. Which one is not this layer's guess: a part declares
 * an optical shape or has one inferred from its proportions, and that is the
 * box the composer fits it into. Showing the other three would be showing three
 * rules this drawing is not being judged by. Comparing all four is the Keylines
 * tab's job, and it is a different question.
 */
export function BackdropLayer({
  canvas,
  tokens,
  keyline,
  u,
  zoom,
  show,
}: {
  canvas: number;
  tokens: SizeTokens;
  /** The box this part is sized against — its own, not all four. */
  keyline: { shape: OpticalShape; box: Box } | undefined;
  u: number;
  zoom: number;
  show: { grid: boolean; safeArea: boolean; keyline: boolean };
}) {
  const step = tokens.grid;
  const whole: string[] = [];
  const sub: string[] = [];
  const showWhole = zoom >= 4;
  const showSub = step > 0 && step < 1 && step * zoom >= 6;
  if (show.grid) {
    for (let at = step; at < canvas - 1e-9; at += step) {
      const d = `M${at} 0V${canvas}M0 ${at}H${canvas}`;
      if (Math.abs(at - Math.round(at)) < 1e-9) {
        if (showWhole) whole.push(d);
      } else if (showSub) sub.push(d);
    }
  }

  return (
    <g className="mth-backdrop" pointerEvents="none">
      {sub.length > 0 && (
        <path d={sub.join("")} strokeWidth={u} strokeDasharray={`${u} ${3 * u}`} className="mth-grid-sub" />
      )}
      {whole.length > 0 && <path d={whole.join("")} strokeWidth={u} className="mth-grid-whole" />}

      {show.keyline &&
        keyline &&
        (keyline.shape === "circle" ? (
          <circle
            className="mth-keyline"
            cx={keyline.box.x + keyline.box.width / 2}
            cy={keyline.box.y + keyline.box.height / 2}
            r={Math.min(keyline.box.width, keyline.box.height) / 2}
            strokeWidth={u}
          />
        ) : (
          <rect
            className="mth-keyline"
            x={keyline.box.x}
            y={keyline.box.y}
            width={keyline.box.width}
            height={keyline.box.height}
            strokeWidth={u}
          />
        ))}

      {/* The live area, dashed, because it is a line to reach rather than a
          line to stay off. The keyline above is derived from it. */}
      {show.safeArea && tokens.safeArea > 0 && (
        <rect
          className="mth-safe-area"
          x={tokens.safeArea}
          y={tokens.safeArea}
          width={canvas - 2 * tokens.safeArea}
          height={canvas - 2 * tokens.safeArea}
          strokeWidth={u}
          strokeDasharray={`${2 * u} ${2 * u}`}
        />
      )}

      {/* The trim, solid, because nothing crosses it. Drawn only when it is
          somewhere other than the canvas edge, which already has a line. */}
      {show.safeArea && tokens.trim > 0 && (
        <rect
          className="mth-trim"
          x={tokens.trim}
          y={tokens.trim}
          width={canvas - 2 * tokens.trim}
          height={canvas - 2 * tokens.trim}
          strokeWidth={u}
        />
      )}

      <rect className="mth-canvas-edge" x={0} y={0} width={canvas} height={canvas} strokeWidth={u} />
    </g>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The drawing at the weight it will actually be painted.
 *
 * A skeleton is a hairline, and a hairline makes every gap look generous and
 * every junction look clean. This is the same geometry at the language's own
 * stroke width, faint enough to read through — it is the difference between
 * judging a drawing and judging a diagram of one.
 */
export function InkLayer({ views, tokens }: { views: readonly SegmentView[]; tokens: SizeTokens }) {
  return (
    <path
      className="mth-ink"
      pointerEvents="none"
      d={views.map((v) => v.d).join("")}
      strokeWidth={tokens.stroke.width}
      strokeLinecap={tokens.stroke.cap}
      strokeLinejoin={tokens.stroke.join}
    />
  );
}

/** Each subpath in its own hue, so the pieces of a drawing are countable. */
export function ColouredLayer({ views, u }: { views: readonly SegmentView[]; u: number }) {
  return (
    <g className="mth-coloured" pointerEvents="none" strokeWidth={6 * u}>
      {views.map((view) => (
        <path key={view.id} d={view.d} stroke={hueFor(view.sub)} />
      ))}
    </g>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The centreline, its endpoints, and the angle of anything off the grammar.
 *
 * The angle is only labelled where it is a *finding*. Labelling every segment
 * would put 90° beside every vertical in the set, which is noise with the shape
 * of information: the whole point of an angle set is that the allowed ones need
 * no comment.
 */
export function ControlLayer({
  views,
  u,
  uid,
  showAngles,
}: {
  views: readonly SegmentView[];
  u: number;
  uid: string;
  showAngles: boolean;
}) {
  const labelled = showAngles
    ? views.filter((v) => v.offAngle && v.heading !== undefined && v.length > 8 * u)
    : [];
  const labelOf = (view: SegmentView) => `${tidyNumber(view.heading ?? 0)}°`;

  return (
    <>
      <g className="mth-control-mask-defs">
        {labelled.map((view) => (
          <mask id={`${uid}-angle-${view.sub}-${view.index}`} key={view.id} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" stroke="none" />
            <text fontSize={8 * u} strokeWidth={4 * u} stroke="#000" fill="#000" dominantBaseline="middle">
              <textPath href={`#${uid}-path-${view.sub}-${view.index}`} startOffset="50%" textAnchor="middle">
                {labelOf(view)}
              </textPath>
            </text>
          </mask>
        ))}
      </g>

      <g className="mth-control" pointerEvents="none" strokeWidth={1.25 * u}>
        {views.map((view) => (
          <path
            key={view.id}
            id={`${uid}-path-${view.sub}-${view.index}`}
            className={`mth-seg ${view.offAngle ? "off" : ""} ${view.kind}`}
            d={view.d}
            {...(labelled.includes(view) && { mask: `url(#${uid}-angle-${view.sub}-${view.index})` })}
          />
        ))}
      </g>

      <g className="mth-angle-labels" pointerEvents="none">
        {labelled.map((view) => (
          <text key={view.id} fontSize={8 * u} dominantBaseline="middle">
            <textPath href={`#${uid}-path-${view.sub}-${view.index}`} startOffset="50%" textAnchor="middle">
              {labelOf(view)}
            </textPath>
          </text>
        ))}
      </g>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Every radius in the drawing, drawn as the circle it is cut from.
 *
 * Two different things share this layer because on screen they are the same
 * gesture. A *joint* has a radius the language decided and nobody has cut yet;
 * an *arc* has one somebody already committed to. The first is shown with its
 * legs and tangent points, because that is what the ramp is choosing between;
 * the second with just its centre, because its tangents are already where the
 * geometry says.
 *
 * A radius that does not land on the grid is drawn in the fault colour. That is
 * the one number in a corner nobody can see, and a set whose corners are
 * 1.0, 1.0, 1.0 and 0.9836 does not look like one hand.
 */
export function RadiiLayer({
  joints,
  fillets,
  u,
  grid,
  showLabels,
}: {
  joints: readonly JointView[];
  fillets: readonly FilletView[];
  u: number;
  grid: number;
  showLabels: boolean;
}) {
  const offGrid = (value: number) => grid > 0 && Math.abs(value / grid - Math.round(value / grid)) > 1e-3;

  return (
    <g className="mth-radii" pointerEvents="none" strokeWidth={u}>
      {joints.map((joint) =>
        joint.centre && joint.tangents ? (
          <Fragment key={`j${joint.vertex}`}>
            <path
              className="mth-radius-leg"
              strokeDasharray={`0 ${2 * u} ${2 * u}`}
              d={`M${joint.tangents[0][0]} ${joint.tangents[0][1]}L${joint.centre[0]} ${joint.centre[1]}L${joint.tangents[1][0]} ${joint.tangents[1][1]}`}
            />
            <circle
              className={`mth-radius-circle ${offGrid(joint.radius) ? "off" : ""} ${joint.overridden ? "stated" : ""}`}
              cx={joint.centre[0]}
              cy={joint.centre[1]}
              r={joint.radius}
            />
            <circle className="mth-radius-tangent" cx={joint.tangents[0][0]} cy={joint.tangents[0][1]} r={1.5 * u} />
            <circle className="mth-radius-tangent" cx={joint.tangents[1][0]} cy={joint.tangents[1][1]} r={1.5 * u} />
            {showLabels && (
              <text className="mth-label" x={joint.at[0]} y={joint.at[1] - 7 * u} fontSize={8 * u}>
                {Math.round(joint.angle)}° · r{tidyNumber(joint.radius)}
              </text>
            )}
          </Fragment>
        ) : null,
      )}

      {/* A cut corner, drawn back to the corner it was cut from. The dashed
          legs run out to a point that is not in the geometry any more, which is
          exactly what makes the radius legible: you can see what was removed. */}
      {fillets.map((fillet) => (
        <Fragment key={`f${fillet.id}`}>
          <path
            className="mth-radius-leg"
            strokeDasharray={`0 ${2 * u} ${2 * u}`}
            d={`M${fillet.centre[0]} ${fillet.centre[1]}L${fillet.corner[0]} ${fillet.corner[1]}`}
          />
          <circle className="mth-radius-corner" cx={fillet.corner[0]} cy={fillet.corner[1]} r={1.5 * u} />
          <circle
            className={`mth-radius-circle cut ${offGrid(fillet.radius) ? "off" : ""}`}
            cx={fillet.centre[0]}
            cy={fillet.centre[1]}
            r={fillet.radius}
          />
          {showLabels && (
            <text className="mth-label" x={fillet.corner[0]} y={fillet.corner[1] - 7 * u} fontSize={8 * u}>
              {Math.round(fillet.angle)}° · r{tidyNumber(fillet.radius)}
            </text>
          )}
        </Fragment>
      ))}
    </g>
  );
}

/** The arms of any cubic in the drawing — the curves the policy is counting. */
export function CurveHandleLayer({ views, u }: { views: readonly SegmentView[]; u: number }) {
  return (
    <g className="mth-curve-handles" pointerEvents="none" strokeWidth={u}>
      {views.map((view) =>
        view.cubic ? (
          <Fragment key={view.id}>
            <path d={`M${view.from[0]} ${view.from[1]}L${view.cubic.c1[0]} ${view.cubic.c1[1]}`} />
            <path d={`M${view.to[0]} ${view.to[1]}L${view.cubic.c2[0]} ${view.cubic.c2[1]}`} />
          </Fragment>
        ) : null,
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The two rings a drawing can cross, each drawn the way it is measured.
 *
 * They were one layer and one test, and the two disagreed: the gate asked about
 * centrelines and the picture hatched strokes, so the mark could be several
 * times the size of the finding, or absent while ink hung off the canvas.
 *
 * Now each is drawn around the thing it is about. Passing the **live area** is
 * marked on the centreline, in the warning colour, because the live area is a
 * target the keylines are derived from and a circle drawn correctly rests on
 * it. Crossing the **trim** is hatched around the stroke, in the fault colour,
 * because that one really is about ink leaving the canvas.
 */
export function RingBreachLayer({
  views,
  tokens,
  canvas,
  uid,
  pastLive,
  pastTrim,
}: {
  views: readonly SegmentView[];
  tokens: SizeTokens;
  canvas: number;
  uid: string;
  pastLive: boolean;
  pastTrim: boolean;
}) {
  const d = views.map((v) => v.d).join("");
  if (!d || (!pastLive && !pastTrim)) return null;

  return (
    <g className="mth-breach" pointerEvents="none">
      <defs>
        <pattern
          id={`${uid}-breach-hatch`}
          width={0.6}
          height={0.6}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line className="mth-breach-line" y2={0.6} strokeWidth={0.22} />
        </pattern>

        {/* Centreline past the live edge: masked around the *centreline*,
            because that is what the question was about. Hatching the stroke
            here was the old bug — it drew a region several times the size of
            the thing that had been found. */}
        <mask id={`${uid}-live-mask`} maskUnits="userSpaceOnUse">
          <path d={d} stroke="#fff" strokeWidth={1.5 * (canvas / 480)} fill="none" />
          <rect
            x={tokens.safeArea}
            y={tokens.safeArea}
            width={canvas - 2 * tokens.safeArea}
            height={canvas - 2 * tokens.safeArea}
            fill="#000"
            stroke="none"
          />
        </mask>

        {/* Ink past the trim: masked around the stroke, because this one really
            is about the ink. */}
        <mask id={`${uid}-trim-mask`} maskUnits="userSpaceOnUse">
          <path d={d} stroke="#fff" strokeWidth={tokens.stroke.width} fill="none" />
          <rect
            x={tokens.trim}
            y={tokens.trim}
            width={canvas - 2 * tokens.trim}
            height={canvas - 2 * tokens.trim}
            fill="#000"
            stroke="none"
          />
        </mask>
      </defs>

      {pastLive && tokens.safeArea > 0 && (
        <path
          className="mth-past-live"
          d={d}
          fill="none"
          strokeWidth={4 * (canvas / 480)}
          mask={`url(#${uid}-live-mask)`}
        />
      )}
      {pastTrim && (
        <path
          d={d}
          fill="none"
          strokeWidth={tokens.stroke.width}
          stroke={`url(#${uid}-breach-hatch)`}
          mask={`url(#${uid}-trim-mask)`}
        />
      )}
    </g>
  );
}

/** Two subpaths closer than the language's minimum gap. */
export function GapLayer({ gaps, u }: { gaps: readonly Gap[]; u: number }) {
  return (
    <g className="mth-gaps" pointerEvents="none">
      {gaps.map((gap, i) => (
        <Fragment key={`${gap.a[0]}:${gap.a[1]}:${i}`}>
          <path className="mth-gap-line" d={`M${gap.a[0]} ${gap.a[1]}L${gap.b[0]} ${gap.b[1]}`} strokeWidth={2 * u} />
          <circle className="mth-gap-dot" cx={gap.a[0]} cy={gap.a[1]} r={2 * u} />
          <circle className="mth-gap-dot" cx={gap.b[0]} cy={gap.b[1]} r={2 * u} />
        </Fragment>
      ))}
    </g>
  );
}

/**
 * A loose end nearly touching something, and where it should have landed.
 *
 * Red for where it is, green for where it belongs — the one convention worth
 * copying wholesale, because it turns "something is wrong near here" into an
 * instruction.
 */
export function NearMissLayer({ misses, u }: { misses: readonly NearMiss[]; u: number }) {
  return (
    <g className="mth-near-misses" pointerEvents="none">
      {misses.map((miss, i) => (
        <Fragment key={`${miss.at[0]}:${miss.at[1]}:${i}`}>
          <circle className="mth-miss-from" cx={miss.at[0]} cy={miss.at[1]} r={3 * u} strokeWidth={u} />
          <circle className="mth-miss-to" cx={miss.to[0]} cy={miss.to[1]} r={3 * u} strokeWidth={u} />
        </Fragment>
      ))}
    </g>
  );
}

/**
 * The drawing named, when it turns out to be a primitive the set already owns.
 *
 * The original tool labels a matched pattern so a contributor can see they have
 * redrawn something. Here the match is worth more than a label: a drawing
 * recognised as a primitive can be *replaced* by it, and then it carries the
 * primitive's construction traits and re-renders when the language moves. So
 * the box is an offer, not an observation.
 */
export function RecognisedLayer({
  recognition,
  u,
  box,
}: {
  recognition: Recognition | undefined;
  u: number;
  box: Box | undefined;
}) {
  if (!recognition || !box) return null;
  const pad = 1;
  return (
    <g className="mth-recognised" pointerEvents="none">
      <rect
        x={box.x - pad}
        y={box.y - pad}
        width={box.width + pad * 2}
        height={box.height + pad * 2}
        rx={0.5}
        strokeWidth={u}
        strokeDasharray={`${3 * u} ${3 * u}`}
      />
      <text className="mth-label" x={box.x - pad} y={box.y - pad - 3 * u} fontSize={8 * u} textAnchor="start">
        {recognition.primitive}
      </text>
    </g>
  );
}
