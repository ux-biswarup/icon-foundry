import { previewElementChange } from "@icon-foundry/icon-audit";
import { slashAngle, slashGap } from "@icon-foundry/icon-composer";
import { cornerRadiusFor, type IconLanguage } from "@icon-foundry/icon-language";
import type { ElementRecord, Library } from "@icon-foundry/icon-library";
import {
  arcify,
  corners as jointsOf,
  isAllowedAngle,
  moveVertex,
  segmentHeading,
  segmentStart,
  skeletonFromPathData,
  snapToConstruction,
  tidy,
  bandThrough,
  clipOutsideBand,
  type Point,
  type PrimitiveRegistry,
  type Skeleton,
} from "@icon-foundry/icon-primitives";
import { shapeToPathData, skeletonPaths, skeletonToPathData } from "@icon-foundry/icon-renderer";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconSvg } from "./IconSvg.js";
import { Swatch } from "./Swatch.js";

/**
 * How a part is built.
 *
 * The third question a set has to answer. Parts asks whether these look like the
 * work of one hand and Keylines whether they are the same size; neither can show
 * whether they are *built* the same way, because construction is invisible once
 * a shape is drawn. Here it is the only thing on screen: the skeleton before its
 * corners are rounded, every segment coloured by whether its angle is one the
 * language allows, and every joint labelled with the radius the ramp gives it.
 *
 * Editing is direct because the skeleton makes it cheap. Dragging a vertex of a
 * polyline is tractable; dragging a control point of a cubic whose neighbours
 * must stay tangent is not, which is why the tool this borrows from has to
 * repair geometry instead of letting anyone shape it.
 */

export interface MethodProps {
  library: Library;
  language: IconLanguage;
  registry: PrimitiveRegistry;
  /** Optical size being drawn at, which decides the tokens. */
  size: number;
  selected: string | undefined;
  onSelect: (name: string | undefined) => void;
  onAction: (fn: (lib: Library) => Promise<unknown>) => Promise<unknown>;
}

const STAGE = 460;

/** The part's geometry as one skeleton, or undefined when it has none to show. */
function skeletonFor(record: ElementRecord | undefined, registry: PrimitiveRegistry, name: string | undefined) {
  if (record) return skeletonFromPathData(record.outline);
  if (!name || !registry.has(name)) return undefined;
  // A built-in draws from code, so its skeleton is read back off the geometry it
  // produces. Not editable — but just as worth looking at, because the question
  // on this tab is whether the set is built one way.
  const shapes = registry.get(name).build({ style: "outline", strokeWidth: 1.5, cornerRadius: 0, scale: 1 });
  const data = shapes.map((shape) => shapeToPathData(shape, 6)).filter(Boolean);
  return data.length > 0 ? skeletonFromPathData(data) : undefined;
}

