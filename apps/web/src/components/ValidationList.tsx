import { builtInRules, type ValidationResult } from "@icon-foundry/icon-validator";

/** Checklist in the language's words: one row per rule. */
export function ValidationList({ result, compact = false }: { result: ValidationResult; compact?: boolean }) {
  const composeIssues = result.issues.filter((i) => i.rule === "compose");
  return (
    <ul className={`checks ${compact ? "compact" : ""}`}>
      {composeIssues.map((i, n) => (
        <li key={`c${n}`} className="error">
          ✕ {i.message}
        </li>
      ))}
      {builtInRules.map((rule) => {
        const issues = result.issues.filter((i) => i.rule === rule.id);
        if (issues.length === 0) {
          return compact ? null : (
            <li key={rule.id} className="ok">
              ✓ {rule.label}
            </li>
          );
        }
        const severity = issues.some((i) => i.severity === "error") ? "error" : "warning";
        return (
          <li key={rule.id} className={severity}>
            {severity === "error" ? "✕" : "⚠"} {rule.label}
            {!compact && <span className="muted"> — {issues.map((i) => i.message).join(" ")}</span>}
          </li>
        );
      })}
      {compact && result.issues.length === 0 && <li className="ok">✓ Follows the language</li>}
    </ul>
  );
}
