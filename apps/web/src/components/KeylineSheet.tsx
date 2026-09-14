import {
  OPTICAL_SHAPES,
  defaultOpticalBoxes,
  type Box,
  type IconLanguage,
  type OpticalShape,
  type SizeTokens,
} from "@icon-foundry/icon-language";
import type { PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GridLayer } from "./IconPreview.js";

/**
 * The keyline sheet: the rule every icon is sized against, on a canvas.
 *
 * Four shapes exist because icons of different proportions do not read as the
 * same size when drawn to the same box. A circle presents less ink than a
 * square of equal width — it has no corners — so it is drawn larger to look
 * equally big, and a wide shape gives back height for the same reason.
 *
 * Drawn rather than tabulated, because this is a decision about proportion and
 * nobody can judge proportion from four numbers.
 *
 * It opens at true size: a 24px optical size is 24 real pixels, because that is
 * the size the decision is actually for, and a sheet that always opens blown up
 * quietly flatters every box on it. Zoom is then a thing you do — scroll to
 * pan, ⌘-scroll or the toolbar to zoom — rather than a scale someone chose for
 * you. The drawings scale; the annotation does not, so a measurement stays the
 * same size on screen whether you are at 100% or 1600%.
 *
 * Every part in the set declares one of these four shapes, so a change here
 * moves every part that declared it. The count under each name is that reach,
 * the same idea the construction traits already use.
 */

/** Screen pixels of annotation margin kept around each square at any zoom. */
const ANNOT = 34;
/** World-unit spacing. World units are canvas units, so these are true pixels. */
const FIG_GAP = 56;
const ROW_GAP = 84;
/** Below this many screen pixels across, a figure carries no annotation. */
const LEGIBLE = 46;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 48;

/** Which item inside a figure is selected. The canvas square is not editable. */
type Part = "box" | "pad";

