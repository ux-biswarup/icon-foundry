import type { AgentResult, Candidate } from "@icon-foundry/icon-agent";
import type { IconStyle } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { useEffect, useMemo, useState } from "react";
import { IconConstruction } from "../components/IconConstruction.js";
import { PreviewStrip } from "../components/IconSvg.js";
import { ScoreSummary } from "../components/Scores.js";
import { ValidationList } from "../components/ValidationList.js";
import { agentStatus, requestCandidates, type AgentStatus } from "../lib/agentClient.js";
import { fillabilityOf, renderSpec } from "../lib/render.js";
import { navigate } from "../lib/router.js";
import { useLibrary } from "../store/LibraryContext.js";

export function CreatePage() {
  const { library, mutate } = useLibrary();
  const [brief, setBrief] = useState("");
  /**
   * Which styles are being asked for. Both is the common case for an icon that
   * appears in a tab bar, and asking at creation is the only time the answer is
   * cheap: finding out at export that half a set has no filled version is
   * finding out too late.
   */
  const [styles, setStyles] = useState<IconStyle[]>(() => [library?.language.style.default ?? "outline"]);
  const [canvas, setCanvas] = useState<number>(() => library?.language.defaultCanvas ?? 24);
  const [status, setStatus] = useState<AgentStatus>({ model: null, error: null, reachable: false });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentResult>();
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState("");
  const [focus, setFocus] = useState<Candidate>();

  useEffect(() => {
    void agentStatus().then(setStatus);
  }, []);

  if (!library) return null;
  const sizes = Object.keys(library.language.sizes).map(Number).sort((a, b) => a - b);
  const allowed = library.language.style.allowed;
  // The agent draws one icon. When both styles are wanted the drawing is the
  // outline one and the filled version comes off its closed loops, which is the
  // whole economy of the filled style.
  const drawn: IconStyle = styles.includes("outline") ? "outline" : (styles[0] ?? "outline");
  const wantsFilled = styles.includes("filled");

  const run = async (extra: { feedback?: string; previous?: Candidate } = {}) => {
    const text = brief.trim();
    if (!text) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await requestCandidates(
        {
          text,
          canvas,
          style: drawn,
          ...(extra.feedback && { feedback: extra.feedback }),
          ...(extra.previous && { previous: extra.previous.spec }),
        },
        library,
        status,
      );
      setResult(res);
      setFocus(undefined);
      setFeedback("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async (c: Candidate) => {
    try {
      await mutate(async (lib) => {
        const source = { brief: brief.trim(), ...(result?.model && { model: result.model }) };
        for (const el of c.newElements) {
          await lib.saveElement({ ...el, keywords: el.keywords ?? [], source });
        }
        // A new concept is the durable half of the work: once it is recorded,
        // the next person asking for this needs no model at all.
        if (c.newConcept) await lib.saveConcept({ ...c.newConcept, source });
        await lib.save(c.spec, { source, ...(c.concept && { concept: c.concept }) });
        // Derived, so nothing is drawn twice. An icon whose closed loops cannot
        // carry a fill was already flagged on the candidate, and is saved
        // without one rather than with a broken one.
        if (wantsFilled && drawn !== "filled" && fillabilityOf(c.spec, lib).ok) {
          await lib.setVariant(c.spec.name, "filled");
        }
      });
      navigate(`library/${encodeURIComponent(c.spec.name)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page create">
      <div className="brief">
        <label className="brief-label">
          What icon do you need?
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && void run()}
            placeholder="temperature controlled warehouse"
            autoFocus
          />
        </label>
        <div className="brief-options">
          <div className="style-picks">
            <span className="muted small-text">Styles</span>
            {allowed.map((s) => (
              <label key={s} className={styles.includes(s) ? "on" : ""}>
                <input
                  type="checkbox"
                  checked={styles.includes(s)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...styles, s] : styles.filter((x) => x !== s);
                    // An icon in no style at all is not a request.
                    if (next.length > 0) setStyles(next);
                  }}
                />
                {s}
              </label>
            ))}
          </div>
          <label>
            Size
            <select value={canvas} onChange={(e) => setCanvas(Number(e.target.value))}>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy || !brief.trim()} onClick={() => void run()}>
            {busy ? "Drafting…" : "Generate"}
          </button>
        </div>
        <p className="muted small-text">
          {status.model
            ? `Drafting with ${status.model}. New subjects become draft elements you approve.`
            : status.error
              ? `Model not available: ${status.error} Arranging the existing vocabulary instead.`
              : "No model configured, so this arranges the existing vocabulary only. Add a key to apps/web/.env and restart to draft subjects your vocabulary lacks."}
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

      {result?.existing && (
        <div className="already">
          <div>
            <strong>{result.existing.concept.name}</strong> is already answered by{" "}
            <a href={`#/library/${encodeURIComponent(result.existing.icon.spec.name)}`}>{result.existing.icon.spec.name}</a>.
            <p className="muted small-text">
              Nothing was drafted, and no model was called. Use the icon you have, unless this brief means something
              different.
            </p>
          </div>
          <button className="ghost" disabled={busy} onClick={() => void run({ feedback: "draft a new option anyway" })}>
            Draft anyway
          </button>
        </div>
      )}

      {result && (
        <>
          {result.notes.length > 0 && (
            <ul className="notes">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          {result.candidates.length === 0 && !error && <p className="muted">No candidate survived validation. Try different words.</p>}
          <p className="muted small-text">Best first, by how well each holds the language's preferences.</p>
          <div className="candidates">
            {result.candidates.map((c, i) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                letter={String.fromCharCode(65 + i)}
                focused={focus?.id === c.id}
                wantsFilled={wantsFilled && drawn !== "filled"}
                onFocus={() => setFocus(c)}
                onApprove={() => void approve(c)}
                onChange={(spec) => {
                  const { validation, svg } = renderSpec(spec, library);
                  if (!svg) return;
                  const updated: Candidate = { ...c, spec, svg, validation, scores: validation.scores, overall: validation.overall };
                  setResult({ ...result, candidates: result.candidates.map((x) => (x.id === c.id ? updated : x)) });
                  setFocus(updated);
                }}
              />
            ))}
          </div>
          {/*
            * The moment a draft most wants a real canvas.
            *
            * Until now the only two things you could do with a candidate were
            * accept it or ask the model again, which makes its third attempt
            * the unit of work when the real unit is usually "that, but the bar
            * is one step short". This is the same editor the Method tab uses,
            * against the same rules, before anything enters the library.
            */}
          {focus && (
            <section className="candidate-edit">
              <div className="candidate-edit-head">
                <h2>{focus.spec.name}</h2>
                <span className="spacer" />
                <button
                  type="button"
                  className="primary"
                  onClick={() => void approve(focus)}
                >
                  Add to library
                </button>
              </div>
              <IconConstruction
                spec={focus.spec}
                library={library}
                onChange={(spec) => {
                  const { validation, svg } = renderSpec(spec, library);
                  if (!svg) return;
                  const updated: Candidate = {
                    ...focus,
                    spec,
                    svg,
                    validation,
                    scores: validation.scores,
                    overall: validation.overall,
                  };
                  setResult((was) =>
                    was ? { ...was, candidates: was.candidates.map((x) => (x.id === focus.id ? updated : x)) } : was,
                  );
                  setFocus(updated);
                }}
              />
              <ValidationList result={focus.validation} />
            </section>
          )}

          <div className="refine">
            <input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && feedback.trim() && !busy && void run({ feedback, ...(focus && { previous: focus }) })}
              placeholder={focus ? `Adjust ${focus.spec.name}: e.g. "smaller badge", "make it filled"` : "Ask for changes, or select a candidate first"}
            />
            <button disabled={busy || !feedback.trim()} onClick={() => void run({ feedback, ...(focus && { previous: focus }) })}>
              Refine
            </button>
            <button className="ghost" disabled={busy} onClick={() => void run()}>
              Show me more
            </button>
          </div>
          {result.steps.length > 0 && (
            <details className="transcript">
              <summary>How it was made ({result.steps.length} steps)</summary>
              <ol>
                {result.steps.map((s, i) => (
                  <li key={i}>
                    <code>{s.tool}</code> <span className="muted">{JSON.stringify(s.input).slice(0, 160)}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Whether this candidate can carry the filled version the brief asked for.
 *
 * Said here, on the candidate, because this is the last moment the answer is
 * cheap: another candidate may fill perfectly, and choosing between them is the
 * whole point of showing more than one.
 */
function FilledNote({ spec }: { spec: Candidate["spec"] }) {
  const { library } = useLibrary();
  const result = useMemo(() => (library ? fillabilityOf(spec, library) : undefined), [spec, library]);
  if (!result) return null;
  if (result.ok && result.reasons.length === 0) {
    return <p className="filled-note ok">Fills cleanly — its closed loops carry the solid version.</p>;
  }
  return (
    <div className={`filled-note ${result.ok ? "warn" : "no"}`}>
      <strong>{result.ok ? "Fills, with a loss" : "No filled version"}</strong>
      <ul>
        {result.reasons.map((r, i) => (
          <li key={`${r.code}-${i}`}>{r.message}</li>
        ))}
      </ul>
    </div>
  );
}

function CandidateCard({
  candidate: c,
  letter,
  focused,
  wantsFilled,
  onFocus,
  onApprove,
  onChange,
}: {
  candidate: Candidate;
  letter: string;
  focused: boolean;
  /** The brief asked for a filled version too, so this candidate owes one. */
  wantsFilled: boolean;
  onFocus: () => void;
  onApprove: () => void;
  onChange: (spec: Candidate["spec"]) => void;
}) {
  const { library } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(c.spec, null, 2));
  const [err, setErr] = useState<string>();
  return (
    <article className={`candidate ${focused ? "focused" : ""}`} onClick={onFocus}>
      <header>
        <span className="letter">{letter}</span>
        <span className="name">{c.spec.name}</span>
        {c.overall !== undefined && <span className="muted small-text">{c.overall.toFixed(2)}</span>}
        {c.newElements.length > 0 && <span className="pill pill-draft">new: {c.newElements.map((e) => e.name).join(", ")}</span>}
      </header>
      {/* The agent's own drawing, not a local re-render: a candidate may name an
          element the library does not have yet, and re-rendering it here would
          show a hole where the agent drew a shape. The ground still follows the
          theme; only the grade does not. */}
      <PreviewStrip render={() => c.svg} canvas={c.spec.canvas} />
      <p className="rationale">{c.rationale}</p>
      {wantsFilled && library && <FilledNote spec={c.spec} />}
      <ValidationList result={c.validation} compact />
      <ScoreSummary overall={c.overall} scores={c.scores} />
      <div className="actions">
        <button className="primary" onClick={(e) => { e.stopPropagation(); onApprove(); }}>
          Approve
        </button>
        <button className="ghost" onClick={(e) => { e.stopPropagation(); setEditing((v) => !v); }}>
          {editing ? "Hide definition" : "Edit definition"}
        </button>
      </div>
      {editing && (
        <div className="editor" onClick={(e) => e.stopPropagation()}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} spellCheck={false} />
          <button
            onClick={() => {
              try {
                onChange(parseIconSpec(JSON.parse(text)));
                setErr(undefined);
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Apply
          </button>
          {err && <p className="error-text">{err}</p>}
        </div>
      )}
    </article>
  );
}
