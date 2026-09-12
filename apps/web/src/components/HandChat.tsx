import type { Construction, IconLanguage } from "@icon-foundry/icon-language";
import type { Library } from "@icon-foundry/icon-library";
import type { HandResult } from "@icon-foundry/icon-agent";
import { useState } from "react";
import { requestHandChange, type AgentStatus } from "../lib/agentClient.js";

/**
 * Asking for a change to the hand, in words.
 *
 * The last thing built in this phase, and cheap because of it: the traits were
 * already named, typed and bounded, so this is a thin loop over values that
 * exist rather than a second way of describing the same thing.
 *
 * Three properties keep it honest. It proposes and never saves, so every change
 * lands on the canvas as an unsaved edit a person can discard. It says which
 * parts each change will move, because a trait moves every part that declares
 * it and being surprised by that is the whole failure mode. And it can decline:
 * a request no trait expresses comes back as a sentence rather than as some
 * unrelated value nudged to look responsive.
 */
export function HandChat({
  language,
  library,
  status,
  onApply,
}: {
  language: IconLanguage;
  library: Library;
  status: AgentStatus;
  onApply: (construction: Partial<Construction>) => void;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HandResult>();
  const [error, setError] = useState<string>();

  const ask = async () => {
    if (!request.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await requestHandChange(request.trim(), language, library, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hand-chat">
      <label className="field-label" htmlFor="hand-request">
        Ask for a change
      </label>
      <textarea
        id="hand-request"
        rows={2}
        value={request}
        disabled={busy}
        placeholder={
          status.model ? "make it feel more industrial" : "No model configured. Set one in apps/web/.env to get suggestions."
        }
        onChange={(e) => setRequest(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void ask()}
      />
      <div className="actions">
        <button className="primary" disabled={busy || !request.trim()} onClick={() => void ask()}>
          {busy ? "Thinking…" : "Propose"}
        </button>
        {result && result.changes.length > 0 && (
          <button
            className="ghost"
            onClick={() => {
              onApply(Object.fromEntries(result.changes.map((c) => [c.trait, c.to])));
              setResult(undefined);
            }}
          >
            Apply {result.changes.length}
          </button>
        )}
      </div>

      {error && <p className="error-text small-text">{error}</p>}

      {result && (
        <div className="hand-answer">
          <p className="small-text">{result.message}</p>
          {result.changes.length === 0 ? (
            <p className="muted small-text">Nothing to apply.</p>
          ) : (
            <ul className="hand-changes">
              {result.changes.map((c) => (
                <li key={c.trait}>
                  <b>{c.trait}</b> {String(c.from)} → {String(c.to)}
                  <span className="muted">
                    {c.moves.length > 0 ? ` · moves ${c.moves.join(", ")}` : " · applied when an icon is drawn"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.rejected.length > 0 && (
            <p className="warn-text small-text">Refused: {result.rejected.join("; ")}</p>
          )}
          <p className="muted small-text">
            Nothing is saved. Applying leaves it as an unsaved change you can discard, or review and version.
          </p>
        </div>
      )}
    </div>
  );
}
