import { compose, deriveElements, type ComposedIcon } from "@icon-foundry/icon-composer";
import { VARIANT_KINDS, type IconRecord, type Library, type VariantKind } from "@icon-foundry/icon-library";
import { STATUS_TRANSITIONS } from "@icon-foundry/icon-library";
import { ARRANGEMENTS, elementBox, parseIconSpec, type Arrangement, type ConceptPart, type IconSpec } from "@icon-foundry/icon-spec";
import { validateIconSpec, type ValidationIssue, type ValidationResult } from "@icon-foundry/icon-validator";
import { useEffect, useMemo, useState } from "react";
import { downloadText, fillabilityOf, renderSpec } from "../lib/render.js";
import { navigate } from "../lib/router.js";
import { useLibrary } from "../store/LibraryContext.js";
import { DEFAULT_LAYERS, IconPreview, type LayerName } from "./IconPreview.js";
import { IconSvg } from "./IconSvg.js";
import { ScoreSummary } from "./Scores.js";
import { StatusPill } from "./Status.js";
import { Swatch } from "./Swatch.js";

/**
 * The icon, open on the bench.
 *
 * A drawer rather than a side panel because inspection wants width: the
 * drawing, the rule it is being judged against, and the reason it failed all
 * want to be in one glance, and a 340px column makes you choose two of the
 * three. It sits at the bottom so the set stays on screen above it — you are
 * nearly always asking "does this belong with those", and an icon judged alone
 * is an icon judged against nothing.
 *
 * Everything here edits live. A control changes the spec, the spec recomposes,
 * and the drawing and its issues answer in the same frame. There is no Apply:
 * the point of putting the preview next to the control is to watch the drawing
 * move, and a value that waits for a button gives you a form and a stale
 * picture.
 */

const ZOOMS = [1, 2, 4, 8, 16];

const TOGGLEABLE: Array<[LayerName, string]> = [
  ["grid", "Grid"],
  ["safeArea", "Safe area"],
  ["keyline", "Keylines"],
  ["issues", "Issues"],
  ["handles", "Handles"],
];

