import { compose } from "@icon-foundry/icon-composer";
import {
  CONSTRUCTION_TRAITS,
  TRAIT_CONSUMERS,
  constructionFor,
  type Construction,
  type ConstructionException,
  type ConstructionTrait,
  type IconLanguage,
  type IconStyle,
} from "@icon-foundry/icon-language";
import type { ElementRecord, Library } from "@icon-foundry/icon-library";
import type { Primitive, PrimitiveRegistry } from "@icon-foundry/icon-primitives";
import { renderSvg } from "@icon-foundry/icon-renderer";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { useState, type CSSProperties } from "react";
import { previewElementChange } from "@icon-foundry/icon-audit";
import { useGround } from "../lib/theme.js";
import { Swatch } from "./Swatch.js";
import { IconSvg } from "./IconSvg.js";
import { StatusPill } from "./Status.js";

/**
 * Every part this language draws with, live.
 *
 * The middle column, and the reason the three columns are worth having. A set
 * feels like one hand or it does not, and that is a property of the set rather
 * than of any icon in it — so it cannot be judged one shape at a time, which is
 * what a preview rail of eleven reference icons was asking people to do.
 *
 * Two behaviours carry the argument. Touching a control scopes this to the
 * parts that control reaches, so nobody has to wonder what a shared value does.
 * And every part is drawn on both grounds at once, because a weight chosen on
 * white is wrong at night.
 */

export interface CanvasProps {
  library: Library;
  /** The language as currently edited, which may differ from what is saved. */
  language: IconLanguage;
  registry: PrimitiveRegistry;
  /** The trait being touched right now; everything else dims. */
  focus: ConstructionTrait | undefined;
  /** Optical size: a property of the icon, and what its tokens come from. */
  size: number;
  /**
   * Magnification: a property of your eyes, and nothing to do with the icon.
   *
   * These were one control and it was a quiet lie. A 16px icon was drawn at 32
   * CSS pixels and a 24px icon at 40, so switching optical size also changed
   * the zoom, by a different factor each way. You could not tell whether what
   * you were looking at came from the tokens or from the magnification.
   */
  zoom: number;
  /** Optical sizes this language defines, offered as the choice of `size`. */
  sizes: readonly number[];
  onSize: (size: number) => void;
  onZoom: (zoom: number) => void;
  /** Outline or filled. The parts are drawn in it; nothing about them changes. */
  style: IconStyle;
  onStyle: (style: IconStyle) => void;
  selected: string | undefined;
  onSelect: (name: string | undefined) => void;
  onAction: (fn: (lib: Library) => Promise<unknown>) => Promise<unknown>;
  /** Record a per-part departure, or clear one by passing undefined. */
  onException: (name: string, exception: ConstructionException | undefined) => void;
}

/** Icons assembled from the parts. The parts are the mechanism; these ship. */
const COMPOSED: Array<[string, string, string | undefined]> = [
  ["cold store", "warehouse", "snowflake"],
  ["new document", "document", "plus"],
  ["fleet status", "vehicle", "clock"],
  ["site alert", "building", "warning"],
  ["delivered", "package", "check"],
  ["account", "person", undefined],
];