interface Placed {
  canvas: number;
  shape: OpticalShape;
  tokens: SizeTokens;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function KeylineSheet({
  language,
  registry,
  sizes,
  selected,
  onSelect,
  onChange,
}: {
  language: IconLanguage;
  registry: PrimitiveRegistry;
  /** Optical sizes to draw, largest last so the sheet reads small to large. */
  sizes: number[];
  selected: { canvas: number; shape: OpticalShape } | undefined;
  onSelect: (at: { canvas: number; shape: OpticalShape } | undefined) => void;
  /** Width and height in canvas units; the box is re-centred by the caller. */
  onChange: (canvas: number, shape: OpticalShape, size: { width: number; height: number }) => void;
}) {
  const users = countByShape(registry);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  /*
   * Which item within the selected figure. Deliberately local: the rail cares
   * which shape is being edited, and not whether the pointer landed on the box
   * or on the space around it, so lifting this would put a canvas detail into
   * a state the whole page has to carry.
   */
  const [part, setPart] = useState<Part>("box");

  const layout = useMemo(() => {
    const figures: Placed[] = [];
    const rows: { canvas: number; tokens: SizeTokens; y: number }[] = [];
    let y = 0;
    let width = 0;
    for (const canvas of sizes) {
      const tokens = language.sizes[canvas];
      if (!tokens) continue;
      let x = 0;
      for (const shape of OPTICAL_SHAPES) {
        figures.push({ canvas, shape, tokens, x, y });
        x += canvas + FIG_GAP;
      }
      width = Math.max(width, x - FIG_GAP);
      rows.push({ canvas, tokens, y });
      y += canvas + ROW_GAP;
    }
    return { figures, rows, width, height: Math.max(0, y - ROW_GAP) };
  }, [language, sizes]);

  /** Put the sheet in the middle the first time we know how big the pane is. */
  const centred = useRef(false);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el || centred.current) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    centred.current = true;
    setView((v) => ({
      zoom: v.zoom,
      x: Math.round((r.width - layout.width * v.zoom) / 2),
      y: Math.round((r.height - layout.height * v.zoom) / 2),
    }));
  }, [layout.width, layout.height]);

  /*
   * Zoom about a point in viewport coordinates, so the pixel under the cursor
   * stays put.
   *
   * By a factor rather than to a value: two clicks of the button in one frame
   * both read the same `zoom` out of their render closure, so an absolute
   * target makes the second click a no-op and the button feels stuck.
   */
  const zoomBy = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const z = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const k = z / v.zoom;
      return { zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  /*
   * Wheel has to be bound by hand: React's onWheel is passive, and a passive
   * listener may not preventDefault, so ⌘-scroll would zoom the whole page out
   * from under the canvas instead of zooming the canvas.
   */
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) {
        zoomBy(Math.exp(-e.deltaY / 160), cx, cy);
      } else {
        setView((v) => ({ zoom: v.zoom, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  /* Drag the background to pan. A drag that never moved is a click on nothing,
   * which is how you let go of a selection. */
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    setView((v) => ({ zoom: v.zoom, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d && !d.moved) onSelect(undefined);
  };

  const fit = () => {
    const el = viewport.current;
    if (!el || layout.width === 0) return;
    const r = el.getBoundingClientRect();
    const z = clamp(Math.min((r.width - 90) / layout.width, (r.height - 90) / layout.height), MIN_ZOOM, MAX_ZOOM);
    setView({ zoom: z, x: (r.width - layout.width * z) / 2, y: (r.height - layout.height * z) / 2 });
  };
  const trueSize = () => {
    const el = viewport.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setView({ zoom: 1, x: Math.round((r.width - layout.width) / 2), y: Math.round((r.height - layout.height) / 2) });
  };

  const z = view.zoom;
  const annotated = (canvas: number) => canvas * z >= LEGIBLE;
  const active = layout.figures.find((f) => f.canvas === selected?.canvas && f.shape === selected.shape);

  return (
    <div className="keyline-canvas">
      <div className="kl-toolbar">
        <button
          className="chip"
          onClick={() => {
            const r = viewport.current?.getBoundingClientRect();
            if (r) zoomBy(1 / 1.4, r.width / 2, r.height / 2);
          }}
          title="Zoom out"
        >
          −
        </button>
        <span className="kl-zoom">{Math.round(z * 100)}%</span>
        <button
          className="chip"
          onClick={() => {
            const r = viewport.current?.getBoundingClientRect();
            if (r) zoomBy(1.4, r.width / 2, r.height / 2);
          }}
          title="Zoom in"
        >
          +
        </button>
        <button className={`chip ${z === 1 ? "on" : ""}`} onClick={trueSize} title="True size: one canvas unit is one real pixel">
          True size
        </button>
        <button className="chip" onClick={fit} title="Fit the whole sheet">
          Fit
        </button>
        <span className="muted small-text">scroll to pan · ⌘-scroll to zoom · click an item and type</span>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: a pan surface has no
          keyboard equivalent; every item on it is a real button. */}
      <div
        className="kl-viewport"
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {layout.rows.map((row) => (
          <div
            key={row.canvas}
            className="kl-row-head"
            style={{ left: view.x, top: view.y + row.y * z - ANNOT - 16 }}
          >
            <b>{row.canvas}px</b>
            <span className="muted"> safe area {row.tokens.safeArea} · grid {row.tokens.grid}</span>
          </div>
        ))}

        {layout.figures.map((f) => (
          <KeylineFigure
            key={`${f.canvas}:${f.shape}`}
            placed={f}
            zoom={z}
            originX={view.x}
            originY={view.y}
            annotated={annotated(f.canvas)}
            selected={selected?.canvas === f.canvas && selected.shape === f.shape}
            part={part}
            onPick={(next) => {
              setPart(next);
              onSelect({ canvas: f.canvas, shape: f.shape });
            }}
          />
        ))}

        {layout.figures.map((f) =>
          annotated(f.canvas) ? (
            <div
              key={`label:${f.canvas}:${f.shape}`}
              className="kl-label"
              style={{ left: view.x + (f.x + f.canvas / 2) * z, top: view.y + (f.y + f.canvas) * z + ANNOT + 2 }}
            >
              {f.shape}
              <span className="muted"> · {users[f.shape] ?? 0}</span>
            </div>
          ) : null,
        )}

        {active && (
          <Inspector
            // Keyed on what is being edited, not on its value: including the
            // value would remount the panel on every keystroke and drop focus.
            key={`${active.canvas}:${active.shape}:${part}`}
            placed={active}
            part={part}
            onPart={setPart}
            left={view.x + (active.x + active.canvas / 2) * z}
            top={view.y + (active.y + active.canvas) * z + (annotated(active.canvas) ? ANNOT + 22 : 10)}
            onChange={(size) => onChange(active.canvas, active.shape, size)}
            onClose={() => onSelect(undefined)}
          />
        )}
      </div>
    </div>
  );
}

/** How many parts declare each optical shape, so a change states its reach. */
function countByShape(registry: PrimitiveRegistry): Partial<Record<OpticalShape, number>> {
  const out: Partial<Record<OpticalShape, number>> = {};
  for (const name of registry.names()) {
    const shape = registry.get(name)?.opticalShape;
    if (shape) out[shape] = (out[shape] ?? 0) + 1;
  }
  return out;
}

/** Whole units read as whole units; a half step should not print as 13.50. */
const trim = (v: number): string => String(Math.round(v * 100) / 100);

function KeylineFigure({
  placed,
  zoom,
  originX,
  originY,
  annotated,
  selected,
  part,
  onPick,
}: {
  placed: Placed;
  zoom: number;
  originX: number;
  originY: number;
  /** Whether this figure is drawn large enough on screen to carry measurements. */
  annotated: boolean;
  selected: boolean;
  part: Part;
  onPick: (part: Part) => void;
}) {
  const { canvas: c, shape, tokens, x: fx, y: fy } = placed;
  const box = tokens.optical[shape];
  const authored = !sameBox(box, defaultOpticalBoxes(c, tokens.safeArea, tokens.grid)[shape]);

  // The gap between the box and the canvas edge. The origin is derived by
  // centring, so the far side matches and one number describes each axis.
  const padX = box.x;
  const padY = box.y;

  // A world unit is a true pixel, so one screen pixel is 1/zoom of one. Every
  // stroke, tick and label below is written in screen pixels and converted,
  // which is what keeps annotation the same size at 100% and at 1600%.
  const u = 1 / zoom;
  const m = ANNOT * u;
  const span = c + 2 * m;
  const font = 10 * u;
  const tick = 3 * u;
  const gap = 3 * u;
  const dim = -m * 0.52;

  const hatchId = `kl-hatch-${c}-${shape}`;
  const padOn = selected && part === "pad";
  const boxOn = selected && part === "box";

  const hit = (next: Part) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onPick(next);
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <svg
      className="kl-figure"
      viewBox={`${-m} ${-m} ${span} ${span}`}
      style={{
        left: originX + fx * zoom - ANNOT,
        top: originY + fy * zoom - ANNOT,
        width: span * zoom,
        height: span * zoom,
      }}
    >
      <defs>
        {/* Spacing follows the zoom, not the row, so the hatch is the same
            weight everywhere on the sheet. */}
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width={5 * u} height={5 * u} patternTransform="rotate(45)">
          {/*
           * Selecting the padding colours the hatch rather than replacing it.
           * A solid fill would say the region had become a shape; it has not —
           * it is still the space left over, and it should still read as
           * hatching once it is the thing you are editing.
           */}
          {padOn && <rect x={0} y={0} width={5 * u} height={5 * u} className="kl-hatch-wash" />}
          {/* Centred in the tile: a line on the edge has half its width clipped
              away, and the hatch comes out at half the weight asked for. */}
          <line
            x1={2.5 * u}
            y1={0}
            x2={2.5 * u}
            y2={5 * u}
            className={`kl-hatch-line${padOn ? " is-selected" : ""}`}
            strokeWidth={(padOn ? 1.5 : 1) * u}
          />
        </pattern>
      </defs>
      {/* Paper first: the square is a sheet, and everything else sits on it. */}
      <rect x={0} y={0} width={c} height={c} className="kl-canvas" strokeWidth={u} />

      {/*
       * The language's own grid, under everything.
       *
       * The same component the icon preview draws, because it is the same
       * grid — `tokens.grid` for this optical size, whole units solid. A
       * keyline box is a decision about where a drawing sits on that grid, and
       * judging it against a blank square asks you to imagine the very thing
       * the sheet exists to show. Held back in opacity so it stays the paper
       * the boxes are drawn on rather than another mark competing with them.
       */}
      <GridLayer canvas={c} step={tokens.grid} u={u} zoom={zoom} />

      {/*
       * The padding, as an area rather than a number.
       *
       * This is the space the box gives back to the canvas, and it is the whole
       * reason the four shapes differ: a circle keeps less of it than a square
       * so that the two read as the same size. Hatched rather than tinted, so
       * it cannot be mistaken for a third shape — it is what is left over, and
       * it should look left over. It is also a hit target: the padding is a
       * number a designer wants to set directly, not one to reach by
       * subtracting a width from a canvas in their head.
       */}
      <path
        d={`M0 0H${c}V${c}H0Z ${holePath(shape, box)}`}
        fillRule="evenodd"
        className="kl-gutter"
        fill={`url(#${hatchId})`}
        pointerEvents="fill"
        onClick={hit("pad")}
        onPointerDown={stop}
      />

      {/* The diagonals: the frame every box is judged against. */}
      <line x1={0} y1={0} x2={c} y2={c} className="kl-diagonal" strokeWidth={u} />
      <line x1={c} y1={0} x2={0} y2={c} className="kl-diagonal" strokeWidth={u} />

      {shape === "circle" ? (
        <circle
          cx={box.x + box.width / 2}
          cy={box.y + box.height / 2}
          r={box.width / 2}
          className={`kl-box${boxOn ? " is-selected" : ""}`}
          strokeWidth={(boxOn ? 2 : 1) * u}
          onClick={hit("box")}
          onPointerDown={stop}
        />
      ) : (
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          className={`kl-box${boxOn ? " is-selected" : ""}`}
          strokeWidth={(boxOn ? 2 : 1) * u}
          onClick={hit("box")}
          onPointerDown={stop}
        />
      )}

      {authored && <circle cx={c - 1.5 * u * 3} cy={1.5 * u * 3} r={2 * u} className="kl-authored-dot" />}

      {/*
       * The padding again, as a measurement, drawn the way it would be on
       * paper: extension lines off the two edges being compared, a run between
       * them, and the number over it. It reads straight from the tokens, so
       * typing a value moves the line and the number together.
       *
       * Hidden when the figure is too small to hold it. At true size a 16px
       * square has no room for a legend, and drawing one anyway would bury the
       * thing being judged under its own labels.
       */}
      {annotated && (
        <g className={`kl-dim${padOn ? " is-pad" : ""}${boxOn ? " is-box" : ""}`}>
          <line x1={0} y1={0} x2={0} y2={dim - gap} strokeWidth={u} className="kl-dim-ext" />
          <line x1={padX} y1={box.y} x2={padX} y2={dim - gap} strokeWidth={u} className="kl-dim-ext" />
          <line x1={0} y1={dim} x2={padX} y2={dim} strokeWidth={u} className="kl-dim-run" />
          <line x1={0} y1={dim - tick} x2={0} y2={dim + tick} strokeWidth={u} className="kl-dim-run" />
          <line x1={padX} y1={dim - tick} x2={padX} y2={dim + tick} strokeWidth={u} className="kl-dim-run" />
          <text x={padX / 2} y={dim - gap} fontSize={font} textAnchor="middle" className="kl-dim-text">
            {trim(padX)}
          </text>

          <line x1={0} y1={0} x2={dim - gap} y2={0} strokeWidth={u} className="kl-dim-ext" />
          <line x1={box.x} y1={padY} x2={dim - gap} y2={padY} strokeWidth={u} className="kl-dim-ext" />
          <line x1={dim} y1={0} x2={dim} y2={padY} strokeWidth={u} className="kl-dim-run" />
          <line x1={dim - tick} y1={0} x2={dim + tick} y2={0} strokeWidth={u} className="kl-dim-run" />
          <line x1={dim - tick} y1={padY} x2={dim + tick} y2={padY} strokeWidth={u} className="kl-dim-run" />
          <text
            x={dim - gap}
            y={padY / 2}
            fontSize={font}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90 ${dim - gap} ${padY / 2})`}
            className="kl-dim-text"
          >
            {trim(padY)}
          </text>

          {/* The box itself, across the bottom. */}
          <line x1={box.x} y1={c} x2={box.x} y2={c - dim + gap} strokeWidth={u} className="kl-dim-ext" />
          <line x1={box.x + box.width} y1={c} x2={box.x + box.width} y2={c - dim + gap} strokeWidth={u} className="kl-dim-ext" />
          <line x1={box.x} y1={c - dim} x2={box.x + box.width} y2={c - dim} strokeWidth={u} className="kl-dim-run kl-dim-box" />
          <text x={c / 2} y={c - dim + gap + font} fontSize={font} textAnchor="middle" className="kl-dim-text kl-dim-box">
            {trim(box.width)} × {trim(box.height)}
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * The value, over the thing it describes.
 *
 * Typing here is the same edit as typing in the rail, but it happens where the
 * eye already is: you click the padding on the drawing and set the padding,
 * rather than working out which of eight numbers in a list is the one under
 * the pointer.
 *
 * It applies as you type, with no key to press. The point of putting the number
 * on top of the drawing is to watch the drawing answer, and a value that waits
 * for Enter gives you a field and a stale picture — which is the arrangement
 * the rail already had. A keystroke you have to remember is also one you can
 * forget, and then the box you are looking at is not the box you typed.
 */
function Inspector({
  placed,
  part,
  onPart,
  left,
  top,
  onChange,
  onClose,
}: {
  placed: Placed;
  part: Part;
  onPart: (part: Part) => void;
  left: number;
  top: number;
  onChange: (size: { width: number; height: number }) => void;
  onClose: () => void;
}) {
  const { canvas: c, shape, tokens } = placed;
  const box = tokens.optical[shape];
  // A square and a circle are each defined by one number. Offering width and
  // height separately invites an ellipse or an oblong square — shapes that are
  // not among the four, and that anyone wanting them should reach by choosing
  // horizontal or vertical instead.
  const locked = shape === "circle" || shape === "square";

  /*
   * The fields are text, not numbers, and they are not re-seeded from the
   * language while they are open.
   *
   * Half-typed input is a real state: "1" on the way to "12" is not a request
   * to make the box one unit wide, and an empty field is not a request for
   * zero. Holding the text lets the caller see only values that parse, and
   * lets the caret stay where the typist put it.
   */
  const shown = part === "pad" ? { a: box.x, b: box.y } : { a: box.width, b: box.height };
  const [a, setA] = useState(trim(shown.a));
  const [b, setB] = useState(trim(shown.b));
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.select(), []);

  const push = (nextA: string, nextB: string) => {
    if (nextA.trim() === "" || (!locked && nextB.trim() === "")) return;
    const av = Number(nextA);
    const bv = locked ? av : Number(nextB);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return;
    const size = part === "pad" ? { width: c - 2 * av, height: c - 2 * bv } : { width: av, height: bv };
    if (size.width <= 0 || size.height <= 0) return;
    onChange(size);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a floating panel that
    // must not hand its pointer events to the pan surface underneath it.
    <div
      className="kl-inspector"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="kl-inspector-tabs">
        {(["box", "pad"] as const).map((p) => (
          <button key={p} className={`kl-itab ${part === p ? "on" : ""}`} onClick={() => onPart(p)}>
            {p === "box" ? shape : "padding"}
          </button>
        ))}
      </div>
      <div className="kl-inspector-fields">
        <label>
          {part === "pad" ? "X" : "W"}
          <input
            ref={first}
            type="number"
            step={tokens.grid}
            value={a}
            onChange={(e) => {
              setA(e.target.value);
              push(e.target.value, b);
            }}
          />
        </label>
        <label className={locked ? "is-locked" : ""}>
          {part === "pad" ? "Y" : "H"}
          <input
            type="number"
            step={tokens.grid}
            // A locked shape follows its one number, so the disabled field has
            // to show what that number did rather than what it was.
            value={locked ? a : b}
            disabled={locked}
            onChange={(e) => {
              setB(e.target.value);
              push(a, e.target.value);
            }}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * The box as a subpath to cut out of the canvas square. `fill-rule="evenodd"`
 * does the subtraction, which is what makes the padding a single hatched region
 * rather than four strips that would have to meet exactly at the corners — and
 * a single region is also a single hit target.
 */
function holePath(shape: OpticalShape, box: Box): string {
  if (shape !== "circle") {
    return `M${box.x} ${box.y}H${box.x + box.width}V${box.y + box.height}H${box.x}Z`;
  }
  const r = box.width / 2;
  const cx = box.x + r;
  const cy = box.y + r;
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

function sameBox(a: Box, b: Box | undefined): boolean {
  return b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
