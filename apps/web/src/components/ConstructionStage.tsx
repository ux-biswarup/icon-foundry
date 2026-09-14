import type { Box, IconLanguage, OpticalShape, SizeTokens } from "@icon-foundry/icon-language";
import type { Recognition } from "@icon-foundry/icon-primitives";
import { setCorner, snapToConstruction, type Point, type Skeleton } from "@icon-foundry/icon-primitives";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  deleteSegments,
  duplicateSegments,
  moveControlPoint,
  moveVertices,
  recutFillet,
  setArcRadius,
  verticesOf,
} from "../lib/method-edits.js";
import { radiusFrom, segmentViews, type FilletView, type JointView } from "../lib/method-geometry.js";
import type { Construction } from "../lib/useConstruction.js";
import {
  BackdropLayer,
  ColouredLayer,
  ControlLayer,
  CurveHandleLayer,
  GapLayer,
  InkLayer,
  NearMissLayer,
  RadiiLayer,
  RecognisedLayer,
  RingBreachLayer,
} from "./MethodOverlays.js";

/**
 * A drawing on the icon canvas, with every rule it is judged by underneath it
 * and every decision in it draggable.
 *
 * Deliberately ignorant of *what* it is editing. It takes a skeleton in canvas
 * units and hands back a new one; whether that skeleton is a part being drawn
 * into the vocabulary or an icon on its way into the library is the caller's
 * business. That is the whole reason it exists as a component: the moment
 * before something enters the library is exactly when it most wants this
 * treatment, and a second editor built for that moment would be a second
 * editor to keep in step.
 *
 * There is no `mode` prop, and there should not be one. A page that needs
 * different chrome supplies different chrome around it.
 */

export type LayerName = "ink" | "colour" | "radii" | "angles" | "faults" | "keylines" | "grid";

export const DEFAULT_LAYERS: Record<LayerName, boolean> = {
  ink: true,
  colour: true,
  radii: true,
  angles: true,
  faults: true,
  keylines: false,
  grid: true,
};

export const LAYER_LABELS: Array<[LayerName, string, string]> = [
  ["ink", "Ink", "The drawing at the weight it will be painted"],
  ["colour", "Colour", "A hue per subpath, so the pieces are countable"],
  ["radii", "Radii", "The circle every corner is cut from"],
  ["angles", "Angles", "Label anything pointing off the grammar"],
  ["faults", "Faults", "Loose ends, tight gaps, and ink past the safe area"],
  ["keylines", "Keylines", "The box this is sized against"],
  ["grid", "Grid", "The language's grid at this optical size"],
];

/** What a pointer grabbed. Each one edits a different kind of decision. */
type DragKind = "segment" | "vertex" | "arc" | "radius" | "fillet" | "cp1" | "cp2";

interface Drag {
  kind: DragKind;
  /**
   * The drawing as it was when the pointer went down.
   *
   * Every frame is computed from this rather than from the frame before it. The
   * difference only shows up under snapping: applied to the previous frame, a
   * snap that moves the geometry half a unit becomes the starting point for the
   * next snap, and a slow drag walks away from the pointer.
   */
  base: Skeleton;
  origin: Point;
  moving: number[];
  anchor: number;
  sub: number;
  index: number;
  joint: JointView | undefined;
  fillet: FilletView | undefined;
  free: boolean;
  moved: boolean;
}

export interface StageProps {
  /** The drawing, in canvas units. */
  skeleton: Skeleton;
  /** What to draw, which is the rounded form when rounding is on. */
  shown: Skeleton;
  /**
   * `continues` is true for every frame of a drag after the first.
   *
   * Undo needs it. A drag calls back sixty times a second, and a caller that
   * recorded each call would bury one gesture under a hundred history entries —
   * undo would then walk the pointer backwards instead of putting the drawing
   * back. The stage is the only thing that knows where one gesture ends.
   */
  onChange: (next: Skeleton, continues?: boolean) => void;
  language: IconLanguage;
  tokens: SizeTokens;
  measured: Construction;
  /** The box this drawing is sized against — its own, not all four. */
  keyline: { shape: OpticalShape; box: Box } | undefined;
  freeAngles: boolean;
  editable: boolean;
  showRounded: boolean;
  layers: Record<LayerName, boolean>;
  picked: ReadonlySet<string>;
  onPick: (ids: ReadonlySet<string>) => void;
  recognition?: Recognition | undefined;
  /** Stage size in CSS pixels. */
  size?: number;
}

