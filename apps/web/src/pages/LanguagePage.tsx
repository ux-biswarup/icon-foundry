import {
  DEFAULT_CHARACTER,
  DEFAULT_GRAMMAR,
  DEFAULT_CONSTRUCTION,
  DEFAULT_OPTICS,
  OPTICAL_SHAPES,
  builtInLanguages,
  deriveTokens,
  parseIconLanguage,
  serializeIconLanguage,
  type BadgeCorner,
  type DerivableToken,
  type Derivation,
  type DiagonalDirection,
  type IconCharacter,
  type IconGrammar,
  type IconLanguage,
  type Construction,
  type ConstructionException,
  type ConstructionTrait,
  type Box,
  type IconLanguageInput,
  type IconStyle,
  type OpticalShape,
  type OpticsTokens,
  type SizeInput,
  type SizeTokens,
  type StrokeCap,
  type StrokeJoin,
} from "@icon-foundry/icon-language";
import type { LanguageVersion } from "@icon-foundry/icon-library";
import { builtInHumanRules, builtInRules, builtInScorers } from "@icon-foundry/icon-validator";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { useCallback, useEffect, useMemo, useState } from "react";
import { agentStatus, type AgentStatus } from "../lib/agentClient.js";
import { DerivationPanel, type Override } from "../components/DerivationPanel.js";
import { ConstructionPanel } from "../components/ConstructionPanel.js";
import { ExemplarBoard } from "../components/ExemplarBoard.js";
import { HandChat } from "../components/HandChat.js";
import { PartsCanvas } from "../components/PartsCanvas.js";
import { AngleFan } from "../components/AngleFan.js";
import { MethodCanvas } from "../components/MethodCanvas.js";
import { CornerRamp } from "../components/CornerRamp.js";
import { KeylineSheet } from "../components/KeylineSheet.js";
import { OpticalShapesPanel } from "../components/OpticalShapesPanel.js";
import { AxisSlider, Choice, Field, Lands, NumberField, StringList, Toggle, WordList } from "../components/LanguageFields.js";
import { useLibrary } from "../store/LibraryContext.js";

const CAPS: readonly StrokeCap[] = ["butt", "round", "square"];
const JOINS: readonly StrokeJoin[] = ["miter", "round", "bevel"];
const CORNERS: readonly BadgeCorner[] = ["top-right", "top-left", "bottom-right", "bottom-left"];
const DIAGONALS: readonly DiagonalDirection[] = ["up-right", "up-left", "none"];
const STYLES: readonly IconStyle[] = ["outline", "filled"];
const ANGLE_SETS: Array<{ label: string; angles: number[]; note: string }> = [
  { label: "Orthogonal + 45°", angles: [0, 45, 90, 135], note: "Technical drawing. Lines run flat, upright, or on the diagonal." },
  { label: "Orthogonal only", angles: [0, 90], note: "Strictest. Everything is flat or upright." },
  { label: "Orthogonal + 30/45/60°", angles: [0, 30, 45, 60, 90, 120, 135, 150], note: "Room for isometric and shallow slopes." },
  { label: "Any angle", angles: [], note: "Nothing is checked. Freeform drawing is allowed." },
];

const AXES: Array<[keyof IconLanguage["character"]["axes"], string, string]> = [
  ["geometric", "organic", "geometric"],
  ["minimal", "expressive", "minimal"],
  ["technical", "friendly", "technical"],
  ["literal", "abstract", "literal"],
];

type Draft = IconLanguageInput;

/**
 * Put keyline boxes on the size that owns them, or take them off again.
 *
 * The primary optical size is stored at the top level of a language file and
 * every other size inside `sizes`, so one edit has two possible destinations.
 * Passing `undefined` deletes rather than writing an empty object: absent
 * means derived, and a file should record only real decisions.
 */
function writeOptical(draft: Draft, canvas: number, optical: Draft["optical"] | undefined): Draft {
  const out: Draft = { ...draft };
  if (canvas === draft.canvas) {
    if (optical) out.optical = optical;
    else delete out.optical;
    return out;
  }
  out.sizes = (draft.sizes ?? []).map((s) => {
    if (s.canvas !== canvas) return s;
    const next = { ...s };
    if (optical) next.optical = optical;
    else delete next.optical;
    return next;
  });
  return out;
}

/**
 * The language editor: where a team states its rules, guidelines and
 * philosophy, and watches the consequence on real icons as it types.
 *
 * State is the *authored* shape (`IconLanguageInput`), not the parsed one, so
 * what the editor holds is exactly what the folder will hold. Everything
 * derived — keyline boxes, defaulted budgets — is recomputed by parsing on
 * every keystroke, which is also how invalid intermediate states are caught.
 */
