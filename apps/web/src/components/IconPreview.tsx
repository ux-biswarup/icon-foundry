import type { ComposedIcon, ComposedShape } from "@icon-foundry/icon-composer";
import { shapeToPathData } from "@icon-foundry/icon-renderer";
import type { Evidence, ValidationIssue } from "@icon-foundry/icon-validator";
import { useGround } from "../lib/theme.js";

/**
 * An icon drawn from its composed geometry, with the language's rules on top.
 *
 * Not from an SVG string. `IconSvg` injects one with `dangerouslySetInnerHTML`,
 * which is right for a thumbnail and useless here: you cannot compose overlay
 * layers into opaque HTML, and anything that wanted to mark a point on the
 * drawing would have to parse the string back into geometry it never should
 * have lost. `compose()` already hands over a typed `Shape` union — this takes
 * that, and every layer below reads the same structure.
 *
 * Detection stays in the validator. These layers only draw what the rules
 * already found, using the `evidence` each issue carries: rules detect,
 * overlays draw. Putting the measuring in here would mean the studio and the
 * audit could disagree about whether an icon is good.
 */

export type LayerName = "grid" | "safeArea" | "keyline" | "shapes" | "issues" | "handles";

export const DEFAULT_LAYERS: Record<LayerName, boolean> = {
  grid: true,
  safeArea: true,
  keyline: false,
  shapes: true,
  issues: true,
  handles: false,
};

/**
 * Below this many pixels across, the drawing carries no annotation.
 *
 * A 16px icon at 1× has no room for a legend, and drawing one anyway buries
 * the thing being judged under its own labels. The same threshold the keyline
 * canvas uses, for the same reason.
 */
const LEGIBLE = 46;