export function MethodCanvas({ library, language, registry, size, selected, onSelect, onAction }: MethodProps) {
  const tokens = language.sizes[size] ?? language.sizes[language.defaultCanvas]!;
  const elements = library.elements();
  const record = elements.find((e) => e.name === selected);
  const editable = record !== undefined;

  const [draft, setDraft] = useState<Skeleton>();
  const [showRounded, setShowRounded] = useState(false);
  const [dragging, setDragging] = useState<number>();
  const [free, setFree] = useState(false);
  const [error, setError] = useState<string>();
  const stage = useRef<SVGSVGElement>(null);

  const base = useMemo(() => skeletonFor(record, registry, selected), [record, registry, selected]);
  const skeleton = draft ?? base;
  const dirty = draft !== undefined;

  // The natural box a part is drawn in, which is what the canvas shows.
  const primitive = selected && registry.has(selected) ? registry.get(selected) : undefined;
  // A part may declare that its concept needs angles the grammar does not allow
  // — a triangle, an isometric box, a snowflake's 60° symmetry. Marking those
  // segments as mistakes would be the tab contradicting the language.
  const freeAngles = primitive?.freeAngles === true;
  const box = record?.box ?? primitive?.box;
  const extent = Math.max(box?.width ?? tokens.canvas, box?.height ?? tokens.canvas, 1);
  const unit = STAGE / extent;
  // A radius stated in canvas units has to be read at the scale the part is
  // drawn at, the same correction the composer applies.
  const localRadius = tokens.cornerRadius * (extent / tokens.canvas);

  const rounded = useMemo(
    () =>
      skeleton
        ? arcify(skeleton, {
            cornerRadius: localRadius,
            corners: language.construction.corners,
            ...(language.construction.cornerSnap && { snap: true, grid: tokens.grid * (extent / tokens.canvas) }),
          })
        : undefined,
    [skeleton, localRadius, language.construction, tokens.grid, extent, tokens.canvas],
  );

  const shown = showRounded ? rounded : skeleton;
  const joints = useMemo(() => (skeleton ? jointsOf(skeleton) : []), [skeleton]);

  const preview = useMemo(() => {
    if (!record || !draft) return undefined;
    try {
      const next = { ...record, outline: skeletonPaths(draft, 4) };
      return { next, impacts: previewElementChange(library, next) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [record, draft, library]);

  const toCanvas = (event: ReactPointerEvent): Point | undefined => {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return [((event.clientX - rect.left) / rect.width) * extent, ((event.clientY - rect.top) / rect.height) * extent];
  };

  const onMove = (event: ReactPointerEvent) => {
    if (dragging === undefined || !skeleton || !editable) return;
    const raw = toCanvas(event);
    if (!raw) return;
    const neighbours = neighboursOf(skeleton, dragging);
    const { point } = snapToConstruction(raw, neighbours, {
      grid: tokens.grid * (extent / tokens.canvas),
      angles: language.grammar.angles,
      free: free || event.altKey,
    });
    setDraft(moveVertex(skeleton, dragging, point));
  };

  const act = (fn: (s: Skeleton) => Skeleton) => {
    if (!skeleton) return;
    setDraft(fn(skeleton));
  };

  /**
   * Copy a built-in into an element of your own.
   *
   * A built-in draws from code, so there is no path data to edit and no way to
   * write one back. The library also refuses to let a drawn element take a
   * built-in's name, which is right — a set with two `warehouse` parts is a set
   * that has lost track of itself. So the answer is a copy under a free name,
   * which then behaves like anything else you have drawn.
   */
  const fork = async () => {
    if (!skeleton || !selected || !primitive) return;
    const taken = (name: string) => registry.has(name) || elements.some((e) => e.name === name);
    let name = `${selected}-custom`;
    for (let n = 2; taken(name); n++) name = `${selected}-custom-${n}`;
    try {
      await onAction((lib) =>
        lib.saveElement({
          name,
          category: primitive.category,
          description: `Copied from the built-in ${selected}.`,
          keywords: [...primitive.keywords],
          opticalShape: primitive.opticalShape,
          ...(primitive.freeAngles === true && { freeAngles: true }),
          outline: skeletonPaths(skeleton, 4),
        }),
      );
      setDraft(undefined);
      setError(undefined);
      onSelect(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="method-canvas">
      <div className="pc-toolbar">
        <select value={selected ?? ""} onChange={(e) => onSelect(e.target.value || undefined)}>
          <option value="">Pick a part…</option>
          {elements.length > 0 && (
            <optgroup label="Your elements">
              {elements.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Built in">
            {registry
              .list()
              .filter((p) => p.origin === "builtin")
              .map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
          </optgroup>
        </select>
        <span className="bar-sep" />
        {(["skeleton", "rounded"] as const).map((v) => (
          <button
            key={v}
            className={`chip ${(v === "rounded") === showRounded ? "on" : ""}`}
            onClick={() => setShowRounded(v === "rounded")}
            title={v === "skeleton" ? "The segments as drawn" : "With the language's corners applied"}
          >
            {v}
          </button>
        ))}
        <span className="bar-sep" />
        <button
          className="chip"
          disabled={!editable || !skeleton}
          title="Weld loose ends, put lines on their true crossings, drop what is too small to see"
          onClick={() => act((s) => tidy(s, { grid: tokens.grid * (extent / tokens.canvas), canvas: extent }))}
        >
          Tidy
        </button>
        <button
          className="chip"
          disabled={!editable || !skeleton}
          title="Round every joint by the language's ramp, and bake the result into the drawing"
          onClick={() =>
            act((s) =>
              arcify(s, {
                cornerRadius: localRadius,
                corners: language.construction.corners,
                ...(language.construction.cornerSnap && { snap: true, grid: tokens.grid * (extent / tokens.canvas) }),
              }),
            )
          }
        >
          Arcify
        </button>
        <button
          className="chip"
          disabled={!editable || !skeleton}
          title="Cut the slash through it, the way an -off variant is made"
          onClick={() =>
            act((sk) =>
              clipOutsideBand(
                sk,
                bandThrough(
                  [extent / 2, extent / 2],
                  slashAngle(language),
                  slashGap(tokens) * (extent / tokens.canvas),
                ),
              ),
            )
          }
        >
          Offify
        </button>
        <span className="spacer" />
        {!editable && skeleton && (
          <button className="chip primary" onClick={() => void fork()} title="Copy this part into an element of your own, which you can edit">
            Copy to edit
          </button>
        )}
        {freeAngles && <span className="muted small-text">declares free angles</span>}
        {dirty && (
          <>
            <button className="chip" onClick={() => setDraft(undefined)}>
              Revert
            </button>
            <button
              className="chip primary"
              disabled={!preview || "error" in preview}
              onClick={() => {
                if (!preview || "error" in preview || !preview.next) return;
                void onAction((lib) => lib.saveElement(preview.next))
                  .then(() => {
                    setDraft(undefined);
                    setError(undefined);
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : String(e)));
              }}
            >
              Save
            </button>
          </>
        )}
      </div>

      {!skeleton && (
        <p className="muted empty">
          Pick a part to see how it is built. Your own elements can be edited here; a built-in draws from code, so it is
          shown rather than opened.
        </p>
      )}

      {skeleton && shown && (
        <div className="method-stage">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a drawing surface
              has no keyboard equivalent; every vertex on it is a real button. */}
          <svg
            ref={stage}
            className="method-svg"
            width={STAGE}
            height={STAGE}
            viewBox={`0 0 ${extent} ${extent}`}
            onPointerMove={onMove}
            onPointerUp={(e) => {
              stage.current?.releasePointerCapture(e.pointerId);
              setDragging(undefined);
            }}
            onLostPointerCapture={() => setDragging(undefined)}
          >
            <Grid extent={extent} step={tokens.grid * (extent / tokens.canvas)} />

            {/* Every segment, coloured by whether its direction is one the
                language allows. An off-angle line is the mistake this whole tab
                exists to make visible. */}
            {shown.subpaths.flatMap((subpath, s) =>
              subpath.segments.map((segment, i) => {
                const from = shown.vertices[segmentStart(subpath, i)]!;
                const to = shown.vertices[segment.to]!;
                const heading = segmentHeading(shown, subpath, i);
                const off =
                  !freeAngles &&
                  segment.kind === "line" &&
                  heading !== undefined &&
                  !isAllowedAngle(heading, language.grammar.angles, language.grammar.angleTolerance);
                const d =
                  segment.kind === "arc"
                    ? `M${from[0]} ${from[1]}A${segment.radius} ${segment.radiusY ?? segment.radius} 0 ${segment.largeArc ? 1 : 0} ${segment.sweep ? 1 : 0} ${to[0]} ${to[1]}`
                    : `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
                return (
                  <path
                    key={`${s}-${i}`}
                    d={d}
                    className={`ms-seg ${off ? "off" : ""} ${segment.kind}`}
                    strokeWidth={1.5 / unit}
                  />
                );
              }),
            )}

            {/* The radius each joint is getting, from the ramp. */}
            {!showRounded &&
              joints.map((joint) => {
                const at = skeleton.vertices[joint.vertex]!;
                const radius = skeleton.corners[joint.vertex] ?? cornerRadiusFor(joint.angle, language.construction.corners, localRadius);
                return (
                  <text
                    key={`label-${joint.subpath}-${joint.joint}`}
                    className="ms-label"
                    x={at[0]}
                    y={at[1] - 6 / unit}
                    fontSize={9 / unit}
                  >
                    {Math.round(joint.angle)}° · r{+radius.toFixed(2)}
                  </text>
                );
              })}

            {!showRounded &&
              skeleton.vertices.map((vertex, i) => (
                <circle
                  key={i}
                  className={`ms-vertex ${dragging === i ? "on" : ""} ${editable ? "" : "locked"}`}
                  cx={vertex[0]}
                  cy={vertex[1]}
                  r={4 / unit}
                  onPointerDown={(e) => {
                    if (!editable) return;
                    // Captured by the stage rather than by the vertex: the move
                    // handler is on the stage, and a drag that runs past the edge
                    // of it should keep going rather than being abandoned there.
                    stage.current?.setPointerCapture(e.pointerId);
                    setFree(e.altKey);
                    setDragging(i);
                  }}
                />
              ))}
          </svg>

          <div className="method-side">
            <Swatch
              tone="surface"
              render={() => (
                <IconSvg
                  svg={drawAt(rounded ?? skeleton, tokens.canvas, extent, tokens.stroke.width)}
                  size={tokens.canvas}
                />
              )}
            />
            <p className="muted small-text">true size · {tokens.canvas}px</p>
            <dl className="method-facts">
              <dt>Joints</dt>
              <dd>{joints.length}</dd>
              <dt>Off the angle set</dt>
              <dd>{freeAngles ? "declared free" : offAngleCount(skeleton, language)}</dd>
              <dt>Curves drawn by hand</dt>
              <dd>{handCurves(skeleton)}</dd>
            </dl>
            {editable ? (
              <p className="muted small-text">
                Drag a vertex to move it. It snaps to the language's angles first and the grid second; hold ⌥ to leave
                both.
              </p>
            ) : (
              <p className="locked-note">
                <strong>Built in.</strong> This part is drawn from code, so it has no path data to edit — and an element
                of yours may not take its name. <em>Copy to edit</em> makes one that can.
              </p>
            )}
            {error && <p className="error-text small-text">{error}</p>}
            {preview && "error" in preview && <p className="error-text small-text">{preview.error}</p>}
            {preview && !("error" in preview) && preview.impacts.length > 0 && (
              <p className="muted small-text">
                {preview.impacts.filter((i) => i.changed).length} of {preview.impacts.length} icons change.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Grid({ extent, step }: { extent: number; step: number }) {
  if (step <= 0) return null;
  const lines: number[] = [];
  for (let at = 0; at <= extent + 1e-9; at += step) lines.push(at);
  return (
    <g className="ms-grid">
      {lines.map((at) => (
        <path key={`v${at}`} d={`M${at} 0V${extent}`} strokeWidth={0.02 * (extent / 24)} />
      ))}
      {lines.map((at) => (
        <path key={`h${at}`} d={`M0 ${at}H${extent}`} strokeWidth={0.02 * (extent / 24)} />
      ))}
    </g>
  );
}

/** Vertices attached to this one by a segment: what a drag has to stay square to. */
function neighboursOf(skeleton: Skeleton, vertex: number): Point[] {
  const out: Point[] = [];
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      const from = segmentStart(subpath, i);
      if (from === vertex && skeleton.vertices[segment.to]) out.push(skeleton.vertices[segment.to]!);
      if (segment.to === vertex && skeleton.vertices[from]) out.push(skeleton.vertices[from]!);
    });
  }
  return out;
}

function offAngleCount(skeleton: Skeleton, language: IconLanguage): number {
  let count = 0;
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      if (segment.kind !== "line") return;
      const heading = segmentHeading(skeleton, subpath, i);
      if (heading !== undefined && !isAllowedAngle(heading, language.grammar.angles, language.grammar.angleTolerance)) count++;
    });
  }
  return count;
}

function handCurves(skeleton: Skeleton): number {
  return skeleton.subpaths.reduce(
    (total, subpath) => total + subpath.segments.filter((s) => s.kind === "cubic").length,
    0,
  );
}

/**
 * The part at true size: the drawing scaled from its natural box onto the
 * canvas, so the row under the editor says what ships rather than what is being
 * inspected.
 */
function drawAt(skeleton: Skeleton, canvas: number, extent: number, stroke: number): string {
  const factor = canvas / extent;
  const scaled: Skeleton = {
    ...skeleton,
    vertices: skeleton.vertices.map(([x, y]) => [x * factor, y * factor] as Point),
    subpaths: skeleton.subpaths.map((subpath) => ({
      ...subpath,
      // Radii are lengths too, and scaling the points without them turns every
      // corner into an arc that no longer touches its own edges.
      segments: subpath.segments.map((segment) =>
        segment.kind === "arc" ? { ...segment, radius: segment.radius * factor } : segment,
      ),
    })),
  };
  const d = skeletonToPathData(scaled, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${canvas}" height="${canvas}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
