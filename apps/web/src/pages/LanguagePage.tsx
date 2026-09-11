import type { IconCharacter, SizeTokens } from "@icon-foundry/icon-language";
import { useLibrary } from "../store/LibraryContext.js";

/** Read-only view of the language until the setup board lands. */
export function LanguagePage() {
  const { library } = useLibrary();
  if (!library) return null;
  const lang = library.language;
  const sizes = Object.values(lang.sizes).sort((a, b) => a.canvas - b.canvas);
  return (
    <div className="page language">
      <header className="page-header">
        <h1>
          {lang.name} <span className="muted">v{lang.version}</span>
        </h1>
        {lang.description && <p className="lede">{lang.description}</p>}
      </header>

      {(lang.character.purpose || lang.character.principles.length > 0) && (
        <section className="two-col">
          <div>
            <h2>Character</h2>
            {lang.character.purpose && <p className="purpose">{lang.character.purpose}</p>}
            <Axes character={lang.character} />
          </div>
          <div>
            <h2>Principles</h2>
            <ul className="principles">
              {lang.character.principles.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {(lang.character.metaphors.use.length > 0 || lang.character.metaphors.avoid.length > 0) && (
              <dl className="meta metaphors">
                <dt>Uses</dt>
                <dd>{lang.character.metaphors.use.join(", ") || "no preference"}</dd>
                <dt>Refuses</dt>
                <dd>{lang.character.metaphors.avoid.join(", ") || "nothing"}</dd>
              </dl>
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Construction</h2>
        <dl className="meta">
          <dt>Line angles</dt>
          <dd>
            {lang.grammar.angles.length > 0
              ? `${lang.grammar.angles.map((a) => `${a}°`).join(", ")} (±${lang.grammar.angleTolerance}°), unless the concept demands otherwise`
              : "any angle"}
          </dd>
          <dt>Shapes</dt>
          <dd>{lang.grammar.closedShapes ? "closed over open" : "open shapes allowed"}</dd>
          <dt>Diagonals</dt>
          <dd>{lang.grammar.diagonal === "none" ? "either direction" : `run ${lang.grammar.diagonal.replace("-", " ")}`}</dd>
          <dt>Badge</dt>
          <dd>
            {lang.grammar.badge.corner.replace("-", " ")}, {Math.round(lang.grammar.badge.ratio * 100)}% of the content box
          </dd>
          <dt>Silhouette</dt>
          <dd>{lang.grammar.silhouette ? "every icon must read as a filled silhouette" : "not required"}</dd>
        </dl>
      </section>

      <section>
        <h2>Optical sizes</h2>
        <div className="sizes">
          {sizes.map((t) => (
            <SizeCard key={t.canvas} tokens={t} isDefault={t.canvas === lang.defaultCanvas} />
          ))}
        </div>
      </section>

      <section className="two-col">
        <div>
          <h2>Styles and colour</h2>
          <dl className="meta">
            <dt>Default style</dt>
            <dd>{lang.style.default}</dd>
            <dt>Allowed styles</dt>
            <dd>{lang.style.allowed.join(", ")}</dd>
            <dt>Colours</dt>
            <dd>{lang.colors.allowed.join(", ")}</dd>
            <dt>Detail</dt>
            <dd>{lang.detail}</dd>
          </dl>
        </div>
        <details>
          <summary>Language file</summary>
          <pre>{JSON.stringify(lang, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}

const AXES: Array<[keyof IconCharacter["axes"], string, string]> = [
  ["geometric", "organic", "geometric"],
  ["minimal", "expressive", "minimal"],
  ["technical", "friendly", "technical"],
  ["literal", "abstract", "literal"],
];

function Axes({ character }: { character: IconCharacter }) {
  return (
    <div className="axes">
      {AXES.map(([key, low, high]) => (
        <div key={key} className="axis">
          <span className="pole">{low}</span>
          <span className="track">
            <span className="dot" style={{ left: `${character.axes[key]}%` }} />
          </span>
          <span className="pole high">{high}</span>
        </div>
      ))}
    </div>
  );
}

function SizeCard({ tokens: t, isDefault }: { tokens: SizeTokens; isDefault: boolean }) {
  const s = 160 / t.canvas;
  const box = (b: { x: number; y: number; width: number; height: number }, cls: string) => (
    <rect key={cls} className={`keyline ${cls}`} x={b.x * s} y={b.y * s} width={b.width * s} height={b.height * s} rx={cls === "circle" ? (b.width * s) / 2 : 0} />
  );
  return (
    <div className="size-card">
      <svg width={160} height={160} viewBox="0 0 160 160" className="keylines">
        <rect x={0} y={0} width={160} height={160} className="canvas" />
        <rect x={t.safeArea * s} y={t.safeArea * s} width={(t.canvas - 2 * t.safeArea) * s} height={(t.canvas - 2 * t.safeArea) * s} className="safe" />
        {box(t.optical.horizontal, "horizontal")}
        {box(t.optical.vertical, "vertical")}
        {box(t.optical.square, "square")}
        {box(t.optical.circle, "circle")}
      </svg>
      <h3>
        {t.canvas}px {isDefault && <span className="pill pill-published">default</span>}
      </h3>
      <dl className="meta">
        <dt>Stroke</dt>
        <dd>
          {t.stroke.width} · {t.stroke.cap} caps · {t.stroke.join} joins
        </dd>
        <dt>Safe area</dt>
        <dd>{t.safeArea}</dd>
        <dt>Grid</dt>
        <dd>{t.grid}</dd>
        <dt>Corner radius</dt>
        <dd>{t.cornerRadius}</dd>
        <dt>Min. gap</dt>
        <dd>{t.minNegativeSpace}</dd>
        <dt>Budget</dt>
        <dd>
          {t.limits.maxElements} elements · {t.limits.maxShapes} shapes
        </dd>
      </dl>
    </div>
  );
}