export function LanguagePage() {
  const { library, mutate, read, version: libVersion } = useLibrary();
  const [languageId, setLanguageId] = useState<string>();
  const [draft, setDraft] = useState<Draft>();
  const [exemplars, setExemplars] = useState<IconSpec[]>([]);
  const [history, setHistory] = useState<LanguageVersion[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** Which control is being touched, so the canvas can scope itself to it. */
  const [focusTrait, setFocusTrait] = useState<ConstructionTrait | undefined>(undefined);
  const [selectedPart, setSelectedPart] = useState<string | undefined>(undefined);
  const [canvasSize, setCanvasSize] = useState<number>(0);
  /** Magnification, kept apart from the optical size on purpose. */
  const [zoom, setZoom] = useState<number>(1);
  const [status, setStatus] = useState<AgentStatus>({ model: null, error: null, reachable: false });
  useEffect(() => void agentStatus().then(setStatus), []);
  const [reviewing, setReviewing] = useState(false);
  /** Parts, or the keyline sheet the parts are sized against. */
  const [view, setView] = useState<"parts" | "keylines" | "method">("parts");
  /**
   * Which style the canvas draws. A filled style is a property of the *set* —
   * whether these shapes still read as one hand when they are solid — so it is
   * judged here, on every part at once, rather than one icon at a time.
   */
  const [drawStyle, setDrawStyle] = useState<"outline" | "filled">("outline");
  const [shapeAt, setShapeAt] = useState<{ canvas: number; shape: OpticalShape }>();
  /**
   * Which group of controls the rail is showing while the parts canvas is up.
   *
   * "Primitives" is deliberately not in here. The optical shapes *are* the
   * keyline boxes — picking one used to throw the canvas over to the keyline
   * sheet, which is the tell that it was never a third peer of the hand and the
   * rules but the one rail that sheet has. So it follows the view instead of
   * being chosen, and this remembers only the choice a designer actually makes.
   */
  const [tab, setTab] = useState<"hand" | "rules">("hand");

  /*
   * The rail belongs to the canvas, not the other way round.
   *
   * Looking at the keyline sheet, the only controls that mean anything are the
   * boxes it draws, so that is the whole rail. Looking at the parts, the boxes
   * are not what you are moving, so they are not on offer. Derived rather than
   * synced: a `tab` that could disagree with `view` is a state pair that will
   * eventually disagree.
   */
  const rail: "primitives" | "hand" | "rules" | "method" =
    view === "keylines" ? "primitives" : view === "method" ? "method" : tab;
  const railTabs =
    view === "keylines"
      ? ([["primitives", "Primitives"]] as const)
      : view === "method"
        ? ([["method", "Construction"]] as const)
        : ([
            ["hand", "The hand"],
            ["rules", "Rules"],
          ] as const);

  const current = useMemo(() => {
    if (!library) return undefined;
    return library.getLanguage(languageId ?? library.manifest.language);
  }, [library, languageId, libVersion]);

  // Load the selected language into the editor, plus its reference icons.
  useEffect(() => {
    if (!current || !library) return;
    setDraft(serializeIconLanguage(current));
    setNote("");
    setReviewing(false);
    void read((lib) => lib.exemplars(current.id)).then(setExemplars);
    void read((lib) => lib.languageHistory(current.id)).then(setHistory);
  }, [current, library, read]);

  const parsed = useMemo(() => {
    if (!draft) return undefined;
    try {
      return { language: parseIconLanguage(draft), error: undefined as string | undefined };
    } catch (e) {
      return { language: undefined, error: e instanceof Error ? e.message : String(e) };
    }
  }, [draft]);

  const patch = useCallback((next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d)), []);
  /** Drop a key so the value goes back to being derived. Absent means derived,
   * so clearing an override is a deletion, not a write of undefined. */
  const unset = useCallback(
    (key: keyof Draft) =>
      setDraft((d) => {
        if (!d) return d;
        const out = { ...d };
        delete out[key];
        return out;
      }),
    [],
  );
  const patchSize = useCallback(
    (index: number, next: Partial<SizeInput>) =>
      setDraft((d) => (d && d.sizes ? { ...d, sizes: d.sizes.map((s, i) => (i === index ? { ...s, ...next } : s)) } : d)),
    [],
  );
  /** A trait back at its proposal is deleted rather than written down: absent
   * means derived, so the file keeps only real decisions. */
  const patchConstruction = useCallback(
    (next: Partial<Construction>) =>
      setDraft((d) => (d ? { ...d, construction: { ...d.construction, ...next } } : d)),
    [],
  );
  const clearConstruction = useCallback(
    (trait: ConstructionTrait) =>
      setDraft((d) => {
        if (!d?.construction) return d;
        const construction = { ...d.construction };
        delete construction[trait];
        const out = { ...d };
        if (Object.keys(construction).length === 0) delete out.construction;
        else out.construction = construction;
        return out;
      }),
    [],
  );
  /** An exception is a normal language edit: it goes through review and version. */
  const setException = useCallback(
    (name: string, exception: ConstructionException | undefined) =>
      setDraft((d) => {
        if (!d) return d;
        const exceptions = { ...d.construction?.exceptions };
        if (exception) exceptions[name] = exception;
        else delete exceptions[name];
        const construction = { ...d.construction };
        if (Object.keys(exceptions).length === 0) delete construction.exceptions;
        else construction.exceptions = exceptions;
        const out = { ...d };
        if (Object.keys(construction).length === 0) delete out.construction;
        else out.construction = construction;
        return out;
      }),
    [],
  );

  /** A correction back at its default is deleted rather than written as a zero:
   * absent means off, and the file should show only real decisions. */
  const patchOptics = useCallback(
    (next: Partial<OpticsTokens>) =>
      setDraft((d) => {
        if (!d) return d;
        const merged: OpticsTokens = { ...DEFAULT_OPTICS, ...d.optics, ...next };
        const out: Partial<OpticsTokens> = {};
        for (const key of ["junctionNotch", "junctionAngle", "interiorThin", "dotRatio"] as const) {
          if (merged[key] !== DEFAULT_OPTICS[key]) out[key] = merged[key];
        }
        const draft: Draft = { ...d };
        if (Object.keys(out).length === 0) delete draft.optics;
        else draft.optics = out;
        return draft;
      }),
    [],
  );
  /**
   * Resize one keyline box.
   *
   * Only the size is editable; the origin is recomputed by centring, because
   * an off-centre keyline box is a per-part correction rather than a property
   * of the whole set. The box is written to the size that owns it — the
   * primary size lives at the top level of the file, every other size in
   * `sizes` — and the other three shapes are written alongside it, because
   * `optical` is parsed as a whole and a partial object would silently take
   * derived values for the shapes it left out.
   */
  const setOpticalBox = useCallback(
    (canvas: number, shape: OpticalShape, size: { width: number; height: number }) =>
      setDraft((d) => {
        if (!d) return d;
        let parsed: IconLanguage;
        try {
          parsed = parseIconLanguage(d);
        } catch {
          return d;
        }
        const tokens = parsed.sizes[canvas];
        if (!tokens) return d;
        const width = Math.min(size.width, canvas);
        const height = Math.min(size.height, canvas);
        const next: Record<string, Box> = {};
        for (const s of OPTICAL_SHAPES) {
          const box = tokens.optical[s];
          next[s] =
            s === shape
              ? { x: (canvas - width) / 2, y: (canvas - height) / 2, width, height }
              : { ...box };
        }
        return writeOptical(d, canvas, next as unknown as NonNullable<Draft["optical"]>);
      }),
    [],
  );

  /** Drop the authored boxes for one size so they go back to being derived. */
  const resetOptical = useCallback(
    (canvas: number) => setDraft((d) => (d ? writeOptical(d, canvas, undefined) : d)),
    [],
  );

  /** The primary size lives at the top level of the file, not in `sizes`. */
  const patchPrimary = useCallback(
    (next: Partial<SizeInput>) =>
      setDraft((d) => {
        if (!d) return d;
        const out: Draft = { ...d };
        if (next.grid !== undefined) out.grid = next.grid;
        if (next.safeArea !== undefined) out.safeArea = next.safeArea;
        if (next.cornerRadius !== undefined) out.cornerRadius = next.cornerRadius;
        if (next.minNegativeSpace !== undefined) out.minNegativeSpace = next.minNegativeSpace;
        if (next.stroke) out.stroke = { ...d.stroke, ...next.stroke };
        if (next.limits) out.limits = { ...d.limits, ...next.limits };
        return out;
      }),
    [],
  );

  if (!library || !draft || !current) return null;
  const preview = parsed?.language;
  const dirty = JSON.stringify(draft) !== JSON.stringify(serializeIconLanguage(current));
  const versionTaken = history.some((h) => h.version === draft.version) && draft.version === current.version;
  // Work with whole objects: the authored file may omit anything, but the
  // editor should never have to reason about which half is missing.
  const character: IconCharacter = {
    ...DEFAULT_CHARACTER,
    ...draft.character,
    axes: { ...DEFAULT_CHARACTER.axes, ...draft.character?.axes },
    metaphors: { ...DEFAULT_CHARACTER.metaphors, ...draft.character?.metaphors },
  };
  const grammar: IconGrammar = {
    ...DEFAULT_GRAMMAR,
    ...draft.grammar,
    badge: { ...DEFAULT_GRAMMAR.badge, ...draft.grammar?.badge },
    arrangements: { ...DEFAULT_GRAMMAR.arrangements, ...draft.grammar?.arrangements },
  };
  const optics: OpticsTokens = { ...DEFAULT_OPTICS, ...draft.optics };
  const sizeOptions = Object.keys(preview?.sizes ?? { [draft.canvas]: 0 }).map(Number).sort((a, b) => a - b);
  const size = sizeOptions.includes(canvasSize) ? canvasSize : (preview?.defaultCanvas ?? draft.canvas);
  if (size !== canvasSize) setCanvasSize(size);
  /** Element lifecycle actions write straight through; they are not language edits. */
  const act = (fn: Parameters<typeof mutate>[0]) =>
    mutate(fn).then(() => setError(undefined)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  const patchCharacter = (next: Partial<IconCharacter>) => patch({ character: { ...character, ...next } });
  const patchGrammar = (next: Partial<IconGrammar>) => patch({ grammar: { ...grammar, ...next } });

  /** Clear one budget without disturbing the other. */
  const patchLimits = (field: "maxElements" | "maxShapes") => {
    const next = { ...draft.limits };
    delete next[field];
    if (Object.keys(next).length === 0) unset("limits");
    else patch({ limits: next });
  };

  const derived = preview ? deriveTokens(preview.character, preview.derivation, preview.defaultCanvas) : undefined;
  const overrides: Partial<Record<DerivableToken, Override>> = {
    cornerRadius: {
      set: draft.cornerRadius !== undefined,
      value: draft.cornerRadius,
      clear: () => unset("cornerRadius"),
      write: (v) => patch({ cornerRadius: Number(v) }),
    },
    maxElements: {
      set: draft.limits?.maxElements !== undefined,
      value: draft.limits?.maxElements,
      clear: () => patchLimits("maxElements"),
      write: (v) => patch({ limits: { ...draft.limits, maxElements: Number(v) } }),
    },
    maxShapes: {
      set: draft.limits?.maxShapes !== undefined,
      value: draft.limits?.maxShapes,
      clear: () => patchLimits("maxShapes"),
      write: (v) => patch({ limits: { ...draft.limits, maxShapes: Number(v) } }),
    },
    badgeRatio: {
      set: draft.grammar?.badge?.ratio !== undefined,
      value: draft.grammar?.badge?.ratio,
      clear: () => patch({ grammar: { ...grammar, badge: { corner: grammar.badge.corner } } }),
      write: (v) => patch({ grammar: { ...grammar, badge: { ...grammar.badge, ratio: Number(v) } } }),
    },
    strokeCap: {
      set: draft.stroke.cap !== undefined,
      value: draft.stroke.cap,
      clear: () => patch({ stroke: { width: draft.stroke.width, ...(draft.stroke.join && { join: draft.stroke.join }) } }),
      write: (v) => patch({ stroke: { ...draft.stroke, cap: v as StrokeCap } }),
    },
    strokeJoin: {
      set: draft.stroke.join !== undefined,
      value: draft.stroke.join,
      clear: () => patch({ stroke: { width: draft.stroke.width, ...(draft.stroke.cap && { cap: draft.stroke.cap }) } }),
      write: (v) => patch({ stroke: { ...draft.stroke, join: v as StrokeJoin } }),
    },
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await mutate((lib) => lib.saveLanguage(preview, { ...(note.trim() && { note: note.trim() }) }));
      setHistory(await read((lib) => lib.languageHistory(preview.id)));
      setNote("");
      setReviewing(false);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addLanguage = async (presetId: string) => {
    const preset = builtInLanguages[presetId];
    if (!preset) return;
    setBusy(true);
    try {
      await mutate((lib) => lib.saveLanguage(preset));
      setLanguageId(preset.id);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const missingPresets = Object.keys(builtInLanguages).filter((id) => !library.hasLanguage(id));

  return (
    <div className="page language-editor">
      <header className="editor-head">
        <div>
          <h1>{draft.name || "Untitled language"}</h1>
          <p className="lede">Everything an icon in this set has to obey. Change anything and watch the reference icons.</p>
        </div>
        <div className="head-actions">
          {library.manifest.languages.length > 1 && (
            <select value={current.id} onChange={(e) => setLanguageId(e.target.value)}>
              {library.languages().map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} v{l.version}
                </option>
              ))}
            </select>
          )}
          {missingPresets.length > 0 && (
            <select
              value=""
              disabled={busy}
              onChange={(e) => e.target.value && void addLanguage(e.target.value)}
              title="Add a second language, for example while migrating between versions"
            >
              <option value="">Add a language…</option>
              {missingPresets.map((id) => (
                <option key={id} value={id}>
                  from {builtInLanguages[id]!.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}
      {parsed?.error && <p className="error-text">This change is not valid yet: {parsed.error}</p>}

      <div className="hand-layout">
        {/* Left: the language as words and rules. None of it changes the drawing. */}
        <div className="col words">
          <p className="col-head">The language</p>
          <p className="col-sub">What it is and what it stands for. Written once, read rarely.</p>
          <section>
            <h2>Identity</h2>
            <Field label="Name">
              <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea rows={2} value={draft.description ?? ""} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
          </section>

          <section>
            <h2>Philosophy</h2>
            <Field
              label="Purpose"
              hint={<Lands>Opens the brief the drafting agent is given, and sits above the set in review.</Lands>}
            >
              <textarea
                rows={2}
                placeholder="Icons for a tool someone uses all day. They should be read, not noticed."
                value={character.purpose ?? ""}
                onChange={(e) => patchCharacter({ purpose: e.target.value })}
              />
            </Field>


            <Field
              label="Principles"
              hint={<Lands>Handed to the drafting agent word for word, one line each. Write them as instructions.</Lands>}
            >
              <StringList
                items={character.principles}
                placeholder="Detail is a budget, not a bonus. If it disappears at 16px, it should not be drawn."
                addLabel="Add a principle"
                onChange={(principles) => patchCharacter({ principles })}
              />
            </Field>

            <Field label="Metaphors this set uses" hint={<Lands kind="used">Offered to the agent as the vocabulary to reach for.</Lands>}>
              <WordList
                value={character.metaphors.use}
                placeholder="containers, arrows, badges, documents"
                onChange={(use) => patchCharacter({ metaphors: { ...character.metaphors, use } })}
              />
            </Field>
            <Field label="Metaphors it refuses" hint={<Lands kind="used">The agent is told not to reach for these, and review shows when one appears.</Lands>}>
              <WordList
                value={character.metaphors.avoid}
                placeholder="faces, hands, fake depth, drop shadows"
                onChange={(avoid) => patchCharacter({ metaphors: { ...character.metaphors, avoid } })}
              />
            </Field>
            <Field label="Words your product owns" hint={<Lands kind="used">Helps the agent recognise your own nouns.</Lands>}>
              <WordList
                value={character.vocabulary}
                placeholder="shipment, hub, lane, exception"
                onChange={(vocabulary) => patchCharacter({ vocabulary })}
              />
            </Field>
          </section>

          <section>
            <h2>Preferences</h2>
            <p className="muted small-text">
              Soft rules. They are measured and used to rank, never to refuse. How much each one counts is your
              decision, not ours — set a weight to zero to switch one off.
            </p>
            {builtInScorers.map((scorer) => {
              const weight = draft.preferences?.[scorer.id] ?? 1;
              return (
                <div className="preference" key={scorer.id}>
                  <div className="preference-head">
                    <span className="field-label">{scorer.label}</span>
                    <span className="muted small-text">{weight === 0 ? "off" : `×${weight}`}</span>
                  </div>
                  <div className="row-inline">
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.25}
                      value={weight}
                      onChange={(e) => {
                        const next = { ...draft.preferences, [scorer.id]: Number(e.target.value) };
                        if (next[scorer.id] === 1) delete next[scorer.id];
                        patch({ preferences: next });
                      }}
                    />
                  </div>
                  <p className="muted small-text">{scorer.description}</p>
                </div>
              );
            })}
            <Lands kind="guidance">Measured on every icon and shown as a score. Nothing here can stop an icon.</Lands>

            <h2>Left to a person</h2>
            <p className="muted small-text">
              Questions with no measurement. They are asked in review and never answered by the system, because
              implying an enforcement that does not exist is worse than admitting there is none.
            </p>
            <ul className="human-questions">
              {builtInHumanRules.map((rule) => (
                <li key={rule.id}>
                  <strong>{rule.label}.</strong> {rule.question}
                </li>
              ))}
            </ul>
            <p className="muted small-text">
              {builtInRules.length} rules are enforced, {builtInScorers.length} are scored, {builtInHumanRules.length}{" "}
              are left to you.
            </p>
          </section>

          {history.length > 0 && (
            <section>
              <h2>Versions</h2>
              <ul className="versions">
                {history.map((h) => (
                  <li key={h.version}>
                    <strong>v{h.version}</strong> <span className="muted">{new Date(h.savedAt).toLocaleString()}</span>
                    {h.note && <div className="muted small-text">{h.note}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Middle: every part, live. The reason three columns are worth having. */}
        <div className="col canvas">
          <div className="canvas-bar">
            {/* What you are looking at: the parts, or the rule they are sized to.
                Nothing else lives here — size and magnification belong to the
                parts and travel with them, the way pan and zoom belong to the
                keyline sheet. A bar that mixes the two implies the sizes apply
                to whichever view is up, and on the sheet they never did: it
                draws every size at once. */}
            {/* Three questions a set has to answer: do these look like one hand,
                are they the same size, are they built the same way. */}
            {(["parts", "keylines", "method"] as const).map((v) => (
              <button key={v} className={`chip ${view === v ? "on" : ""}`} onClick={() => setView(v)}>
                {v === "parts" ? "Parts" : v === "keylines" ? "Keylines" : "Method"}
              </button>
            ))}
            <span className="spacer" />
            {dirty && <span className="muted small-text">unsaved</span>}
          </div>
          {preview && view === "keylines" && (
            <KeylineSheet
              language={preview}
              registry={library.registry()}
              sizes={sizeOptions}
              selected={shapeAt}
              onSelect={setShapeAt}
              onChange={setOpticalBox}
            />
          )}
          {preview && view === "parts" && (
            <PartsCanvas
              library={library}
              language={preview}
              registry={library.registry()}
              focus={focusTrait}
              size={size}
              zoom={zoom}
              sizes={sizeOptions}
              onSize={setCanvasSize}
              onZoom={setZoom}
              style={drawStyle}
              onStyle={setDrawStyle}
              selected={selectedPart}
              onSelect={setSelectedPart}
              onAction={act}
              onException={setException}
            />
          )}
          {preview && view === "method" && (
            <MethodCanvas
              library={library}
              language={preview}
              registry={library.registry()}
              size={size}
              selected={selectedPart}
              onSelect={setSelectedPart}
              onAction={act}
            />
          )}
          {reviewing && preview && (
            <ExemplarBoard exemplars={exemplars} language={preview} registry={library.registry()} compareWith={current} />
          )}
        </div>

        {/* Right: everything that moves the drawing. Nothing here is words. */}
        <div className="col controls">
          <div className="rail-tabs" role="tablist">
            {railTabs.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={rail === id}
                className={`rail-tab ${rail === id ? "on" : ""}`}
                // A view with one rail has its tab already selected and nothing
                // to switch to. Only the parts view offers a choice.
                onClick={id === "hand" || id === "rules" ? () => setTab(id) : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {rail === "primitives" && (
            <section>
              <h2>Optical shapes</h2>
              <p className="muted small-text">
                Four boxes, so shapes of different proportions read as the same size. Every part declares one, and the
                count beside each is how many it moves.
              </p>
              {preview && (
                <OpticalShapesPanel
                  language={preview}
                  registry={library.registry()}
                  sizes={sizeOptions}
                  selected={shapeAt}
                  // The sheet is already up: this rail only exists while it is.
                  onSelect={setShapeAt}
                  onChange={setOpticalBox}
                  onReset={resetOptical}
                />
              )}
              <Lands kind="guidance">
                Most parts fit one of the four. A diagonal sits awkwardly in all of them; give it the closest box and
                correct the rest by eye with a per-part exception.
              </Lands>
            </section>
          )}

          {rail === "method" && preview && (
            <>
              <section>
                <h2>Personality</h2>
                <p className="muted small-text">The input. Everything below follows from these.</p>
                {derived && (
                  <DerivationPanel
                    derived={derived}
                    derivation={preview.derivation}
                    canvas={preview.defaultCanvas}
                    character={character}
                    overrides={overrides}
                    onChangeAxes={(axes) => patchCharacter({ axes })}
                    onChangeDerivation={(derivation: Derivation) => patch({ derivation })}
                  />
                )}
              </section>

              <section>
                <h2>Line angles</h2>
                <p className="muted small-text">Where a segment may point.</p>
                <div className="angle-sets">
                  {ANGLE_SETS.map((set) => {
                    const on = JSON.stringify(grammar.angles) === JSON.stringify(set.angles);
                    return (
                      <button
                        key={set.label}
                        className={on ? "on" : ""}
                        title={set.note}
                        onClick={() => patchGrammar({ angles: set.angles })}
                      >
                        <AngleFan angles={set.angles} label={set.label} />
                        <strong>{set.label}</strong>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2>Corners</h2>
                <p className="muted small-text">Sharper corners round less.</p>
                <CornerRamp
                  corners={preview.construction.corners}
                  tokens={preview.sizes[size] ?? preview.sizes[preview.defaultCanvas]!}
                  snap={preview.construction.cornerSnap}
                  onChange={(corners) => patchConstruction({ corners })}
                  onSnap={(cornerSnap) => patchConstruction({ cornerSnap })}
                />
                <Lands kind="checked">
                  Applied to every element drawn as a skeleton, every time it is drawn. Nothing is baked in, so
                  changing this re-rounds the set.
                </Lands>
              </section>

              <section>
                <h2>How a part is built</h2>
                <ConstructionPanel
                  construction={preview.construction}
                  authored={draft.construction}
                  character={character}
                  derivation={preview.derivation}
                  registry={library.registry()}
                  onChange={patchConstruction}
                  onClear={clearConstruction}
                  onFocus={setFocusTrait}
                />
              </section>
            </>
          )}

          {rail === "hand" && (
            <>
          <section>
            <h2>Personality</h2>

            {derived && preview && (
              <DerivationPanel
                derived={derived}
                derivation={preview.derivation}
                canvas={preview.defaultCanvas}
                character={character}
                overrides={overrides}
                onChangeAxes={(axes) => patchCharacter({ axes })}
                onChangeDerivation={(derivation: Derivation) => patch({ derivation })}
              />
            )}
          </section>

          <section>
            <h2>How a part is built</h2>
            {preview && (
              <HandChat
                language={preview}
                library={library}
                status={status}
                onApply={patchConstruction}
              />
            )}
            <p className="muted small-text">
              Shared by every primitive that declares a trait, which is what makes a set feel like the work of one hand.
            </p>
            {preview && (
              <ConstructionPanel
                construction={preview.construction}
                authored={draft.construction}
                character={character}
                derivation={preview.derivation}
                registry={library.registry()}
                onChange={patchConstruction}
                onClear={clearConstruction}
                onFocus={setFocusTrait}
              />
            )}
          </section>

            </>
          )}

          {rail === "rules" && (
            <>
          <section>
            <h2>Construction</h2>
            <Field label="Line angles" hint={<Lands kind="checked">Checked on every icon. Geometry off these angles is flagged.</Lands>}>
              <div className="angle-sets">
                {ANGLE_SETS.map((set) => {
                  const on = JSON.stringify(grammar.angles) === JSON.stringify(set.angles);
                  return (
                    <button key={set.label} className={on ? "on" : ""} onClick={() => patchGrammar({ angles: set.angles })}>
                      <strong>{set.label}</strong>
                      <span className="muted small-text">{set.note}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Badge corner" hint={<Lands>Every generated layout puts the badge here.</Lands>}>
              <Choice
                options={CORNERS}
                value={grammar.badge.corner}
                onChange={(corner) => patchGrammar({ badge: { ...grammar.badge, corner } })}
              />
            </Field>
            <Field label="Badge size" hint={<Lands>Share of the content box. Generated layouts use it immediately.</Lands>}>
              <div className="row-inline">
                <input
                  type="range"
                  min={0.15}
                  max={0.6}
                  step={0.05}
                  value={grammar.badge.ratio}
                  onChange={(e) => patchGrammar({ badge: { ...grammar.badge, ratio: Number(e.target.value) } })}
                />
                <span className="muted">{Math.round(grammar.badge.ratio * 100)}%</span>
              </div>
            </Field>

            <Field label="Diagonals" hint={<Lands kind="guidance">Told to the agent and shown in review. Not machine-checked: no rule can tell which diagonal is the one that matters.</Lands>}>
              <Choice options={DIAGONALS} value={grammar.diagonal} onChange={(diagonal) => patchGrammar({ diagonal })} />
            </Field>
            <Field label="Shape and silhouette" hint={<Lands kind="guidance">Both go to the agent. Neither blocks.</Lands>}>
              <div className="toggles">
                <Toggle
                  label="Prefer closed shapes over open ones"
                  value={grammar.closedShapes}
                  onChange={(closedShapes) => patchGrammar({ closedShapes })}
                />
                <Toggle
                  label="Every icon must read as a filled silhouette"
                  value={grammar.silhouette}
                  onChange={(silhouette) => patchGrammar({ silhouette })}
                />
              </div>
            </Field>
          </section>

          <section>
            <h2>Styles</h2>
            <p className="muted small-text">
              Outline icons are built from strokes. Filled icons are the same drawing read as solid, with the interior
              detail knocked out of the fill — which is why a closed shape is worth more than a clever one.
            </p>
            <Field label="Styles this language allows" hint={<Lands kind="checked">An icon in a style the language does not allow is refused.</Lands>}>
              <div className="toggles">
                {STYLES.map((st) => {
                  const allowed = draft.style.allowed ?? [draft.style.default];
                  return (
                    <Toggle
                      key={st}
                      label={st}
                      value={allowed.includes(st)}
                      onChange={(on) => {
                        const next = on ? [...allowed, st] : allowed.filter((x) => x !== st);
                        // The default style must remain allowed, or the language
                        // refuses every icon it draws by default.
                        if (!next.includes(draft.style.default)) return;
                        patch({ style: { ...draft.style, allowed: next } });
                      }}
                    />
                  );
                })}
              </div>
            </Field>
            <Field label="Default style" hint={<Lands>What an icon is drawn in when it does not say.</Lands>}>
              <Choice
                options={draft.style.allowed ?? [draft.style.default]}
                value={draft.style.default}
                onChange={(def) => patch({ style: { ...draft.style, default: def } })}
              />
            </Field>
            <Field
              label="Concepts that need a filled version"
              hint={
                <Lands kind="guidance">
                  Listed in the Library beside the concepts with no icon at all. Nothing is refused for missing one —
                  which icons your product needs filled is a fact about your product, and no measurement of a drawing
                  produces it.
                </Lands>
              }
            >
              <WordList
                value={draft.style.filled?.requiredFor ?? []}
                placeholder="navigation, state, toolbar"
                onChange={(requiredFor) =>
                  patch({ style: { ...draft.style, filled: { requiredFor } } })
                }
              />
            </Field>
          </section>

          <section>
            <h2>Sizes</h2>
            <p className="muted small-text">
              Like optical sizes in a typeface: each size gets its own weight and its own detail budget. Adding or removing a
              size is not editable here yet.
            </p>
            {preview?.sizes[draft.canvas] && (
              <SizeControls title={`${draft.canvas}px · primary`} tokens={preview.sizes[draft.canvas]!} onChange={patchPrimary} />
            )}
            {(draft.sizes ?? []).map((size, i) =>
              preview?.sizes[size.canvas] ? (
                <SizeControls
                  key={size.canvas}
                  title={`${size.canvas}px`}
                  tokens={preview.sizes[size.canvas]!}
                  onChange={(next) => patchSize(i, next)}
                />
              ) : null,
            )}
          </section>

          <section>
            <h2>Optical corrections</h2>
            <p className="muted small-text">
              The last pass, and the only one allowed to be wrong on purpose. Everything above draws what you said;
              these draw what you meant, because the eye is predictably wrong about a few things. Every one starts at
              zero, because a correction changes icons you have already published.
            </p>
            <div className="size-fields">
              <Field label="Junction notch" hint={<Lands>Trims a stroke end out of an acute crook so ink stops piling up there. In units at {draft.canvas}px; other sizes scale.</Lands>}>
                <NumberField
                  value={optics.junctionNotch}
                  step={0.1}
                  min={0}
                  onChange={(junctionNotch) => patchOptics({ junctionNotch })}
                />
              </Field>
              <Field label="Counts as acute below" hint={<Lands>Degrees. A right angle piles up nothing, so only shallow meetings are trimmed.</Lands>}>
                <NumberField
                  value={optics.junctionAngle}
                  step={5}
                  min={0}
                  max={90}
                  onChange={(junctionAngle) => patchOptics({ junctionAngle })}
                />
              </Field>
              <Field label="Interior thinning" hint={<Lands>Fraction. Detail drawn inside a contour of the same part gets lighter, so the contour stays the heavier line.</Lands>}>
                <NumberField
                  value={optics.interiorThin}
                  step={0.05}
                  min={0}
                  max={0.9}
                  onChange={(interiorThin) => patchOptics({ interiorThin })}
                />
              </Field>
              <Field label="Dot size" hint={<Lands>Multiple of stroke width. Makes every dot in the set the same dot instead of whatever its box produced.</Lands>}>
                <NumberField value={optics.dotRatio} step={0.1} min={0} onChange={(dotRatio) => patchOptics({ dotRatio })} />
              </Field>
            </div>
            <Lands kind="guidance">
              Applied when an icon is rendered, never when it is checked. The validator judges the geometry the
              compiler laid out, so a notch cannot read as a gap failure and two icons are compared as drawn rather
              than as retouched.
            </Lands>
          </section>
            </>
          )}

        </div>
      </div>

      <footer className={`editor-bar ${dirty ? "dirty" : ""}`}>
        {!dirty ? (
          <span className="muted">Saved. v{current.version}.</span>
        ) : !reviewing ? (
          <>
            <span>Unsaved changes.</span>
            <button className="ghost" onClick={() => setDraft(serializeIconLanguage(current))}>
              Discard
            </button>
            <button className="primary" disabled={!preview} onClick={() => setReviewing(true)}>
              Review and save
            </button>
          </>
        ) : (
          <>
            <span>Version</span>
            <input className="version-input" value={draft.version} onChange={(e) => patch({ version: e.target.value })} />
            <input
              className="note-input"
              placeholder="What changed, and why"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="ghost" onClick={() => setReviewing(false)}>
              Back
            </button>
            <button className="primary" disabled={busy || !preview} onClick={() => void save()}>
              {versionTaken ? `Overwrite v${draft.version}` : `Save v${draft.version}`}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

/** Tokens for one optical size, with its keyline boxes drawn from the current values. */
function SizeControls({
  title,
  tokens,
  onChange,
}: {
  title: string;
  /** Fully resolved tokens for this size, so inherited values show as real numbers. */
  tokens: SizeTokens;
  onChange: (next: Partial<SizeInput>) => void;
}) {
  const { stroke, limits, optical: keylines } = tokens;
  const size = tokens;
  const s = 120 / tokens.canvas;
  return (
    <div className="size-controls">
      <h3>{title}</h3>
      <div className="size-body">
        <svg width={120} height={120} viewBox="0 0 120 120" className="keylines">
          <rect x={0} y={0} width={120} height={120} className="canvas" />
          <rect
            x={size.safeArea * s}
            y={size.safeArea * s}
            width={(size.canvas - 2 * size.safeArea) * s}
            height={(size.canvas - 2 * size.safeArea) * s}
            className="safe"
          />
          {OPTICAL_SHAPES.map((shape) => {
              const b = keylines[shape];
              return (
                <rect
                  key={shape}
                  className={`keyline ${shape}`}
                  x={b.x * s}
                  y={b.y * s}
                  width={b.width * s}
                  height={b.height * s}
                  rx={shape === "circle" ? (b.width * s) / 2 : 0}
                />
              );
          })}
        </svg>
        <div className="size-fields">
          <Field label="Stroke width">
            <NumberField value={stroke.width} step={0.25} onChange={(width) => onChange({ stroke: { ...stroke, width } })} />
          </Field>
          <Field label="Caps">
            <Choice options={CAPS} value={stroke.cap} onChange={(cap) => onChange({ stroke: { ...stroke, cap } })} />
          </Field>
          <Field label="Joins">
            <Choice options={JOINS} value={stroke.join} onChange={(join) => onChange({ stroke: { ...stroke, join } })} />
          </Field>
          <Field label="Safe area">
            <NumberField value={size.safeArea} step={0.5} onChange={(safeArea) => onChange({ safeArea })} />
          </Field>
          <Field label="Layout grid">
            <NumberField value={size.grid} step={0.25} min={0.05} onChange={(grid) => onChange({ grid })} />
          </Field>
          <Field label="Corner radius">
            <NumberField value={size.cornerRadius} step={0.25} onChange={(cornerRadius) => onChange({ cornerRadius })} />
          </Field>
          <Field label="Smallest gap">
            <NumberField
              value={size.minNegativeSpace}
              step={0.25}
              onChange={(minNegativeSpace) => onChange({ minNegativeSpace })}
            />
          </Field>
          <Field label="Smallest knock-out">
            <NumberField value={size.minCutout} step={0.25} min={0} onChange={(minCutout) => onChange({ minCutout })} />
          </Field>
          <Field label="Parts budget">
            <NumberField
              value={limits.maxElements}
              step={1}
              min={1}
              onChange={(maxElements) => onChange({ limits: { ...limits, maxElements } })}
            />
          </Field>
        </div>
      </div>
      <Lands kind="checked">
        Stroke, safe area, grid and gap are all checked on every icon at this size. The coloured boxes are the keyline
        shapes a subject is fitted into.
      </Lands>
    </div>
  );
}
