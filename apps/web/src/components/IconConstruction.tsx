import { compose } from "@icon-foundry/icon-composer";
import type { Library } from "@icon-foundry/icon-library";
import { importSvg, skeletonFromPathData, type Skeleton } from "@icon-foundry/icon-primitives";
import { shapeToPathData, skeletonPaths } from "@icon-foundry/icon-renderer";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { useMemo, useState } from "react";
import { useConstruction } from "../lib/useConstruction.js";
import { ConstructionStage, DEFAULT_LAYERS, LayerToggles } from "./ConstructionStage.js";
import { MethodCode } from "./MethodCode.js";

/**
 * An icon on its way into the library, editable against its own language.
 *
 * The same canvas the Method tab uses, on the one screen where it was missing.
 * A draft arrives from the agent as a composition of parts, and until now the
 * only two things you could do with it were accept it or ask again — which
 * makes the model's third attempt the unit of work, when the real unit is
 * usually "that, but the bar is one step short".
 *
 * **Editing changes what the icon is, and says so.** A composition is a
 * *recipe*: move a keyline and every icon built from it follows. Drag a vertex
 * and that stops being true, because the geometry is now written down. That is
 * a real trade and the panel names it rather than hiding it — and the library
 * drawer already offers the way back, by finding the composition that
 * reproduces the drawing exactly.
 */
export function IconConstruction({
  spec,
  library,
  onChange,
}: {
  spec: IconSpec;
  library: Library;
  onChange: (next: IconSpec) => void;
}) {
  const language = library.languageFor(spec);
  const registry = library.registry();
  const [draft, setDraft] = useState<Skeleton>();
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [showRounded, setShowRounded] = useState(false);
  const [typing, setTyping] = useState<string>();
  const [asSvg, setAsSvg] = useState(false);
  const [taken, setTaken] = useState<string[]>([]);
  const [codeError, setCodeError] = useState<string>();

  /*
   * Composed geometry is already in canvas units, so unlike a part there is no
   * placement to undo. What comes off `compose()` is exactly what will be
   * painted, which is what makes editing it honest.
   */
  const composed = useMemo(() => {
    try {
      return compose(spec, language, { registry });
    } catch {
      return undefined;
    }
  }, [spec, language, registry]);

  const base = useMemo(() => {
    if (!composed) return undefined;
    const paths = composed.shapes.map((item) => shapeToPathData(item.shape, 4)).filter((d) => d.trim().length > 0);
    return paths.length > 0 ? skeletonFromPathData(paths) : undefined;
  }, [composed]);

  const skeleton = draft ?? base;
  const tokens = composed?.tokens;
  const keyline = composed?.keylines[0];
  const edited = draft !== undefined;

  const shown = skeleton;
  const measured = useConstruction(skeleton, shown, language, tokens ?? language.sizes[language.defaultCanvas]!, {
    freeAngles: false,
    showRounded,
    faults: layers.faults,
  });

  const code = useMemo(() => {
    if (typing !== undefined) return typing;
    if (!skeleton || !tokens) return "";
    const paths = skeletonPaths(skeleton, 4);
    if (!asSvg) return paths.join("\n");
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.canvas}" height="${spec.canvas}"`,
      `     viewBox="0 0 ${spec.canvas} ${spec.canvas}" fill="none" stroke="currentColor"`,
      `     stroke-width="${tokens.stroke.width}" stroke-linecap="${tokens.stroke.cap}" stroke-linejoin="${tokens.stroke.join}">`,
      ...paths.map((d) => `  <path d="${d}" />`),
      "</svg>",
    ].join("\n");
  }, [typing, skeleton, tokens, asSvg, spec.canvas]);

  /** The edited drawing as a spec: one freeform element in canvas coordinates. */
  const commit = (next: Skeleton) => {
    setDraft(next);
    onChange({
      ...spec,
      elements: [
        {
          path: skeletonPaths(next, 4),
          x: 0,
          y: 0,
          width: spec.canvas,
          height: spec.canvas,
          natural: { width: spec.canvas, height: spec.canvas },
        },
      ],
    });
  };

  const onCode = (next: string) => {
    setTyping(next);
    try {
      let paths: string[];
      if (/<\s*svg[\s>]/i.test(next)) {
        const brought = importSvg(next, shapeToPathData, 4);
        paths = brought.paths;
        setTaken(brought.ignored.map((i) => `${i.name}="${i.value}"`));
      } else {
        paths = next.split("\n").filter((line) => line.trim().length > 0);
        setTaken([]);
      }
      commit(skeletonFromPathData(paths));
      setCodeError(undefined);
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!skeleton || !tokens || !shown) {
    return <p className="muted small-text">This draft has no geometry to edit yet.</p>;
  }

  return (
    <div className="icon-construction">
      <div className="pc-toolbar">
        {(["skeleton", "rounded"] as const).map((v) => (
          <button
            type="button"
            key={v}
            className={`chip ${(v === "rounded") === showRounded ? "on" : ""}`}
            onClick={() => setShowRounded(v === "rounded")}
          >
            {v}
          </button>
        ))}
        <span className="spacer" />
        {edited && (
          <button type="button" className="chip" onClick={() => { setDraft(undefined); setTyping(undefined); setTaken([]); }}>
            Back to the composition
          </button>
        )}
      </div>

      <LayerToggles layers={layers} onChange={setLayers} />

      <div className="method-stage">
        <ConstructionStage
          skeleton={skeleton}
          shown={shown}
          onChange={(next) => {
            setTyping(undefined);
            setCodeError(undefined);
            commit(next);
          }}
          language={language}
          tokens={tokens}
          measured={measured}
          keyline={keyline}
          freeAngles={false}
          editable
          showRounded={showRounded}
          layers={layers}
          picked={picked}
          onPick={setPicked}
          size={420}
        />

        <div className="method-side">
          <dl className="method-facts">
            <dt>Parts</dt>
            <dd>{composed?.elementCount ?? 0}</dd>
            <dt>Corners already cut</dt>
            <dd>{measured.fillets.length}</dd>
            <dt>Loose ends near ink</dt>
            <dd>{measured.misses.length}</dd>
            <dt>Gaps under the minimum</dt>
            <dd>{measured.gaps.length}</dd>
          </dl>
          {edited ? (
            <p className="locked-note">
              <strong>Now drawn, not composed.</strong> This icon carries its own geometry, so a change to a keyline
              box will no longer move it. The library offers the way back if a composition reproduces it.
            </p>
          ) : (
            <p className="muted small-text">
              Built from the vocabulary, so it follows the language. Dragging anything here writes the geometry down
              instead.
            </p>
          )}
        </div>
      </div>

      <MethodCode
        value={code}
        onChange={onCode}
        selected={picked}
        onSelect={(ids, additive) => setPicked(additive ? new Set([...picked, ...ids]) : new Set(ids))}
        error={codeError}
        readOnly={false}
        asSvg={asSvg}
        onFormat={setAsSvg}
        ignored={taken}
      />
    </div>
  );
}