export function ConstructionStage({
  skeleton,
  shown,
  onChange,
  language,
  tokens,
  measured,
  keyline,
  freeAngles,
  editable,
  showRounded,
  layers,
  picked,
  onPick,
  recognition,
  size = 520,
}: StageProps) {
  const canvas = tokens.canvas;
  const uid = `mth-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const stage = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>();
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const { views, joints, fillets, misses, gaps, pastLive, pastTrim } = measured;

  const u = canvas / size;
  const pickedVertices = verticesOf(skeleton, picked);

  /* ---------------------------------------------------------------- */
  /* Pointer                                                           */
  /* ---------------------------------------------------------------- */

  const toCanvas = (event: ReactPointerEvent): Point | undefined => {
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return [
      ((event.clientX - rect.left) / rect.width) * canvas,
      ((event.clientY - rect.top) / rect.height) * canvas,
    ];
  };

  /** Vertices attached to this one by a segment: what a drag stays square to. */
  const neighboursOf = (of: Skeleton, vertex: number): Point[] => {
    const out: Point[] = [];
    for (const view of segmentViews(of, language, freeAngles)) {
      if (view.fromVertex === vertex) out.push(view.to);
      else if (view.toVertex === vertex) out.push(view.from);
    }
    return out;
  };

  /**
   * Where a drag actually lands.
   *
   * Three rules in order, and the order is the argument. A point already in the
   * drawing wins, because two things meeting is the strongest intention a drag
   * can express. Failing that a single vertex is pulled onto one of the
   * language's angles, because the grammar is the next strongest. Only then the
   * grid. Holding ⌥ leaves all three, which is how a part declares it needs an
   * angle the set does not own.
   */
  const landing = (target: Point, moving: ReadonlySet<number>, of: Skeleton, free: boolean): Point => {
    if (free) return target;

    const pull = (tokens.grid > 0 ? tokens.grid : 0.5) * 1.5;
    let nearest: Point | undefined;
    let best = Infinity;
    of.vertices.forEach((vertex, i) => {
      if (moving.has(i)) return;
      const distance = Math.hypot(vertex[0] - target[0], vertex[1] - target[1]);
      if (distance < pull && distance < best) {
        best = distance;
        nearest = vertex;
      }
    });
    if (nearest) return nearest;

    if (moving.size === 1) {
      const only = [...moving][0] as number;
      const { point } = snapToConstruction(target, neighboursOf(of, only), {
        grid: tokens.grid,
        angles: language.grammar.angles,
      });
      return point;
    }

    // The whole selection moves by one delta, so snapping the point under the
    // pointer snaps the group without distorting it — and a drawing that was
    // sitting half a step off the grid gets put back on it, which in a
    // construction editor is the point rather than a side effect.
    const step = tokens.grid > 0 ? tokens.grid : 0.5;
    return [Math.round(target[0] / step) * step, Math.round(target[1] / step) * step];
  };

  const toGrid = (value: number): number => {
    const step = tokens.grid > 0 ? tokens.grid : 0.5;
    return Math.round(value / step) * step;
  };

  const begin = (
    kind: DragKind,
    event: ReactPointerEvent,
    at: Partial<Drag> & { anchor: number; sub: number; index: number },
  ) => {
    if (!editable) return;
    const origin = toCanvas(event);
    if (!origin) return;
    event.stopPropagation();
    stage.current?.setPointerCapture(event.pointerId);
    setMenu(undefined);
    setDrag({
      kind,
      base: skeleton,
      origin,
      moving: at.moving ?? [at.anchor],
      anchor: at.anchor,
      sub: at.sub,
      index: at.index,
      joint: at.joint,
      fillet: at.fillet,
      free: event.altKey,
      moved: false,
    });
  };

  const onMove = (event: ReactPointerEvent) => {
    if (!drag || !editable) return;
    const raw = toCanvas(event);
    if (!raw) return;
    const free = drag.free || event.altKey;
    const delta: Point = [raw[0] - drag.origin[0], raw[1] - drag.origin[1]];
    if (!drag.moved && Math.hypot(delta[0], delta[1]) < u * 2) return;

    if (drag.kind === "segment" || drag.kind === "vertex") {
      const from = drag.base.vertices[drag.anchor];
      if (!from) return;
      const moving = new Set(drag.moving);
      const landed = landing([from[0] + delta[0], from[1] + delta[1]], moving, drag.base, free);
      onChange(moveVertices(drag.base, moving, [landed[0] - from[0], landed[1] - from[1]]), drag.moved);
    } else if (drag.kind === "fillet" && drag.fillet) {
      const radius = radiusFrom(drag.fillet, raw);
      onChange(recutFillet(drag.base, drag.fillet, free ? radius : Math.max(0, toGrid(radius))), drag.moved);
    } else if (drag.kind === "radius" && drag.joint) {
      const radius = radiusFrom(drag.joint, raw);
      onChange(setCorner(drag.base, drag.joint.vertex, free ? radius : Math.max(0, toGrid(radius))), drag.moved);
    } else if (drag.kind === "arc") {
      const view = segmentViews(drag.base, language, freeAngles).find(
        (v) => v.sub === drag.sub && v.index === drag.index,
      );
      if (!view) return;
      // An arc's centre is only free along the perpendicular bisector of its
      // chord; anything across that is a centre the arc cannot have.
      const mid: Point = [(view.from[0] + view.to[0]) / 2, (view.from[1] + view.to[1]) / 2];
      const span = Math.hypot(view.to[0] - view.from[0], view.to[1] - view.from[1]);
      if (span < 1e-6) return;
      const perpendicular: Point = [-(view.to[1] - view.from[1]) / span, (view.to[0] - view.from[0]) / span];
      const along = (raw[0] - mid[0]) * perpendicular[0] + (raw[1] - mid[1]) * perpendicular[1];
      const radius = Math.hypot(span / 2, along);
      onChange(setArcRadius(drag.base, drag.sub, drag.index, free ? radius : Math.max(span / 2, toGrid(radius))), drag.moved);
    } else if (drag.kind === "cp1" || drag.kind === "cp2") {
      const to: Point = free ? raw : [toGrid(raw[0]), toGrid(raw[1])];
      onChange(moveControlPoint(drag.base, drag.sub, drag.index, drag.kind === "cp1" ? 1 : 2, to), drag.moved);
    }

    if (!drag.moved) setDrag({ ...drag, moved: true });
  };

  const endDrag = (event: ReactPointerEvent) => {
    stage.current?.releasePointerCapture(event.pointerId);
    setDrag(undefined);
  };

  /**
   * Clicking a segment already in the selection keeps the rest of it, so a
   * group can be picked up by any of its members. Clicking one outside replaces
   * it. Shift toggles. The same three rules as every canvas tool, which is the
   * point — nobody should have to learn selection twice.
   */
  const choose = (id: string, additive: boolean): ReadonlySet<string> => {
    if (additive) {
      const next = new Set(picked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }
    return picked.has(id) ? picked : new Set([id]);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const act = (fn: (s: Skeleton) => Skeleton) => onChange(fn(skeleton));

  return (
    <div className="mth-stage-wrap">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drawing surface
          has no keyboard equivalent; every handle on it is a real button. */}
      <svg
        ref={stage}
        className={`method-svg ${drag ? "dragging" : ""}`}
        width={size}
        height={size}
        viewBox={`0 0 ${canvas} ${canvas}`}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onLostPointerCapture={() => setDrag(undefined)}
        onPointerDown={() => {
          setMenu(undefined);
          onPick(new Set());
        }}
        onContextMenu={(e) => {
          if (!editable || picked.size === 0) return;
          e.preventDefault();
          const rect = stage.current?.getBoundingClientRect();
          setMenu({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
        }}
      >
        <BackdropLayer
          canvas={canvas}
          tokens={tokens}
          keyline={keyline}
          u={u}
          zoom={size / canvas}
          show={{ grid: layers.grid, safeArea: true, keyline: layers.keylines }}
        />

        {layers.ink && <InkLayer views={views} tokens={tokens} />}
        {layers.faults && (
          <RingBreachLayer
            views={views}
            tokens={tokens}
            canvas={canvas}
            uid={uid}
            pastLive={pastLive}
            pastTrim={pastTrim}
          />
        )}
        {layers.colour && <ColouredLayer views={views} u={u} />}

        {/* The selection, under the control line rather than over it, so
            picking a segment never hides the geometry you picked it for.
            Only in the skeleton view: rounding renumbers the segments, so
            the same id means a different piece of geometry there. */}
        {!showRounded && (
          <g className="mth-picked" pointerEvents="none" strokeWidth={10 * u}>
            {views
              .filter((v) => picked.has(v.id))
              .map((v) => (
                <path key={v.id} d={v.d} />
              ))}
          </g>
        )}

        {layers.faults && <GapLayer gaps={gaps} u={u} />}
        <CurveHandleLayer views={views} u={u} />
        {layers.radii && (
          <RadiiLayer joints={joints} fillets={fillets} u={u} grid={tokens.grid} showLabels={!showRounded} />
        )}
        <ControlLayer views={views} u={u} uid={uid} showAngles={layers.angles} />
        {layers.faults && <NearMissLayer misses={misses} u={u} />}
        <RecognisedLayer recognition={recognition} u={u} box={recognition ? recognition.box : undefined} />

        {/* Hit targets. Invisible and fat, because a 1px line is not a thing
            anyone can click, and the visible marks below are sized to be read
            rather than to be grabbed.
            Absent from the rounded view on purpose: rounding is what the
            language does *to* the drawing, so it has its own segments and its
            own joints, and letting a drag there write back through them would
            edit whichever piece of the skeleton happened to share an index. */}
        {editable && !showRounded && (
          <g className="mth-hits">
            {views.map((view) => (
              <path
                key={view.id}
                className="mth-hit-seg"
                d={view.d}
                strokeWidth={9 * u}
                onPointerDown={(e) => {
                  // Before the shift check, not inside `begin`: adding to a
                  // selection starts no drag, and letting that press reach the
                  // stage would have the background handler clear the selection
                  // it was being added to.
                  e.stopPropagation();
                  const next = choose(view.id, e.shiftKey);
                  onPick(next);
                  if (e.shiftKey) return;
                  const moving = [...verticesOf(skeleton, next)];
                  begin("segment", e, {
                    anchor: view.fromVertex,
                    sub: view.sub,
                    index: view.index,
                    moving: moving.length > 0 ? moving : [view.fromVertex, view.toVertex],
                  });
                }}
              />
            ))}

            {views.map((view) =>
              view.arc ? (
                <circle
                  key={`arc-${view.id}`}
                  className="mth-hit-dot mth-hit-arc"
                  cx={view.arc.centre[0]}
                  cy={view.arc.centre[1]}
                  r={6 * u}
                  onPointerDown={(e) => begin("arc", e, { anchor: view.fromVertex, sub: view.sub, index: view.index })}
                />
              ) : null,
            )}

            {views.map((view) =>
              view.cubic ? (
                <g key={`cp-${view.id}`}>
                  <circle
                    className="mth-hit-dot mth-hit-cp1"
                    cx={view.cubic.c1[0]}
                    cy={view.cubic.c1[1]}
                    r={6 * u}
                    onPointerDown={(e) => begin("cp1", e, { anchor: view.fromVertex, sub: view.sub, index: view.index })}
                  />
                  <circle
                    className="mth-hit-dot mth-hit-cp2"
                    cx={view.cubic.c2[0]}
                    cy={view.cubic.c2[1]}
                    r={6 * u}
                    onPointerDown={(e) => begin("cp2", e, { anchor: view.toVertex, sub: view.sub, index: view.index })}
                  />
                </g>
              ) : null,
            )}

            {/* A corner the ramp has not cut yet. */}
            {joints.map((joint) =>
              joint.centre ? (
                <circle
                  key={`r-${joint.vertex}`}
                  className="mth-hit-dot mth-hit-radius"
                  cx={joint.centre[0]}
                  cy={joint.centre[1]}
                  r={6 * u}
                  onPointerDown={(e) =>
                    begin("radius", e, { anchor: joint.vertex, sub: joint.sub, index: joint.joint, joint })
                  }
                />
              ) : null,
            )}

            {/* A corner something already cut, grabbed at the centre of the
                circle it was cut from. Same gesture as above, because to the
                person dragging it is the same thing. */}
            {fillets.map((fillet) => (
              <circle
                key={`f-${fillet.id}`}
                className="mth-hit-dot mth-hit-fillet"
                cx={fillet.centre[0]}
                cy={fillet.centre[1]}
                r={6 * u}
                onPointerDown={(e) =>
                  begin("fillet", e, { anchor: fillet.fromVertex, sub: fillet.sub, index: fillet.index, fillet })
                }
              />
            ))}

            {skeleton.vertices.map((vertex, i) => (
              <circle
                // Index is the identity: a vertex has no name, and its position
                // is exactly what a drag is changing.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={i}
                className="mth-hit-dot mth-hit-vertex"
                cx={vertex[0]}
                cy={vertex[1]}
                r={6 * u}
                onPointerDown={(e) => begin("vertex", e, { anchor: i, sub: 0, index: 0 })}
              />
            ))}
          </g>
        )}

        {/* The visible handles, drawn last so nothing covers them. */}
        {!showRounded && (
          <g className="mth-dots" pointerEvents="none">
            {views.map((view) =>
              view.cubic ? (
                <g key={`cpd-${view.id}`}>
                  <circle className="mth-cp" cx={view.cubic.c1[0]} cy={view.cubic.c1[1]} r={2 * u} strokeWidth={u} />
                  <circle className="mth-cp" cx={view.cubic.c2[0]} cy={view.cubic.c2[1]} r={2 * u} strokeWidth={u} />
                </g>
              ) : null,
            )}
            {fillets.map((fillet) => (
              <circle
                key={`fd-${fillet.id}`}
                className="mth-radius-handle cut"
                cx={fillet.centre[0]}
                cy={fillet.centre[1]}
                r={2.5 * u}
                strokeWidth={u}
              />
            ))}
            {joints.map((joint) =>
              joint.centre ? (
                <circle
                  key={`rd-${joint.vertex}`}
                  className={`mth-radius-handle ${joint.overridden ? "stated" : ""}`}
                  cx={joint.centre[0]}
                  cy={joint.centre[1]}
                  r={2.5 * u}
                  strokeWidth={u}
                />
              ) : null,
            )}
            {skeleton.vertices.map((vertex, i) => (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: positional identity
                key={i}
                className={`ms-vertex ${pickedVertices.has(i) ? "on" : ""} ${editable ? "" : "locked"}`}
                cx={vertex[0]}
                cy={vertex[1]}
                r={3.5 * u}
                strokeWidth={1.5 * u}
              />
            ))}
          </g>
        )}
      </svg>

      {menu && (
        <div className="mth-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              act((s) => deleteSegments(s, picked));
              onPick(new Set());
              setMenu(undefined);
            }}
          >
            Delete {picked.size === 1 ? "segment" : `${picked.size} segments`}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const step = tokens.grid > 0 ? tokens.grid * 2 : 1;
              act((s) => duplicateSegments(s, picked, [step, step]));
              setMenu(undefined);
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={![...pickedVertices].some((v) => skeleton.corners[v] !== undefined)}
            onClick={() => {
              act((s) => [...pickedVertices].reduce((next, v) => setCorner(next, v, undefined), s));
              setMenu(undefined);
            }}
          >
            Give the radius back to the language
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Which layers are on.
 *
 * A component rather than ten lines of JSX copied onto a second page, because
 * the moment it is copied the two pages start offering different layers and
 * the vocabulary the studio teaches stops being one vocabulary.
 */
export function LayerToggles({
  layers,
  onChange,
}: {
  layers: Record<LayerName, boolean>;
  onChange: (next: Record<LayerName, boolean>) => void;
}) {
  return (
    <div className="pc-toolbar mth-layers">
      <span className="muted small-text">Show</span>
      {LAYER_LABELS.map(([name, label, hint]) => (
        <button
          type="button"
          key={name}
          className={`chip ${layers[name] ? "on" : ""}`}
          title={hint}
          onClick={() => onChange({ ...layers, [name]: !layers[name] })}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