export function PartsCanvas({
  library,
  language,
  registry,
  focus,
  size,
  zoom,
  sizes,
  onSize,
  onZoom,
  style,
  onStyle,
  selected,
  onSelect,
  onAction,
  onException,
}: CanvasProps) {
  const tokens = language.sizes[size] ?? language.sizes[language.defaultCanvas]!;
  const reached = focus ? new Set(registry.consumersOf(focus)) : undefined;

  const draw = (name: string, onDark: boolean): string | undefined => {
    if (!registry.has(name)) return undefined;
    const box = tokens.optical[registry.get(name).opticalShape];
    const spec: IconSpec = { name, language: language.id, canvas: tokens.canvas, style, elements: [{ primitive: name, ...box }] };
    try {
      return renderSvg(compose(spec, language, { registry }), language, { onDark });
    } catch {
      return undefined;
    }
  };

  const drawComposed = (subject: string, badge: string | undefined, onDark: boolean): string | undefined => {
    if (!registry.has(subject) || (badge && !registry.has(badge))) return undefined;
    const c = tokens.canvas;
    const s = tokens.safeArea;
    const box = tokens.optical[registry.get(subject).opticalShape];
    const badgeSize = Math.max(tokens.grid, (c - 2 * s) * language.grammar.badge.ratio);
    const elements: IconSpec["elements"] = badge
      ? [
          { primitive: subject, x: box.x, y: box.y + badgeSize / 2, width: box.width - badgeSize / 2, height: box.height - badgeSize / 2 },
          { primitive: badge, x: c - s - badgeSize, y: s, width: badgeSize, height: badgeSize },
        ]
      : [{ primitive: subject, ...box }];
    try {
      return renderSvg(compose({ name: subject, language: language.id, canvas: c, style, elements }, language, { registry }), language, {
        onDark,
      });
    } catch {
      return undefined;
    }
  };

  // True size times magnification, and never anything else. At zoom 1 a 16px
  // icon is 16 real pixels, which is the only view that tells you what ships.
  const px = size * zoom;
  // The grid track follows the drawn size, so a 16px part and a 96px one both
  // sit in a square cell with the same air around the drawing.
  const gridStyle = { "--tile-size": `${px}px` } as CSSProperties;
  const cell = (name: string, label: string, extra?: { draft?: boolean; excepted?: boolean }) => {
    const dim = reached !== undefined && !reached.has(name);
    return (
      <button
        key={name}
        type="button"
        // The native tooltip stays on as well as the styled one: the hover
        // label is centred under the cell and the last column is near the edge
        // of a scrolling pane, so a long name can be clipped. `title` never is.
        title={label}
        className={`tile ${dim ? "dim" : ""} ${selected === name ? "sel" : ""}`}
        onClick={() => onSelect(selected === name ? undefined : name)}
      >
        {extra?.draft && <span className="tile-mark draft" title="draft — not approved yet" />}
        {extra?.excepted && <span className="tile-mark flag" title="drawn against the language" />}
        <Swatch tone="surface" render={(onDark) => <IconSvg svg={draw(name, onDark)} size={px} />} />
        <span className="tile-name">{label}</span>
      </button>
    );
  };

  const custom = library.elements();
  const builtins = registry.list().filter((p) => p.origin === "builtin");
  const exceptions = language.construction.exceptions;

  return (
    <div className="parts-canvas">
      {/*
       * The two controls that decide what a part looks like here, kept with the
       * parts rather than on the view switch above. Optical size changes the
       * tokens and therefore the drawing; magnification changes nothing but how
       * close you are standing.
       */}
      <div className="pc-toolbar">
        {sizes.map((c) => (
          <button key={c} className={`chip ${size === c ? "on" : ""}`} onClick={() => onSize(c)} title={`Design at ${c}px`}>
            {c}px
          </button>
        ))}
        <span className="bar-sep" />
        {[1, 2, 4].map((z) => (
          <button
            key={z}
            className={`chip ${zoom === z ? "on" : ""}`}
            onClick={() => onZoom(z)}
            title={z === 1 ? "True size: exactly what ships" : `${z} times larger than it ships`}
          >
            {z}×
          </button>
        ))}
        {language.style.allowed.length > 1 && (
          <>
            <span className="bar-sep" />
            {language.style.allowed.map((s) => (
              <button
                key={s}
                className={`chip ${style === s ? "on" : ""}`}
                onClick={() => onStyle(s)}
                title={s === "filled" ? "Every part as a solid shape with its detail knocked out" : "Every part as strokes"}
              >
                {s}
              </button>
            ))}
          </>
        )}
        <span className="muted small-text">
          {zoom === 1 ? `true size · ${size} real pixels` : `${size}px shown ${zoom}× larger`}
        </span>
      </div>

      {focus && (
        <p className="scope-note">
          <b>{focus}</b> is declared by {registry.consumersOf(focus).length} parts. The rest are dimmed because this
          control cannot reach them.
        </p>
      )}

      <h3 className="canvas-head">
        Built in <span className="muted">· every part your icons are made of</span>
      </h3>
      <div className="tile-grid" style={gridStyle}>{builtins.map((p: Primitive) => cell(p.name, p.name, { excepted: !!exceptions[p.name] }))}</div>

      <h3 className="canvas-head">
        Your elements{" "}
        <span className="muted">
          {custom.length === 0
            ? "· none yet. They appear when you approve an icon that needed a new subject."
            : `· ${custom.filter((e) => e.status === "draft").length} waiting on you`}
        </span>
      </h3>
      {custom.length > 0 && (
        <div className="tile-grid" style={gridStyle}>
          {custom.map((e) => cell(e.name, e.name, { draft: e.status === "draft", excepted: !!exceptions[e.name] }))}
        </div>
      )}

      <h3 className="canvas-head">
        Icons made from them <span className="muted">· the parts are the mechanism, these are what ships</span>
      </h3>
      <div className="tile-grid" style={gridStyle}>
        {COMPOSED.map(([label, subject, badge]) => {
          const dim = reached !== undefined && !reached.has(subject) && !(badge && reached.has(badge));
          return (
            <div key={label} title={label} className={`tile static ${dim ? "dim" : ""}`}>
              <Swatch tone="surface" render={(onDark) => <IconSvg svg={drawComposed(subject, badge, onDark)} size={px} />} />
              <span className="tile-name">{label}</span>
            </div>
          );
        })}
      </div>

      {selected && (
        <SelectedPart
          name={selected}
          record={custom.find((e) => e.name === selected)}
          usages={library.usages(selected).length}
          registry={registry}
          library={library}
          language={language}
          px={px}
          drawWith={(name, onDark, construction) => {
            if (!registry.has(name)) return undefined;
            const box = tokens.optical[registry.get(name).opticalShape];
            const spec: IconSpec = { name, language: language.id, canvas: tokens.canvas, elements: [{ primitive: name, ...box }] };
            const lang: IconLanguage = { ...language, construction };
            try {
              return renderSvg(compose(spec, lang, { registry }), lang, { onDark });
            } catch {
              return undefined;
            }
          }}
          onAction={onAction}
          onException={onException}
          onClose={() => onSelect(undefined)}
        />
      )}
    </div>
  );
}