export function IconPreview({
  icon,
  issues = [],
  zoom = 1,
  layers,
  highlight,
  className = "",
}: {
  icon: ComposedIcon;
  issues?: ValidationIssue[];
  zoom?: number;
  layers?: Partial<Record<LayerName, boolean>>;
  /** Draw only this issue's evidence, when one is being pointed at. */
  highlight?: ValidationIssue | undefined;
  className?: string;
}) {
  const ground = useGround();
  const on = { ...DEFAULT_LAYERS, ...layers };
  const { canvas: c, tokens, shapes } = icon;
  const size = c * zoom;
  const annotated = size >= LEGIBLE;

  /*
   * One screen pixel, in canvas units.
   *
   * The drawing scales with zoom; the annotation must not. Studio hardcodes its
   * overlay weights in world units — `strokeWidth={0.12}`, `r={0.25}` — which
   * are tuned for a 24 canvas and come out 50% fatter on a 16, where the
   * control dots then swamp the glyph. Dividing by zoom keeps every mark the
   * same size on screen at every size and magnification.
   */
  const u = 1 / zoom;
  const shown = highlight ? [highlight] : issues;

  return (
    <svg
      className={`icon-preview ${ground} ${className}`}
      viewBox={`0 0 ${c} ${c}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={tokens.stroke.width}
      strokeLinecap={tokens.stroke.cap}
      strokeLinejoin={tokens.stroke.join}
    >
      {on.grid && annotated && <GridLayer canvas={c} step={tokens.grid} u={u} zoom={zoom} />}
      {on.keyline && annotated && <KeylineLayer tokens={tokens} u={u} />}
      {on.safeArea && annotated && <SafeAreaLayer canvas={c} inset={tokens.safeArea} u={u} />}
      {on.shapes && <ShapesLayer shapes={shapes} />}
      {on.issues && annotated && <IssueLayer issues={shown} u={u} canvas={c} />}
      {on.handles && annotated && <HandlesLayer shapes={shapes} u={u} />}
    </svg>
  );
}

/**
 * The grid the language actually uses.
 *
 * Whole units solid, the token's sub-step dotted, so the two readings a
 * designer needs — "where is the middle" and "is this on the grid" — are both
 * available without counting. `tokens.grid` differs per optical size, so this
 * is correct at 16, 24 and 32 with no size conditional anywhere.
 *
 * The sub-step is dropped when it has no room. A 0.5 grid on a 24 canvas is 48
 * lines each way, and below a few pixels apart they stop reading as a grid and
 * start reading as a texture the icon is sitting on — which is worse than no
 * grid, because it hides the drawing and the safe area both.
 */
export function GridLayer({ canvas, step, u, zoom }: { canvas: number; step: number; u: number; zoom: number }) {
  const sub: string[] = [];
  const whole: string[] = [];
  // Spacing, not count, decides what is drawn. A line every 2px is not a grid
  // you can count against, it is a tint over the drawing — and the whole-unit
  // lines hit that first, because at a low zoom one canvas unit is a couple of
  // pixels however fine the token grid is.
  const showWhole = zoom >= 4;
  const showSub = step > 0 && step < 1 && step * zoom >= 6;
  if (!showWhole && !showSub) return null;
  for (let at = step; at < canvas - 1e-9; at += step) {
    const d = `M${at} 0V${canvas}M0 ${at}H${canvas}`;
    if (Math.abs(at - Math.round(at)) < 1e-9) {
      if (showWhole) whole.push(d);
    } else if (showSub) sub.push(d);
  }
  return (
    <g className="ip-grid" pointerEvents="none">
      {sub.length > 0 && (
        <path d={sub.join("")} strokeWidth={u} strokeDasharray={`${u} ${3 * u}`} className="ip-grid-sub" />
      )}
      {whole.length > 0 && <path d={whole.join("")} strokeWidth={u} className="ip-grid-whole" />}
    </g>
  );
}

/** The padding no centreline should enter. */
function SafeAreaLayer({ canvas, inset, u }: { canvas: number; inset: number; u: number }) {
  if (inset <= 0) return null;
  return (
    <rect
      className="ip-safe-area"
      x={inset}
      y={inset}
      width={canvas - 2 * inset}
      height={canvas - 2 * inset}
      strokeWidth={u}
      strokeDasharray={`${2 * u} ${2 * u}`}
      pointerEvents="none"
    />
  );
}

/** The four optical boxes, for judging a drawing against its own sheet. */
function KeylineLayer({ tokens, u }: { tokens: ComposedIcon["tokens"]; u: number }) {
  return (
    <g className="ip-keyline" pointerEvents="none" strokeWidth={u}>
      {Object.entries(tokens.optical).map(([shape, box]) =>
        shape === "circle" ? (
          <circle key={shape} cx={box.x + box.width / 2} cy={box.y + box.height / 2} r={box.width / 2} />
        ) : (
          <rect key={shape} x={box.x} y={box.y} width={box.width} height={box.height} />
        ),
      )}
    </g>
  );
}

/**
 * The icon itself, one path per composed shape.
 *
 * Each shape keeps its own resolved style, because the composer already
 * decided them: a filled shape is filled here rather than being re-derived
 * from the spec.
 */
function ShapesLayer({ shapes }: { shapes: ComposedShape[] }) {
  return (
    <g className="ip-shapes">
      {shapes.map((item, i) => {
        const filled = item.style === "filled" && item.shape.fillable;
        return (
          <path
            // Index is the identity here: shapes are positional output of one
            // deterministic compose, with no stable id of their own.
            key={`${item.source}:${i}`}
            d={shapeToPathData(item.shape)}
            fill={filled ? "currentColor" : "none"}
            stroke={filled ? "none" : "currentColor"}
            strokeWidth={item.stroke.width}
            strokeLinecap={item.stroke.cap}
            strokeLinejoin={item.stroke.join}
          />
        );
      })}
    </g>
  );
}

/** Every endpoint the geometry passes through, for reading construction. */
function HandlesLayer({ shapes, u }: { shapes: ComposedShape[]; u: number }) {
  const points: Array<[number, number]> = [];
  for (const item of shapes) {
    const b = item.shape;
    if (b.kind === "line") points.push([b.x1, b.y1], [b.x2, b.y2]);
    else if (b.kind === "circle") points.push([b.cx, b.cy]);
    else if (b.kind === "rect") {
      points.push([b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]);
    }
    else if (b.kind === "polyline") for (const p of b.points) points.push([p[0], p[1]]);
  }
  return (
    <g className="ip-handles" pointerEvents="none">
      {points.map(([x, y], i) => (
        <circle key={`${x}:${y}:${i}`} cx={x} cy={y} r={2 * u} strokeWidth={u} />
      ))}
    </g>
  );
}

/**
 * The problems, drawn where they are.
 *
 * It switches on the shape of the evidence rather than on the rule that
 * produced it, so a new rule that reports a gap gets the gap drawing for free
 * and nothing here has to learn its name.
 */
function IssueLayer({ issues, u, canvas }: { issues: ValidationIssue[]; u: number; canvas: number }) {
  const marks = issues.flatMap((issue) =>
    (issue.evidence ?? []).map((evidence) => ({ evidence, severity: issue.severity })),
  );
  if (marks.length === 0) return null;
  return (
    <g className="ip-issues" pointerEvents="none">
      <defs>
        <pattern id="ip-overflow" width={6 * u} height={6 * u} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={3 * u} y1={0} x2={3 * u} y2={6 * u} className="ip-overflow-line" strokeWidth={1.2 * u} />
        </pattern>
      </defs>
      {marks.map(({ evidence, severity }, i) => (
        <Mark key={i} evidence={evidence} severity={severity} u={u} canvas={canvas} />
      ))}
    </g>
  );
}

function Mark({
  evidence,
  severity,
  u,
  canvas,
}: {
  evidence: Evidence;
  severity: ValidationIssue["severity"];
  u: number;
  canvas: number;
}) {
  const cls = `ip-mark ip-${severity}`;
  switch (evidence.kind) {
    case "bounds": {
      // Hatch everything the drawing reached that it should not have: the band
      // between the bounds it has and the canvas it was allowed.
      const b = evidence.bounds;
      return (
        <g className={cls}>
          <path
            d={`M0 0H${canvas}V${canvas}H0Z M${b.minX} ${b.minY}H${b.maxX}V${b.maxY}H${b.minX}Z`}
            fillRule="evenodd"
            fill="url(#ip-overflow)"
            stroke="none"
          />
          <rect
            x={b.minX}
            y={b.minY}
            width={b.maxX - b.minX}
            height={b.maxY - b.minY}
            strokeWidth={u}
            strokeDasharray={`${2 * u} ${2 * u}`}
          />
        </g>
      );
    }
    case "gap": {
      // The span itself, with a witness at each end: red where the geometry is,
      // so the eye lands on the two things that are too close rather than on a
      // number in a list.
      const [ax, ay] = evidence.a;
      const [bx, by] = evidence.b;
      return (
        <g className={cls}>
          <line x1={ax} y1={ay} x2={bx} y2={by} strokeWidth={1.5 * u} />
          <circle cx={ax} cy={ay} r={2.5 * u} strokeWidth={u} />
          <circle cx={bx} cy={by} r={2.5 * u} strokeWidth={u} />
        </g>
      );
    }
    case "points":
      return (
        <g className={cls}>
          {evidence.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5 * u} strokeWidth={u} />
          ))}
        </g>
      );
    case "shape":
      return <path className={cls} d={shapeToPathData(evidence.shape)} strokeWidth={2 * u} fill="none" />;
  }
}