export function IconDrawer({ record }: { record: IconRecord }) {
  const { library, mutate } = useLibrary();
  const [draft, setDraft] = useState<IconSpec>(record.spec);
  const [zoom, setZoom] = useState(8);
  const [layers, setLayers] = useState<Partial<Record<LayerName, boolean>>>({});
  const [hovered, setHovered] = useState<ValidationIssue>();
  const [error, setError] = useState<string>();

  // A different icon in the same drawer is a different subject: start over
  // rather than showing the last one's edits under this one's name.
  useEffect(() => setDraft(record.spec), [record.spec]);

  const language = library?.languageFor(draft);
  const registry = library?.registry();

  /*
   * Compose and validate the draft, not the saved record.
   *
   * This is the whole reason the drawer feels live: the preview is a function
   * of the thing being edited, so nothing has to be told to refresh.
   */
  const { icon, validation, failure } = useMemo((): {
    icon?: ComposedIcon;
    validation?: ValidationResult;
    failure?: string;
  } => {
    if (!language || !registry) return {};
    try {
      return {
        icon: compose(draft, language, { registry }),
        validation: validateIconSpec(draft, language, { registry }),
      };
    } catch (e) {
      return { failure: e instanceof Error ? e.message : String(e) };
    }
  }, [draft, language, registry]);

  if (!library || !language) return null;

  const layerOn = (name: LayerName): boolean => layers[name] ?? DEFAULT_LAYERS[name];
  const sizes = Object.keys(language.sizes).map(Number).sort((a, b) => a - b);
  const parts = draft.composition?.parts ?? [];
  const dirty = draft !== record.spec;

  /** Edit the draft and write it through, so "live" survives a reload. */
  const commit = (next: IconSpec) => {
    setDraft(next);
    void mutate((lib) => lib.save(next, {}))
      .then(() => setError(undefined))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const setParts = (next: ConceptPart[]): void => {
    if (draft.composition) commit({ ...draft, composition: { ...draft.composition, parts: next } });
  };

  const act = (fn: Parameters<typeof mutate>[0]) =>
    mutate(fn)
      .then(() => setError(undefined))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  const svg = renderSpec(draft, library).svg;

  return (
    <aside className="icon-drawer" aria-label={`${record.spec.name} details`}>
      <header className="drawer-head">
        <h2>{record.spec.name}</h2>
        <StatusPill status={record.status} />
        <span className="muted small-text">
          {library.language.name} · {draft.canvas}px · {draft.style ?? language.style.default}
        </span>
        {dirty && <span className="muted small-text">edited</span>}
        {error && <span className="error-text small-text">{error}</span>}
        <span className="spacer" />
        <button className="ghost close" onClick={() => navigate("library")} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="drawer-body">
        {/* The drawing, and what the language says about it. */}
        <section className="drawer-canvas">
          <div className="canvas-bar">
            {ZOOMS.map((z) => (
              <button key={z} className={`chip ${zoom === z ? "on" : ""}`} onClick={() => setZoom(z)}>
                {z}×
              </button>
            ))}
            <span className="bar-sep" />
            {TOGGLEABLE.map(([name, label]) => (
              <button
                key={name}
                className={`chip ${layerOn(name) ? "on" : ""}`}
                onClick={() => setLayers((l) => ({ ...l, [name]: !layerOn(name) }))}
              >
                {label}
              </button>
            ))}
          </div>

          {failure && <p className="error-text">{failure}</p>}
          {icon && (
            <div className="drawer-stage">
              <IconPreview
                icon={icon}
                zoom={zoom}
                layers={layers}
                {...(validation && { issues: validation.issues })}
                {...(hovered && { highlight: hovered })}
              />
              {/* True size, always, beside the magnified one: the row that
                  tells you what ships rather than what you are inspecting. */}
              <div className="drawer-true">
                {sizes.map((size) => (
                  <TrueSize key={size} spec={draft} size={size} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* What the icon is. Every control here re-derives the drawing. */}
        <section className="drawer-controls">
          <h3>Definition</h3>
          <div className="ctrl-row">
            <span className="field-label">Optical size</span>
            {sizes.map((size) => (
              <button
                key={size}
                className={`chip ${draft.canvas === size ? "on" : ""}`}
                onClick={() => commit({ ...draft, canvas: size })}
              >
                {size}px
              </button>
            ))}
          </div>
          <div className="ctrl-row">
            <span className="field-label">Style</span>
            {(["outline", "filled"] as const).map((style) => (
              <button
                key={style}
                className={`chip ${(draft.style ?? language.style.default) === style ? "on" : ""}`}
                onClick={() => commit({ ...draft, style })}
              >
                {style}
              </button>
            ))}
          </div>

          {VARIANT_KINDS.map((kind) => (
            <VariantRow key={kind} kind={kind} record={record} onAct={act} />
          ))}

          {draft.composition ? (
            <>
              <div className="ctrl-row">
                <span className="field-label">Arrangement</span>
                <select
                  value={draft.composition.arrangement}
                  onChange={(e) =>
                    commit({
                      ...draft,
                      composition: { ...draft.composition!, arrangement: e.target.value as Arrangement },
                    })
                  }
                >
                  {ARRANGEMENTS.filter((a) => language.grammar.arrangements.allowed.includes(a)).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <h3>Parts</h3>
              <ul className="drawer-parts">
                {parts.map((part, i) => (
                  <PartRow
                    key={`${part.element}:${i}`}
                    part={part}
                    names={registry?.names() ?? []}
                    onChange={(next) => setParts(parts.map((p, j) => (j === i ? next : p)))}
                    {...(parts.length > 1 && { onRemove: () => setParts(parts.filter((_, j) => j !== i)) })}
                  />
                ))}
              </ul>
            </>
          ) : (
            <Ungoverned spec={draft} onAdopt={commit} />
          )}

          <h3>Meaning</h3>
          <Tags record={record} />
        </section>

        {/* Why it is or is not allowed, and what happens to it next. */}
        <section className="drawer-verdict">
          <h3>
            Against the language
            {validation && (
              <span className={`muted small-text ${validation.valid ? "" : "error-text"}`}>
                {" "}
                · {validation.issues.length === 0 ? "clean" : `${validation.issues.length} to answer`}
              </span>
            )}
          </h3>
          {/* Pointing at an issue draws only that issue, so a crowded icon
              can still be read one problem at a time. */}
          <ul className="checks drawer-issues" onMouseLeave={() => setHovered(undefined)}>
            {validation?.issues.map((issue, i) => (
              <li
                key={`${issue.rule}:${i}`}
                className={issue.severity === "error" ? "error" : "warning"}
                onMouseEnter={() => setHovered(issue)}
                onFocus={() => setHovered(issue)}
              >
                <b>{issue.rule}</b> {issue.message}
                {issue.evidence && <span className="muted"> · shown on the canvas</span>}
              </li>
            ))}
            {validation?.passed.map((id) => (
              <li key={id} className="ok">
                ✓ {id}
              </li>
            ))}
          </ul>
          {validation && <ScoreSummary overall={validation.overall} scores={validation.scores} />}

          <div className="actions">
            {STATUS_TRANSITIONS[record.status].map((s) => (
              <button
                key={s}
                className={s === "published" ? "primary" : ""}
                onClick={() => act((lib) => lib.setStatus(record.spec.name, s))}
              >
                {s === "published" ? "Publish" : s === "review" ? "Send to review" : s === "deprecated" ? "Deprecate" : "Back to draft"}
              </button>
            ))}
            <button onClick={() => svg && downloadText(`${record.spec.name}.svg`, svg, "image/svg+xml")} disabled={!svg}>
              Download SVG
            </button>
            {(record.status === "draft" || record.status === "deprecated") && (
              <button
                className="danger"
                onClick={() => {
                  if (confirm(`Delete "${record.spec.name}"? This cannot be undone.`)) {
                    void act((lib) => lib.remove(record.spec.name)).then(() => navigate("library"));
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>

          {/* The definition itself, for the cases the controls above do not
              cover. Editing it is how an icon gets an exception written by
              hand, so it stays reachable. */}
          <details>
            <summary>Definition JSON</summary>
            <SpecEditor spec={draft} onParsed={commit} />
          </details>
        </section>
      </div>
    </aside>
  );
}

/**
 * Whether this icon also ships filled, and whether it could.
 *
 * Two different questions sit next to each other here on purpose. The Style row
 * above says what *this drawing* is. This says whether the set also carries a
 * solid version of it — a variant of the same icon, derived from its own closed
 * loops, which is why adding one usually costs nothing.
 */
function VariantRow({
  kind,
  record,
  onAct,
}: {
  kind: VariantKind;
  record: IconRecord;
  onAct: (fn: (lib: Library) => Promise<unknown>) => Promise<unknown>;
}) {
  const { library } = useLibrary();
  // Only the filled style has a feasibility question. A slash can always be cut;
  // whether the icon needs one is a product decision like any other.
  const check = useMemo(
    () => (library && kind === "filled" ? fillabilityOf(record.spec, library) : undefined),
    [record.spec, library, kind],
  );
  if (!library) return null;
  if (kind === "filled" && !library.language.style.allowed.includes("filled")) return null;
  const name = record.spec.name;
  const variant = record.variants?.[kind];

  return (
    <div className="filled-row">
      <div className="ctrl-row">
        <span className="field-label">{kind === "filled" ? "Filled version" : "Slashed (-off)"}</span>
        {variant ? (
          <>
            <span className="pill">{variant.status}</span>
            {variant.status === "draft" && (
              <button className="chip" onClick={() => void onAct((lib) => lib.setVariant(name, kind, { status: "published" }))}>
                Publish it
              </button>
            )}
            <button className="chip" onClick={() => void onAct((lib) => lib.clearVariant(name, kind))}>
              Remove
            </button>
          </>
        ) : !check || check.ok ? (
          <button className="chip" onClick={() => void onAct((lib) => lib.setVariant(name, kind))}>
            Add
          </button>
        ) : (
          <span className="muted small-text">not possible</span>
        )}
      </div>
      {check && check.reasons.length > 0 && (
        <ul className="filled-reasons">
          {check.reasons.map((r, i) => (
            <li key={`${r.code}-${i}`} className={r.severity}>
              {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The icon at one of the language's real sizes, on the current ground. */
function TrueSize({ spec, size }: { spec: IconSpec; size: number }) {
  const { library } = useLibrary();
  if (!library) return null;
  const at: IconSpec = { ...spec, canvas: size };
  return (
    <figure>
      <Swatch tone="surface" render={(onDark) => <IconSvg svg={renderSpec(at, library, onDark).svg} size={size} />} />
      <figcaption className="muted small-text">{size}px</figcaption>
    </figure>
  );
}

/** One part of a composition: what it is, and whether it is pinned. */
function PartRow({
  part,
  names,
  onChange,
  onRemove,
}: {
  part: ConceptPart;
  names: readonly string[];
  onChange: (next: ConceptPart) => void;
  onRemove?: () => void;
}) {
  const pinned = part.except !== undefined;
  return (
    <li className={`drawer-part ${pinned ? "is-pinned" : ""}`}>
      <select value={part.element} onChange={(e) => onChange({ ...part, element: e.target.value })}>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={part.priority}
        onChange={(e) => onChange({ ...part, priority: e.target.value as ConceptPart["priority"] })}
        title="An optional part is dropped when the size's budget cannot afford it"
      >
        <option value="essential">essential</option>
        <option value="optional">optional</option>
      </select>
      {pinned && (
        <span className="badge manual" title={part.except?.why}>
          pinned
        </span>
      )}
      {onRemove && (
        <button className="ghost small" onClick={onRemove} aria-label={`Remove ${part.element}`}>
          ✕
        </button>
      )}
    </li>
  );
}

/**
 * An icon the keyline sheet does not reach, and the way back.
 *
 * Its geometry is written down, so moving a keyline box will not move it. The
 * offer is to find the composition that reproduces it exactly — if one does,
 * adopting it changes nothing about how the icon looks today and everything
 * about whether it follows the language tomorrow.
 */
function Ungoverned({ spec, onAdopt }: { spec: IconSpec; onAdopt: (next: IconSpec) => void }) {
  const { library } = useLibrary();
  const language = library?.languageFor(spec);
  const registry = library?.registry();

  const match = useMemo(() => {
    if (!language || !registry || !spec.elements) return undefined;
    const parts = spec.elements.map((el) => ({
      element: (el as { primitive?: string }).primitive ?? "",
      priority: "essential" as const,
    }));
    if (parts.some((p) => !p.element)) return undefined;
    const same = (a: IconSpec["elements"], b: IconSpec["elements"]) =>
      !!a && !!b && a.length === b.length &&
      a.every((el, i) => {
        const x = elementBox(el);
        const y = elementBox(b[i]!);
        return (
          Math.abs(x.x - y.x) < 1e-6 && Math.abs(x.y - y.y) < 1e-6 &&
          Math.abs(x.width - y.width) < 1e-6 && Math.abs(x.height - y.height) < 1e-6
        );
      });
    for (const arrangement of ARRANGEMENTS) {
      if (!language.grammar.arrangements.allowed.includes(arrangement)) continue;
      try {
        const out = deriveElements({ arrangement, parts }, language, { canvas: spec.canvas, registry });
        if (same(out.elements, spec.elements)) return { arrangement, parts };
      } catch {
        // This arrangement cannot express the icon. Try the next.
      }
    }
    return undefined;
  }, [spec, language, registry]);

  return (
    <div className="drawer-ungoverned">
      <h3>Outside the keyline sheet</h3>
      <p className="muted small-text">
        This icon carries its own geometry, so changing a keyline box will not move it.
      </p>
      {match ? (
        <>
          <p className="small-text">
            A <b>{match.arrangement}</b> of {match.parts.map((p) => p.element).join(", ")} reproduces it exactly, so
            adopting the sheet changes nothing about how it looks today.
          </p>
          <button
            className="primary"
            onClick={() => {
              const next: IconSpec = { ...spec, composition: { arrangement: match.arrangement, parts: match.parts } };
              delete next.elements;
              onAdopt(next);
            }}
          >
            Put it on the sheet
          </button>
        </>
      ) : (
        <p className="small-text warn-text">
          No arrangement reproduces this geometry, so adopting the sheet would move it. Resolve it from the drift
          report, where the change is shown before it is made.
        </p>
      )}
    </div>
  );
}

/** Tags and concepts: what the icon means, as opposed to how it is drawn. */
function Tags({ record }: { record: IconRecord }) {
  const { mutate } = useLibrary();
  const [tags, setTags] = useState(record.tags.join(", "));
  const [concepts, setConcepts] = useState(record.concepts.join(", "));
  const list = (value: string) => value.split(",").map((t) => t.trim()).filter(Boolean);
  // Text commits on blur rather than per keystroke: a half-typed tag is not a
  // tag, and unlike a size chip there is no drawing to watch while you type.
  const save = (patch: { tags?: string[]; concepts?: string[] }) => void mutate((lib) => lib.save(record.spec, patch));
  return (
    <>
      <label>
        Tags
        <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => save({ tags: list(tags) })} />
      </label>
      <label>
        Concepts it answers
        <input
          value={concepts}
          onChange={(e) => setConcepts(e.target.value)}
          onBlur={() => save({ concepts: list(concepts) })}
          placeholder="e.g. cold chain, refrigerated"
        />
      </label>
    </>
  );
}

/** The raw definition, for what the controls do not reach. */
function SpecEditor({ spec, onParsed }: { spec: IconSpec; onParsed: (next: IconSpec) => void }) {
  const [text, setText] = useState(() => JSON.stringify(spec, null, 2));
  const [error, setError] = useState<string>();
  useEffect(() => setText(JSON.stringify(spec, null, 2)), [spec]);
  return (
    <>
      <textarea
        rows={10}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onParsed(parseIconSpec(JSON.parse(text)));
            setError(undefined);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      {error && <p className="error-text small-text">{error}</p>}
    </>
  );
}
