import { previewElementChange } from "@icon-foundry/icon-audit";
import { slashAngle, slashGap } from "@icon-foundry/icon-composer";
import type { Box, IconLanguage, OpticalShape } from "@icon-foundry/icon-language";
import type { ElementRecord, Library } from "@icon-foundry/icon-library";
import {
  arcify,
  bandThrough,
  clipOutsideBand,
  isAllowedAngle,
  importSvg,
  recognise,
  segmentHeading,
  skeletonFromPathData,
  tidy,
  type PrimitiveRegistry,
  type Skeleton,
} from "@icon-foundry/icon-primitives";
import { shapeToPathData, skeletonPaths, skeletonToPathData } from "@icon-foundry/icon-renderer";
import { useEffect, useMemo, useState } from "react";

import { IDENTITY, invert, mapSkeleton, placementFor, type Placement } from "../lib/method-geometry.js";
import { useConstruction } from "../lib/useConstruction.js";
import { useHistory, useUndoKeys } from "../lib/useHistory.js";
import { ConstructionStage, DEFAULT_LAYERS, LayerToggles } from "./ConstructionStage.js";
import { IconSvg } from "./IconSvg.js";
import { MethodCode } from "./MethodCode.js";
import { Swatch } from "./Swatch.js";

/**
 * How a part is built.
 *
 * The third question a set has to answer. Parts asks whether these look like the
 * work of one hand and Keylines whether they are the same size; neither can show
 * whether they are *built* the same way, because construction is invisible once
 * a shape is drawn. Here it is the only thing on screen.
 *
 * It draws on the icon canvas rather than in the part's own box, which is the
 * decision everything else follows from. Every rule worth seeing while building
 * — the grid step, the safe area, the four optical boxes, the corner radius —
 * is stated in canvas units, so working anywhere else meant rescaling each of
 * them at the point of use and hoping nobody forgot one. On the canvas they are
 * simply true, and the keyline sheet's backdrop can sit under the editor
 * instead of being a separate argument about the same drawing.
 *
 * Editing is direct because the skeleton makes it cheap. Dragging a vertex of a
 * polyline is tractable; dragging a control point of a cubic whose neighbours
 * must stay tangent is not, which is why the tool this borrows from has to
 * repair geometry instead of letting anyone shape it. That same difference is
 * why a whole category of its overlays is missing here: vertices are shared, so
 * "these two endpoints nearly meet" is not a fault this representation can hold.
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

const PRECISION = 4;

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

function boundsOf(skeleton: Skeleton): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of skeleton.vertices) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1e-6), height: Math.max(maxY - minY, 1e-6) };
}

export function MethodCanvas({ library, language, registry, size, selected, onSelect, onAction }: MethodProps) {
  const tokens = language.sizes[size] ?? language.sizes[language.defaultCanvas]!;
  const canvas = tokens.canvas;
  const elements = library.elements();
  const record = elements.find((e) => e.name === selected);
  const editable = record !== undefined;

  /*
   * History holds `undefined` for "as saved", which keeps `dirty` meaning what
   * it always meant and makes undoing back to the original land on the very
   * same object rather than on a copy that merely matches it.
   */
  const history = useHistory<Skeleton | undefined>(undefined);
  const draft = history.present;
  const setDraft = history.commit;
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [showRounded, setShowRounded] = useState(false);
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [typing, setTyping] = useState<string>();
  const [asSvg, setAsSvg] = useState(false);
  /** Attributes a pasted SVG had an opinion about that the language owns. */
  const [taken, setTaken] = useState<string[]>([]);
  const [codeError, setCodeError] = useState<string>();
  const [error, setError] = useState<string>();

  const primitive = selected && registry.has(selected) ? registry.get(selected) : undefined;
  // A part may declare that its concept needs angles the grammar does not allow
  // — a triangle, an isometric box, a snowflake's 60° symmetry. Marking those
  // segments as mistakes would be the tab contradicting the language.
  const freeAngles = primitive?.freeAngles === true;

  /* ---------------------------------------------------------------- */
  /* The drawing, in canvas units                                      */
  /* ---------------------------------------------------------------- */

  const natural = useMemo(() => skeletonFor(record, registry, selected), [record, registry, selected]);

  /**
   * Where this part sits on the canvas.
   *
   * Deliberately the composer's own answer and not a similar one. `compose()`
   * places a lone element in the keyline box its optical shape names, scaled
   * uniformly to fit and centred in the slack — so reproducing that here is
   * what makes the safe area and the optical boxes under the drawing *true*
   * rather than decorative. A placement of our own devising would put the
   * drawing somewhere the icon never goes, and then every keyline it is
   * measured against would be measuring the wrong thing.
   *
   * The natural box is anchored at the origin because that is how
   * `definePathPrimitive` derives one, declared or not. Using the drawing's own
   * bounds instead would also make the placement depend on the geometry, and a
   * part that rescaled its own canvas as you dragged it would be unusable.
   */
  const keyline = useMemo(() => {
    const shape = (primitive?.opticalShape ?? record?.opticalShape ?? "square") as OpticalShape;
    return { shape, box: tokens.optical[shape] };
  }, [primitive, record, tokens]);

  const placement: Placement = useMemo(() => {
    if (!natural) return IDENTITY;
    const declared = primitive?.box ?? record?.box;
    const from: Box = declared
      ? { x: 0, y: 0, width: declared.width, height: declared.height }
      : boundsOf(natural);
    return placementFor(from, keyline.box);
  }, [natural, record, primitive, keyline]);

  const base = useMemo(() => (natural ? mapSkeleton(natural, placement) : undefined), [natural, placement]);
  const skeleton = draft ?? base;
  const dirty = draft !== undefined;

  const rounded = useMemo(
    () =>
      skeleton
        ? arcify(skeleton, {
            cornerRadius: tokens.cornerRadius,
            corners: language.construction.corners,
            ...(language.construction.cornerSnap && { snap: true, grid: tokens.grid }),
          })
        : undefined,
    [skeleton, tokens, language.construction],
  );

  const shown = (showRounded ? rounded : skeleton) ?? skeleton;

  /* ---------------------------------------------------------------- */
  /* Measurements                                                      */
  /* ---------------------------------------------------------------- */

  const measured = useConstruction(skeleton, shown, language, tokens, {
    freeAngles,
    showRounded,
    faults: layers.faults,
  });
  const { joints, fillets, misses, gaps, pastLive, pastTrim } = measured;

  /**
   * Whether this drawing turns out to be something the set already owns.
   *
   * An offer rather than an observation: a drawing recognised as a primitive
   * can be *replaced* by it, and then it carries that primitive's construction
   * traits and re-renders when the language moves.
   */
  const recognition = useMemo(() => {
    if (!skeleton || !editable) return undefined;
    try {
      return recognise(skeleton, registry, { grid: tokens.grid });
    } catch {
      return undefined;
    }
  }, [skeleton, registry, tokens.grid, editable]);

  /* ---------------------------------------------------------------- */
  /* Writing back                                                      */
  /* ---------------------------------------------------------------- */

  /** The draft returned to the part's own box, which is what gets stored. */
  const stored = useMemo(
    () => (draft ? mapSkeleton(draft, invert(placement)) : undefined),
    [draft, placement],
  );

  /**
   * What the pane shows.
   *
   * Path data by default, because that is what is stored — and an editor whose
   * text says something other than the file says is an editor you cannot trust
   * to tell you what you have. The SVG view is the same geometry wearing the
   * language's own attributes, which is what makes it a useful thing to copy
   * out: paste it anywhere and it is already in this language.
   */
  const code = useMemo(() => {
    if (typing !== undefined) return typing;
    const source = stored ?? natural;
    if (!source) return "";
    const paths = skeletonPaths(source, PRECISION);
    if (!asSvg) return paths.join("\n");
    const box = primitive?.box ?? record?.box ?? { width: canvas, height: canvas };
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}"`,
      `     viewBox="0 0 ${box.width} ${box.height}" fill="none" stroke="currentColor"`,
      `     stroke-width="${tokens.stroke.width}" stroke-linecap="${tokens.stroke.cap}" stroke-linejoin="${tokens.stroke.join}">`,
      ...paths.map((d) => `  <path d="${d}" />`),
      "</svg>",
    ].join("\n");
  }, [typing, stored, natural, asSvg, primitive, record, canvas, tokens]);

  const preview = useMemo(() => {
    if (!record || !stored) return undefined;
    try {
      const next = { ...record, outline: skeletonPaths(stored, PRECISION) };
      return { next, impacts: previewElementChange(library, next) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [record, stored, library]);

  /* ---------------------------------------------------------------- */
  /* Selection                                                         */
  /* ---------------------------------------------------------------- */

  const fromCode = (ids: string[], additive: boolean) => {
    setPicked(additive ? new Set([...picked, ...ids]) : new Set(ids));
  };

  // A selection is a set of segment ids, and every action that changes the
  // drawing's shape can renumber them. Holding on to a stale one would let a
  // later delete remove something the designer never picked.
  useEffect(() => {
    setPicked(new Set());
    history.reset(undefined);
    // `history.reset` is stable; listing it would re-run this on every render
    // and wipe the stack the moment anything else changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useUndoKeys(history, editable);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const act = (fn: (s: Skeleton) => Skeleton) => {
    if (!skeleton) return;
    setTyping(undefined);
    setCodeError(undefined);
    setDraft(fn(skeleton));
  };

  /**
   * Take an edit, in whichever of the two languages it is written in.
   *
   * An `<svg>` is detected rather than switched to, because the common case is
   * a paste: somebody copies an icon out of Figma or off lucide.dev, drops it
   * in, and expects it to appear. Asking them to flip a toggle first would make
   * the feature something you have to know about.
   *
   * What comes in is geometry and nothing else. Any `stroke-width`,
   * `stroke-linecap` or colour on the pasted markup is reported and dropped —
   * those belong to the language, and a paste that quietly brought a 2px stroke
   * into a 1.5px set would be precisely the failure this project exists to
   * prevent.
   */
  const onCode = (next: string) => {
    setTyping(next);
    try {
      let paths: string[];
      if (/<\s*svg[\s>]/i.test(next)) {
        const brought = importSvg(next, shapeToPathData, PRECISION);
        paths = brought.paths;
        setTaken(brought.ignored.map((i) => `${i.name}="${i.value}"`));
      } else {
        paths = next.split("\n").filter((line) => line.trim().length > 0);
        setTaken([]);
      }
      history.commit(mapSkeleton(skeletonFromPathData(paths), placement));
      setCodeError(undefined);
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : String(e));
    }
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
    if (!natural || !selected || !primitive) return;
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
          outline: skeletonPaths(natural, PRECISION),
        }),
      );
      history.reset(undefined);
      setError(undefined);
      onSelect(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const revert = () => {
    history.reset(undefined);
    setTyping(undefined);
    setCodeError(undefined);
    setError(undefined);
    setTaken([]);
    setPicked(new Set());
  };

  const save = () => {
    if (!preview || "error" in preview || !preview.next) return;
    void onAction((lib) => lib.saveElement(preview.next))
      .then(() => {
        revert();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  /* ---------------------------------------------------------------- */

  const facts = skeleton
    ? {
        joints: joints.length,
        off: freeAngles ? "declared free" : String(offAngleCount(skeleton, language)),
        curves: skeleton.subpaths.reduce((n, s) => n + s.segments.filter((x) => x.kind === "cubic").length, 0),
        stated: Object.keys(skeleton.corners).length,
      }
    : undefined;

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
          onClick={() => act((s) => tidy(s, { grid: tokens.grid, canvas }))}
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
                cornerRadius: tokens.cornerRadius,
                corners: language.construction.corners,
                ...(language.construction.cornerSnap && { snap: true, grid: tokens.grid }),
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
            act((s) => clipOutsideBand(s, bandThrough([canvas / 2, canvas / 2], slashAngle(language), slashGap(tokens))))
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
        {editable && (history.canUndo || history.canRedo) && (
          <>
            <button
              type="button"
              className="chip"
              disabled={!history.canUndo}
              onClick={history.undo}
              title="Undo the last step (⌘Z)"
            >
              Undo{history.depth > 0 ? ` ${history.depth}` : ""}
            </button>
            <button
              type="button"
              className="chip"
              disabled={!history.canRedo}
              onClick={history.redo}
              title="Redo (⇧⌘Z)"
            >
              Redo
            </button>
            <span className="bar-sep" />
          </>
        )}
        {dirty && (
          <>
            <button className="chip" onClick={revert}>
              Revert
            </button>
            <button className="chip primary" disabled={!preview || "error" in preview} onClick={save}>
              Save
            </button>
          </>
        )}
      </div>

      <LayerToggles layers={layers} onChange={setLayers} />

      {!skeleton && (
        <p className="muted empty">
          Pick a part to see how it is built. Your own elements can be edited here; a built-in draws from code, so it is
          shown rather than opened.
        </p>
      )}

      {skeleton && shown && (
        <div className="method-stage">
          <ConstructionStage
            skeleton={skeleton}
            shown={shown}
            onChange={(next, continues) => {
              setTyping(undefined);
              setCodeError(undefined);
              if (continues) history.set(next);
              else history.commit(next);
            }}
            language={language}
            tokens={tokens}
            measured={measured}
            keyline={keyline}
            freeAngles={freeAngles}
            editable={editable}
            showRounded={showRounded}
            layers={layers}
            picked={picked}
            onPick={setPicked}
            recognition={recognition}
          />

          <div className="method-side">
            <Swatch
              tone="surface"
              render={() => (
                <IconSvg svg={drawAt(rounded ?? skeleton, canvas, tokens.stroke.width)} size={canvas} />
              )}
            />
            <p className="muted small-text">true size · {canvas}px</p>
            <dl className="method-facts">
              <dt>Joints</dt>
              <dd>{facts?.joints}</dd>
              <dt>Off the angle set</dt>
              <dd>{facts?.off}</dd>
              <dt>Curves drawn by hand</dt>
              <dd>{facts?.curves}</dd>
              <dt>Corners already cut</dt>
              <dd>{fillets.length}</dd>
              <dt>Radii stated by hand</dt>
              <dd>{facts?.stated}</dd>
              <dt>Loose ends near ink</dt>
              <dd>{misses.length}</dd>
              <dt>Gaps under the minimum</dt>
              <dd>{gaps.length}</dd>
              <dt>Reaches the live area</dt>
              <dd>{pastLive ? "past it" : "within"}</dd>
              <dt>Ink inside the trim</dt>
              <dd>{pastTrim ? "crosses" : "yes"}</dd>
            </dl>

            {recognition && (
              <p className="muted small-text">
                This is a <strong>{recognition.primitive}</strong>, within {+recognition.deviation.toFixed(2)} units.
                Composing it from the primitive would keep it in step with the language.
              </p>
            )}

            {editable ? (
              <p className="muted small-text">
                Drag a segment to move it, a point to move that point, the small ring at a corner to state its radius.
                Shift adds to the selection, right-click acts on it. Everything snaps to a point first, the language's
                angles second, the grid third; hold ⌥ to leave all three.
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

      {skeleton && (
        <MethodCode
          value={code}
          onChange={onCode}
          selected={picked}
          onSelect={fromCode}
          error={codeError}
          readOnly={!editable}
          asSvg={asSvg}
          onFormat={setAsSvg}
          ignored={taken}
        />
      )}
    </div>
  );
}

function offAngleCount(skeleton: Skeleton, language: IconLanguage): number {
  let count = 0;
  for (const subpath of skeleton.subpaths) {
    subpath.segments.forEach((segment, i) => {
      if (segment.kind !== "line") return;
      const heading = segmentHeading(skeleton, subpath, i);
      if (heading !== undefined && !isAllowedAngle(heading, language.grammar.angles, language.grammar.angleTolerance))
        count++;
    });
  }
  return count;
}

/**
 * The part at true size.
 *
 * No scaling left to do: the editor already works in canvas units, so the row
 * under it says what ships because it is drawing the same numbers.
 */
function drawAt(skeleton: Skeleton, canvas: number, stroke: number): string {
  const d = skeletonToPathData(skeleton, PRECISION);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${canvas}" height="${canvas}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
