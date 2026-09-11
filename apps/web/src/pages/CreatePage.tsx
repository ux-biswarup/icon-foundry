import type { AgentResult, Candidate } from "@icon-foundry/icon-agent";
import type { IconStyle } from "@icon-foundry/icon-language";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { useEffect, useState } from "react";
import { PreviewStrip } from "../components/IconSvg.js";
import { ValidationList } from "../components/ValidationList.js";
import { agentStatus, requestCandidates, type AgentStatus } from "../lib/agentClient.js";
import { renderSpec } from "../lib/render.js";
import { navigate } from "../lib/router.js";
import { useLibrary } from "../store/LibraryContext.js";

export function CreatePage() {
  const { library, mutate } = useLibrary();
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState<IconStyle | "">("");
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
          ...(style && { style }),
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
        for (const el of c.newElements) {
          await lib.saveElement({ ...el, keywords: el.keywords ?? [], source: { brief: brief.trim(), ...(result?.model && { model: result.model }) } });
        }
        await lib.save(c.spec, { source: { brief: brief.trim(), ...(result?.model && { model: result.model }) } });
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
          <label>
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value as IconStyle | "")}>
              <option value="">Language default ({library.language.style.default})</option>
              {library.language.style.allowed.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
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
              ? `Model not available: ${status.error}. Arranging existing vocabulary instead.`
              : "No model configured; arranging the existing vocabulary. Set ICON_FOUNDRY_PROVIDER to draft new subjects."}
        </p>
      </div>

      {error && <p className="error-text">{error}</p>}

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
          <div className="candidates">
            {result.candidates.map((c, i) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                letter={String.fromCharCode(65 + i)}
                focused={focus?.id === c.id}
                onFocus={() => setFocus(c)}
                onApprove={() => void approve(c)}
                onChange={(spec) => {
                  const { validation, svg } = renderSpec(spec, library);
                  if (!svg) return;
                  const updated: Candidate = { ...c, spec, svg, validation };
                  setResult({ ...result, candidates: result.candidates.map((x) => (x.id === c.id ? updated : x)) });
                  setFocus(updated);
                }}
              />
            ))}
          </div>
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

function CandidateCard({
  candidate: c,
  letter,
  focused,
  onFocus,
  onApprove,
  onChange,
}: {
  candidate: Candidate;
  letter: string;
  focused: boolean;
  onFocus: () => void;
  onApprove: () => void;
  onChange: (spec: Candidate["spec"]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(c.spec, null, 2));
  const [err, setErr] = useState<string>();
  return (
    <article className={`candidate ${focused ? "focused" : ""}`} onClick={onFocus}>
      <header>
        <span className="letter">{letter}</span>
        <span className="name">{c.spec.name}</span>
        {c.newElements.length > 0 && <span className="pill pill-draft">new: {c.newElements.map((e) => e.name).join(", ")}</span>}
      </header>
      <PreviewStrip svg={c.svg} canvas={c.spec.canvas} />
      <p className="rationale">{c.rationale}</p>
      <ValidationList result={c.validation} compact />
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
