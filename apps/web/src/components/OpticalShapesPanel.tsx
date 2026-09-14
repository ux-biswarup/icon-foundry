import {
  OPTICAL_SHAPES,
  defaultOpticalBoxes,
  type Box,
  type IconLanguage,
  type OpticalShape,
  type SizeTokens,
} from "@icon-foundry/icon-language";
import type { PrimitiveRegistry } from "@icon-foundry/icon-primitives";

/**
 * Editing the keyline boxes, one optical size at a time.
 *
 * The rule these express is the reason a set reads as one size: a circle drawn
 * to a square's box looks smaller than the square, so each shape gets its own
 * box and every part declares which one it fits. Most parts fit one of the
 * four. The ones that do not — diagonals especially — take the closest box and
 * are corrected by eye, which is what the per-part exception is for.
 *
 * Only width and height are editable. The origin is derived by centring, so
 * there is no way to type a box that is off-centre by accident; a deliberately
 * off-centre box is a per-part decision, not a property of the whole set.
 */
export function OpticalShapesPanel({
  language,
  registry,
  sizes,
  selected,
  onSelect,
  onChange,
  onReset,
}: {
  language: IconLanguage;
  registry: PrimitiveRegistry;
  sizes: number[];
  selected: { canvas: number; shape: OpticalShape } | undefined;
  onSelect: (at: { canvas: number; shape: OpticalShape } | undefined) => void;
  /** Width and height in canvas units; the panel re-centres the box itself. */
  onChange: (canvas: number, shape: OpticalShape, size: { width: number; height: number }) => void;
  /** Hand this size's boxes back to the defaults. */
  onReset: (canvas: number) => void;
}) {
  const users = usersByShape(registry);

  return (
    <div className="optical-panel">
      {sizes.map((canvas) => {
        const tokens = language.sizes[canvas];
        if (!tokens) return null;
        const derived = defaultOpticalBoxes(canvas, tokens.safeArea, tokens.grid);
        const authored = OPTICAL_SHAPES.some((s) => !sameBox(tokens.optical[s], derived[s]));

        return (
          <section className="optical-size" key={canvas}>
            <div className="optical-size-head">
              <span className="field-label">{canvas}px</span>
              {authored && (
                <button className="ghost small" onClick={() => onReset(canvas)} title="Back to the derived boxes">
                  ↺ derived
                </button>
              )}
            </div>

            <div className="optical-rows">
              {OPTICAL_SHAPES.map((shape) => (
                <ShapeRow
                  key={shape}
                  shape={shape}
                  tokens={tokens}
                  derived={derived[shape]}
                  parts={users[shape] ?? []}
                  selected={selected?.canvas === canvas && selected.shape === shape}
                  onSelect={() =>
                    onSelect(
                      selected?.canvas === canvas && selected.shape === shape ? undefined : { canvas, shape },
                    )
                  }
                  onChange={(size) => onChange(canvas, shape, size)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ShapeRow({
  shape,
  tokens,
  derived,
  parts,
  selected,
  onSelect,
  onChange,
}: {
  shape: OpticalShape;
  tokens: SizeTokens;
  derived: Box;
  parts: string[];
  selected: boolean;
  onSelect: () => void;
  onChange: (size: { width: number; height: number }) => void;
}) {
  const box = tokens.optical[shape];
  const off = !sameBox(box, derived);
  // A square and a circle are each defined by one number. Offering width and
  // height separately invites an ellipse or an oblong square — shapes that are
  // not among the four, and that anyone wanting them should reach by choosing
  // horizontal or vertical instead.
  const locked = shape === "circle" || shape === "square";

  const set = (next: Partial<{ width: number; height: number }>) => {
    const width = next.width ?? box.width;
    const height = locked ? width : (next.height ?? box.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    onChange({ width, height });
  };

  return (
    <div className={`optical-row${selected ? " is-selected" : ""}${off ? " is-typed" : ""}`}>
      <button className="or-name" onClick={onSelect} aria-pressed={selected} title={parts.join(", ") || "no parts"}>
        {shape}
      </button>
      <input
        className="or-num"
        type="number"
        step={tokens.grid}
        min={tokens.grid}
        value={box.width}
        aria-label={`${shape} width`}
        onChange={(e) => set({ width: Number(e.target.value) })}
      />
      <span className="or-x">×</span>
      <input
        className="or-num"
        type="number"
        step={tokens.grid}
        min={tokens.grid}
        value={box.height}
        disabled={locked}
        aria-label={`${shape} height`}
        onChange={(e) => set({ height: Number(e.target.value) })}
      />
      <span className="or-users muted" title={parts.join(", ")}>
        {parts.length}
      </span>
    </div>
  );
}

function usersByShape(registry: PrimitiveRegistry): Partial<Record<OpticalShape, string[]>> {
  const out: Partial<Record<OpticalShape, string[]>> = {};
  for (const name of registry.names()) {
    const shape = registry.get(name)?.opticalShape;
    if (shape) (out[shape] ??= []).push(name);
  }
  return out;
}

function sameBox(a: Box, b: Box | undefined): boolean {
  return b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
