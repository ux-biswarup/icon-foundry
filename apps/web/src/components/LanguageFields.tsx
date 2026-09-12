import type { ReactNode } from "react";

/**
 * Every control in the language editor says where its value lands in the
 * engine. A rule the team writes only gets taken seriously if they can see it
 * working, and a statement nothing consumes should say so rather than imply an
 * enforcement that does not exist.
 */
export function Lands({ children, kind = "used" }: { children: ReactNode; kind?: "used" | "checked" | "guidance" }) {
  const mark = kind === "checked" ? "✓" : kind === "guidance" ? "○" : "→";
  return (
    <p className={`lands lands-${kind}`}>
      <span aria-hidden>{mark}</span> {children}
    </p>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        {children}
      </label>
      {hint}
    </div>
  );
}

/** A 0–100 slider between two named poles. */
export function AxisSlider({
  low,
  high,
  value,
  onChange,
}: {
  low: string;
  high: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="axis-edit">
      <span className="pole">{low}</span>
      <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="pole high">{high}</span>
    </div>
  );
}

/** An editable list of one-line statements. */
export function StringList({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  return (
    <div className="string-list">
      {items.map((item, i) => (
        <div className="string-row" key={i}>
          <textarea
            rows={Math.min(4, Math.ceil((item.length || 1) / 64))}
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button className="ghost" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button className="ghost add" onClick={() => onChange([...items, ""])}>
        + {addLabel}
      </button>
    </div>
  );
}

/** Comma-separated words, for metaphor and vocabulary lists. */
export function WordList({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value.join(", ")}
      placeholder={placeholder}
      onChange={(e) =>
        onChange(
          e.target.value
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

export function NumberField({
  value,
  onChange,
  step = 0.25,
  min = 0,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      {...(max !== undefined && { max })}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="choice">
      {options.map((o) => (
        <button key={o} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
