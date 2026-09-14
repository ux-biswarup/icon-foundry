import { useEffect, useMemo, useRef } from "react";
import { hueFor } from "./MethodOverlays.js";

/**
 * The drawing as path data, with the canvas and the text pointing at the same
 * thing.
 *
 * Not decoration. Path data is what is stored, and a construction editor that
 * hides it asks a designer to trust that the handle they dragged wrote the
 * number they wanted. Putting the two side by side, with a selection that
 * crosses between them, is what makes the geometry checkable rather than
 * merely visible — click a segment on the canvas and the numbers that produced
 * it light up; put the cursor in those numbers and the segment lights up.
 *
 * The tokeniser below reads the text rather than the skeleton on purpose. While
 * someone is typing, the text is the only thing that exists — the skeleton is a
 * parse of it that may currently be failing — and a highlighter driven by the
 * last skeleton that parsed would drift a character at a time away from the
 * text it is painting.
 */

/** How many numbers each path command takes before it repeats. */
const ARITY: Record<string, number> = {
  m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0,
};

interface Span {
  text: string;
  kind: "command" | "number" | "gap";
  /** The segment this belongs to, in `sub:index` form. Absent for an `M`. */
  seg?: string;
  sub?: number;
}

const TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)|(\s+|,)/g;

/**
 * Path data split into spans, each knowing which segment it belongs to.
 *
 * Segment numbering has to match the skeleton's exactly or the two selections
 * point at different things, so it follows the same two rules the parser does:
 * an `M` opens a subpath and is not itself a segment, and a repeated argument
 * group is a further segment — `L1 2 3 4` is two lines, and after an `M` a
 * repeat is a line rather than a second move.
 */
export function tokenise(text: string): Span[] {
  const spans: Span[] = [];
  let sub = -1;
  let index = 0;
  let command = "";
  let taken = 0;
  let first = false;

  for (const match of text.matchAll(TOKEN)) {
    const [raw, letter, number, gap] = match;
    if (gap !== undefined) {
      spans.push({ text: raw, kind: "gap" });
      continue;
    }
    if (letter !== undefined) {
      const lower = letter.toLowerCase();
      if (lower === "m") {
        sub += 1;
        index = 0;
        first = true;
      }
      command = lower;
      taken = 0;
      if (lower === "z") {
        spans.push({ text: raw, kind: "command", seg: `${sub}:${index}`, sub });
        index += 1;
        continue;
      }
      spans.push({
        text: raw,
        kind: "command",
        ...(lower === "m" ? {} : { seg: `${sub}:${index}` }),
        ...(sub >= 0 && { sub }),
      });
      continue;
    }
    if (number === undefined) continue;

    const arity = ARITY[command] ?? 2;
    spans.push({
      text: raw,
      kind: "number",
      ...(!(command === "m" && first) && { seg: `${sub}:${index}` }),
      ...(sub >= 0 && { sub }),
    });
    taken += 1;
    if (arity > 0 && taken === arity) {
      taken = 0;
      // The move's own coordinates opened the subpath; a repeat after it is a
      // line, and the first real segment starts here.
      if (command === "m" && first) first = false;
      else index += 1;
    }
  }
  return spans;
}

export function MethodCode({
  value,
  onChange,
  selected,
  onSelect,
  error,
  readOnly,
  asSvg,
  onFormat,
  ignored,
}: {
  value: string;
  onChange: (next: string) => void;
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], additive: boolean) => void;
  error: string | undefined;
  readOnly: boolean;
  /** Show the geometry wrapped in the language's own SVG attributes. */
  asSvg: boolean;
  onFormat: (asSvg: boolean) => void;
  /** Attributes a pasted SVG had that the language owns, and that were dropped. */
  ignored: readonly string[];
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const painted = useRef<HTMLPreElement>(null);
  const spans = useMemo(() => tokenise(value), [value]);

  // The highlighted layer sits under a transparent textarea, so the two have to
  // scroll as one or the colour slides off the characters it belongs to.
  useEffect(() => {
    const el = input.current;
    const pre = painted.current;
    if (!el || !pre) return;
    const sync = () => {
      pre.scrollTop = el.scrollTop;
      pre.scrollLeft = el.scrollLeft;
    };
    el.addEventListener("scroll", sync);
    return () => el.removeEventListener("scroll", sync);
  }, []);

  /** Which segments the caret or its selection currently covers. */
  const fromCaret = () => {
    const el = input.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const hit: string[] = [];
    let at = 0;
    for (const span of spans) {
      const next = at + span.text.length;
      const overlaps = start === end ? start >= at && start <= next : start < next && end > at;
      if (overlaps && span.seg && !hit.includes(span.seg)) hit.push(span.seg);
      at = next;
    }
    if (hit.length > 0) onSelect(hit, false);
  };

  return (
    <div className="mth-code">
      <div className="mth-code-bar">
        {(["path", "svg"] as const).map((mode) => (
          <button
            key={mode}
            className={`chip ${(mode === "svg") === asSvg ? "on" : ""}`}
            onClick={() => onFormat(mode === "svg")}
            title={
              mode === "path"
                ? "Just the geometry, exactly as it is stored"
                : "The same geometry with the language's stroke and caps on it, ready to paste anywhere"
            }
          >
            {mode === "path" ? "Path data" : "SVG"}
          </button>
        ))}
        <span className="muted small-text">Paste an &lt;svg&gt; here and it is read either way.</span>
      </div>
      <div className="mth-code-frame">
        <pre ref={painted} className="mth-code-paint" aria-hidden="true">
          {spans.map((span, i) => (
            <span
              // Position is the identity: these are tokens of one string, and
              // two `2`s in it are genuinely different tokens.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={i}
              className={`mth-tok ${span.kind}${span.seg && selected.has(span.seg) ? " on" : ""}`}
              {...(span.sub !== undefined && span.kind === "command" && { style: { color: hueFor(span.sub) } })}
            >
              {span.text}
            </span>
          ))}
          {"\n"}
        </pre>
        <textarea
          ref={input}
          className="mth-code-input"
          spellCheck={false}
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={fromCaret}
          onClick={fromCaret}
          onKeyUp={fromCaret}
        />
      </div>
      {error ? (
        <p className="error-text small-text">{error}</p>
      ) : ignored.length > 0 ? (
        /*
         * Said out loud rather than silently honoured. Those attributes are the
         * other language's opinion about how thick a line is; this one already
         * has one, and a paste that quietly overrode it would be the failure the
         * whole product is against.
         */
        <p className="muted small-text">
          Geometry taken. <strong>{ignored.join(", ")}</strong>{" "}
          {ignored.length === 1 ? "was" : "were"} left behind — the language decides those.
        </p>
      ) : (
        <p className="muted small-text">
          {readOnly
            ? "Read-only: this part is drawn from code."
            : "Edit it directly, or put the caret in a segment to select it on the canvas."}
        </p>
      )}
    </div>
  );
}