/**
 * What one part is, and what you may do to it.
 *
 * A built-in part is ours and can only be looked at. One of yours carries its
 * lifecycle here rather than on a page of its own, because the question being
 * asked of a draft element is whether it belongs among these — which is the
 * `belongs` rule the validator refuses to answer — and you cannot answer that
 * without its neighbours on screen.
 */
function SelectedPart({
  name,
  record,
  usages,
  registry,
  library,
  language,
  px,
  drawWith,
  onAction,
  onException,
  onClose,
}: {
  name: string;
  record: ElementRecord | undefined;
  usages: number;
  registry: PrimitiveRegistry;
  library: Library;
  language: IconLanguage;
  px: number;
  drawWith: (name: string, onDark: boolean, construction: Construction) => string | undefined;
  onAction: (fn: (lib: Library) => Promise<unknown>) => Promise<unknown>;
  onException: (name: string, exception: ConstructionException | undefined) => void;
  onClose: () => void;
}) {
  const ground = useGround();
  const [editing, setEditing] = useState(false);
  const [outline, setOutline] = useState(record?.outline.join("\n") ?? "");
  const [error, setError] = useState<string>();
  const primitive = registry.has(name) ? registry.get(name) : undefined;
  const traits = primitive?.traits ?? [];

  const next = record ? { ...record, outline: outline.split("\n").map((l) => l.trim()).filter(Boolean) } : undefined;
  let impacts: ReturnType<typeof previewElementChange> = [];
  let previewError: string | undefined;
  if (editing && next) {
    try {
      impacts = previewElementChange(library, next);
    } catch (err) {
      previewError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <div className="part-detail">
      <div className="part-detail-head">
        <h3>
          {name} {record && <StatusPill status={record.status} />}
        </h3>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted small-text">
        {primitive ? `${primitive.category} · ${primitive.opticalShape}` : "not in the vocabulary"}
        {record ? ` · used by ${usages}` : ""}
      </p>
      <p className="muted small-text">
        {traits.length > 0 ? (
          <>
            Reads <b>{traits.join(", ")}</b> from the language.
          </>
        ) : (
          "Reads nothing from the language: it draws the same whatever you set."
        )}
      </p>

      <ExceptionEditor
        name={name}
        language={language}
        traits={traits as ConstructionTrait[]}
        px={px}
        drawWith={drawWith}
        onException={onException}
      />

      {record && (
        <div className="actions">
          {record.status !== "approved" && (
            <button className="primary" onClick={() => void onAction((lib) => lib.setElementStatus(name, "approved"))}>
              Approve
            </button>
          )}
          {record.status !== "deprecated" && (
            <button onClick={() => void onAction((lib) => lib.setElementStatus(name, "deprecated"))}>Deprecate</button>
          )}
          <button className="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Stop editing" : "Edit geometry"}
          </button>
          {usages === 0 && (
            <button
              className="danger"
              onClick={() => confirm(`Delete element "${name}"?`) && void onAction((lib) => lib.removeElement(name))}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {editing && next && (
        <div className="element-editor">
          <label>
            Outline paths, one per line
            <textarea rows={4} value={outline} onChange={(e) => setOutline(e.target.value)} spellCheck={false} />
          </label>
          {previewError && <p className="error-text">{previewError}</p>}
          {!previewError && (
            <>
              <p className="muted small-text">
                {impacts.length === 0
                  ? "Nothing uses this element yet, so nothing else changes."
                  : `${impacts.filter((i) => i.changed).length} of ${impacts.length} icons change.`}
              </p>
              <div className="impacts">
                {impacts.map((impact) => (
                  <figure key={impact.icon.spec.name} className={impact.changed ? "changed" : ""}>
                    <div className="pair">
                      <div className={`swatch ${ground}`}>
                        <IconSvg svg={impact.before.svg} size={40} />
                      </div>
                      <div className={`swatch ${ground}`}>
                        <IconSvg svg={impact.after.svg} size={40} />
                      </div>
                    </div>
                    <figcaption>
                      {impact.icon.spec.name}
                      {impact.newIssues.length > 0 && <span className="warn-text"> ⚠ {impact.newIssues.join(", ")}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button
            className="primary"
            disabled={!!previewError}
            onClick={() =>
              void onAction((lib) => lib.saveElement(next))
                .then(() => {
                  setEditing(false);
                  setError(undefined);
                })
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
            }
          >
            Save, changing {impacts.filter((i) => i.changed).length}{" "}
            {impacts.filter((i) => i.changed).length === 1 ? "icon" : "icons"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A part drawn against the language, on purpose.
 *
 * Allowed, because forbidding something you cannot fully judge gets worked
 * around in worse ways. Never free: you see it beside the language value at the
 * same size, you say what you saw, and the set-level audit counts it.
 *
 * The sentence at the top is the one that matters. Most of the time a part that
 * looks wrong at the language value is telling you the value is wrong, and the
 * cheapest thing this screen can do is say so before you reach for the escape.
 */
function ExceptionEditor({
  name,
  language,
  traits,
  px,
  drawWith,
  onException,
}: {
  name: string;
  language: IconLanguage;
  traits: ConstructionTrait[];
  /** The same size the canvas is showing, so an exception is judged as it ships. */
  px: number;
  drawWith: (name: string, onDark: boolean, construction: Construction) => string | undefined;
  onException: (name: string, exception: ConstructionException | undefined) => void;
}) {
  const existing = language.construction.exceptions[name];
  const [open, setOpen] = useState(!!existing);
  const [draft, setDraft] = useState<ConstructionException["set"]>(existing?.set ?? {});
  const [why, setWhy] = useState(existing?.why ?? "");

  const mine = traits.filter((t) => TRAIT_CONSUMERS[t] === "primitives");
  if (mine.length === 0) return null;

  const changed = Object.keys(draft).length > 0;
  const reasoned = why.trim().length >= 3;
  const applied = changed && reasoned;

  /**
   * The exception is held here until it has a reason.
   *
   * Writing it to the language the moment a number moves puts an exception with
   * an empty `why` into the file, which the parser rightly refuses — so the
   * whole editor would collapse mid-edit. Requiring the reason before the
   * exception exists is also the more honest order: it makes you say what you
   * saw before you get to change anything.
   */
  const commit = (nextSet: ConstructionException["set"], nextWhy: string) => {
    setDraft(nextSet);
    setWhy(nextWhy);
    const ok = Object.keys(nextSet).length > 0 && nextWhy.trim().length >= 3;
    if (ok) onException(name, { set: nextSet, why: nextWhy.trim() });
    else if (existing) onException(name, undefined);
  };

  // What the part would look like, applied or not, so the pair is always honest.
  const preview: Construction = { ...language.construction, ...draft };

  if (!open) {
    return (
      <button className="link" onClick={() => setOpen(true)}>
        Draw this part against the language…
      </button>
    );
  }

  return (
    <div className="exception">
      <p className="note">
        An exception is allowed, and it is never silent. It shows here beside the set, it carries your reason, and the
        audit counts it. <b>If a part looks wrong at the language value, that is usually the value talking, not the part.</b>
      </p>
      <div className="exception-pair">
        <figure>
          <Swatch render={(onDark) => <IconSvg svg={drawWith(name, onDark, language.construction)} size={px} />} />
          <figcaption>the language</figcaption>
        </figure>
        <figure>
          <Swatch render={(onDark) => <IconSvg svg={drawWith(name, onDark, preview)} size={px} />} />
          <figcaption>{changed ? (applied ? "this exception" : "not applied yet") : "same, nothing changed"}</figcaption>
        </figure>
      </div>

      <label className="exception-why">
        Why
        <textarea
          rows={2}
          value={why}
          placeholder="What did you see that the language value got wrong? Required, because an exception without a reason is drift."
          onChange={(e) => commit(draft, e.target.value)}
        />
      </label>

      {mine.map((trait) => {
        const overridden = draft[trait] !== undefined;
        const value = preview[trait];
        return (
          <div key={trait} className="ctrl-row">
            <span className="field-label">{trait}</span>
            {typeof value === "number" ? (
              <input
                type="number"
                step={0.05}
                value={value}
                onChange={(e) =>
                  Number.isFinite(Number(e.target.value)) && commit({ ...draft, [trait]: Number(e.target.value) }, why)
                }
              />
            ) : (
              <input type="text" value={value} onChange={(e) => commit({ ...draft, [trait]: e.target.value }, why)} />
            )}
            <span className={`badge ${overridden ? "manual" : "derived"}`}>
              {overridden ? "exception" : "from the language"}
            </span>
          </div>
        );
      })}

      {changed && !reasoned && (
        <p className="warn-text small-text">Write a reason and this applies. Until then the part follows the language.</p>
      )}

      <div className="actions">
        <button
          className="ghost"
          onClick={() => {
            commit({}, "");
            setOpen(false);
          }}
        >
          Use the language value
        </button>
      </div>
    </div>
  );
}

/** Kept so the trait list order is stable and testable. */
export const ALL_TRAITS = CONSTRUCTION_TRAITS;
