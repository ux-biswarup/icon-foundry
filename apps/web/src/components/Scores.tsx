import type { Score } from "@icon-foundry/icon-validator";

/**
 * Soft preferences, shown as a gradient rather than a verdict. Nothing here
 * can stop an icon being approved; it is here so a designer picks rather than
 * compares, and so a low number carries its reason with it.
 */
export function ScoreSummary({ overall, scores }: { overall: number | undefined; scores: Score[] }) {
  if (overall === undefined || scores.length === 0) return null;
  return (
    <details className="scores">
      <summary>
        <span className={`score-pill ${band(overall)}`}>{overall.toFixed(2)}</span>
        <span className="muted small-text">{describe(scores)}</span>
      </summary>
      <ul>
        {[...scores]
          .sort((a, b) => a.value - b.value)
          .map((s) => (
            <li key={s.rule}>
              <span className="score-label">{s.label}</span>
              <span className="score-track">
                <span className={`score-fill ${band(s.value)}`} style={{ width: `${Math.round(s.value * 100)}%` }} />
              </span>
              <span className="score-value">{s.value.toFixed(2)}</span>
              <span className="muted small-text score-note">{s.note}</span>
            </li>
          ))}
      </ul>
    </details>
  );
}

const band = (v: number): string => (v >= 0.75 ? "good" : v >= 0.5 ? "fair" : "weak");

/** Name the weakest preference, since that is the one worth acting on. */
function describe(scores: Score[]): string {
  const weakest = [...scores].sort((a, b) => a.value - b.value)[0];
  if (!weakest) return "";
  return weakest.value >= 0.75 ? "holds every preference" : `weakest: ${weakest.label.toLowerCase()}`;
}
