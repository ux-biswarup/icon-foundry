/**
 * The assistant: a panel for asking for changes in words, and the strip that
 * opens it.
 *
 * Nothing here talks to a model yet. That is the point of the file — the
 * surface is being reserved in the layout now, while the layout is being
 * rearranged anyway, rather than bolted onto the side of a finished page
 * later. What it must not do in the meantime is imply a capability that is not
 * there: every control is visibly disabled, the examples are labelled as
 * examples, and the one thing that does work today is named and pointed at.
 */

/**
 * The mark on the strip. Drawn on the 24 grid this app judges icons against,
 * because an icon tool with an off-grid icon in its own chrome is arguing
 * against itself: a speech bubble for the conversation, a spark for who is on
 * the other end of it.
 */
function AssistantMark() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" className="assistant-mark">
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path
        d="M12 6.5 13.1 9.4 16 10.5 13.1 11.6 12 14.5 10.9 11.6 8 10.5 10.9 9.4z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * The strip down the left edge, and the only way in or out of the panel.
 *
 * It is always present so the assistant has one fixed address on the page. A
 * control that appears only once you already know it exists is a control most
 * people never find.
 */
export function AssistantToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="col assist-rail">
      <button
        className={`assist-open ${open ? "on" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="assistant-panel"
        title={open ? "Close the assistant" : "Open the assistant"}
      >
        <AssistantMark />
        <span className="sr-only">{open ? "Close the assistant" : "Open the assistant"}</span>
      </button>
      <span className="assist-rail-label" aria-hidden="true">
        Assistant
      </span>
    </div>
  );
}

/** Shown as what the conversation will look like, not as a conversation. */
const SAMPLE: Array<{ from: "you" | "it"; text: string }> = [
  { from: "you", text: "these feel too soft next to our type" },
  {
    from: "it",
    text: "Corner rounding is doing most of it. Dropping it from 2 to 0.75 sharpens 41 of 68 parts — want to see it on the canvas before it is saved?",
  },
  { from: "you", text: "why is the arrow failing at 16?" },
  { from: "it", text: "Its head sits 0.4 under the smallest gap at that size. Two ways out; neither changes the 24px drawing." },
];

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="col assistant" id="assistant-panel" role="region" aria-label="Assistant">
      <div className="assistant-head">
        <div>
          <p className="col-head">Assistant</p>
          <span className="soon-badge">Coming soon</span>
        </div>
        <button className="ghost small" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <p className="col-sub">
        A way to change the language by describing what is wrong with it, instead of finding the control that causes
        it. It will propose and never save, say which parts each change moves, and be able to answer that it cannot.
      </p>

      <div className="assistant-sample" aria-label="Example of how it will read">
        <p className="sample-label">What it will read like</p>
        {SAMPLE.map((m, i) => (
          <div key={i} className={`bubble ${m.from}`}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="assistant-composer">
        <textarea rows={2} disabled placeholder="Not yet. This will take the request in words." aria-label="Ask the assistant (not available yet)" />
        <button className="primary" disabled>
          Ask
        </button>
      </div>

      <p className="muted small-text">
        One piece of this is already real: <strong>The hand → How a part is built</strong> takes a request in words and
        proposes trait changes you can apply or discard. The rest of the language follows it here.
      </p>
    </div>
  );
}
