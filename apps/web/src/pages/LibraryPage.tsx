import { auditLibrary, proposeRules } from "@icon-foundry/icon-audit";
import { exportArchive, exportLibrary, figmaPayload } from "@icon-foundry/icon-export";
import { VARIANT_KINDS, type IconRecord, type IconStatus, type VariantKind } from "@icon-foundry/icon-library";
import { useMemo, useState, type CSSProperties } from "react";
import { IconSvg } from "../components/IconSvg.js";
import { IconDrawer } from "../components/IconDrawer.js";
import { Swatch } from "../components/Swatch.js";
import { downloadBytes, downloadText, renderSpec } from "../lib/render.js";
import { navigate } from "../lib/router.js";
import { useLibrary } from "../store/LibraryContext.js";

const ALL: IconStatus[] = ["draft", "review", "published", "deprecated"];

export function LibraryPage({ selected }: { selected?: string | undefined }) {
  const { library, version } = useLibrary();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"icons" | "gaps" | "audit">("icons");
  /**
   * Which style the grid is showing. Not a filter: an icon with no filled
   * version stays in the grid, dimmed, because a set that quietly loses a third
   * of its cells teaches you nothing about your coverage.
   */
  const [style, setStyle] = useState<"outline" | VariantKind>("outline");
  const [statuses, setStatuses] = useState<IconStatus[]>(["draft", "review", "published"]);

  const hits = useMemo(() => {
    if (!library) return [];
    return library.search(query, { status: statuses });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, query, statuses, version]);

  if (!library) return null;
  const current = selected ? library.get(selected) : undefined;

  return (
    <div className="page library">
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search by name, concept, or what it shows…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="filters">
          {ALL.map((s) => (
            <label key={s} className={statuses.includes(s) ? "on" : ""}>
              <input
                type="checkbox"
                checked={statuses.includes(s)}
                onChange={(e) => setStatuses(e.target.checked ? [...statuses, s] : statuses.filter((x) => x !== s))}
              />
              {s}
            </label>
          ))}
        </div>
        <div className="filters">
          <label className={view === "icons" ? "on" : ""}>
            <input type="radio" checked={view === "icons"} onChange={() => setView("icons")} />
            icons
          </label>
          <label className={view === "gaps" ? "on" : ""}>
            <input type="radio" checked={view === "gaps"} onChange={() => setView("gaps")} />
            gaps
          </label>
          <label className={view === "audit" ? "on" : ""}>
            <input type="radio" checked={view === "audit"} onChange={() => setView("audit")} />
            audit
          </label>
        </div>
        {view === "icons" && (
          <div className="filters">
            {(["outline", ...VARIANT_KINDS] as const)
              .filter((s) => s !== "filled" || library.language.style.allowed.includes("filled"))
              .map((s) => (
              <label key={s} className={style === s ? "on" : ""}>
                <input type="radio" checked={style === s} onChange={() => setStyle(s)} />
                {s}
              </label>
            ))}
          </div>
        )}
        <ExportButton />
        <FigmaButton />
        <button className="primary" onClick={() => navigate("create")}>
          New icon
        </button>
      </div>

      {view === "gaps" && <Gaps />}
      {view === "audit" && <Audit />}

      {view === "icons" && (
        <>
      <div className={`split ${current ? "with-drawer" : ""}`}>
        {/* The track follows the largest icon in the set, so a 16px icon and a
            24px one sit in cells of the same size and can be compared. */}
        <div
          className="tile-grid"
          style={{ "--tile-size": `${Math.max(24, ...hits.map((h) => h.record.spec.canvas))}px` } as CSSProperties}
        >
          {hits.length === 0 && (
            <p className="muted empty">
              {library.icons().length === 0 ? "No icons yet. Create the first one." : "Nothing matches."}
            </p>
          )}
          {hits.map(({ record }) => (
            <IconCard key={record.spec.name} record={record} style={style} active={record.spec.name === selected} />
          ))}
        </div>
      </div>
      {/* The set stays on screen above it: an icon judged alone is an icon
          judged against nothing. */}
      {current && <IconDrawer record={current} key={current.spec.name} />}
        </>
      )}
    </div>
  );
}

/**
 * The set, as one payload to paste into the Figma plugin. The plugin has no
 * filesystem and no network, so this is how a library crosses over.
 */
function FigmaButton() {
  const { library, mutate, version } = useLibrary();
  const [copied, setCopied] = useState(false);
  const count = useMemo(
    () => (library ? library.iconsInLanguage(library.manifest.language).filter((i) => i.status === "published").length : 0),
    [library, version],
  );
  if (!library) return null;

  const copy = async () => {
    await mutate((lib) => lib.assignCodepoints());
    const text = JSON.stringify(figmaPayload(library));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; a download always works.
      downloadText(`${library.manifest.id}-figma.json`, text, "application/json");
    }
  };

  return (
    <button disabled={count === 0} title="Paste this into the Figma plugin" onClick={() => void copy()}>
      {copied ? "Copied" : "Copy for Figma"}
    </button>
  );
}

/**
 * Ship the set. Codepoints are assigned first and kept forever, so the next
 * release replaces this one rather than colliding with it.
 */
function ExportButton() {
  const { library, mutate, version } = useLibrary();
  const [busy, setBusy] = useState(false);
  const count = useMemo(
    () => (library ? library.iconsInLanguage(library.manifest.language).filter((i) => i.status === "published").length : 0),
    [library, version],
  );
  if (!library) return null;

  const run = async () => {
    setBusy(true);
    try {
      await mutate((lib) => lib.assignCodepoints());
      const files = exportLibrary(library);
      if (Object.keys(files).length === 0) return;
      downloadBytes(`${library.manifest.id}-icons.zip`, exportArchive(library), "application/zip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button disabled={busy || count === 0} title={count === 0 ? "Nothing is published yet" : `${count} published icons`} onClick={() => void run()}>
      {busy ? "Packing…" : `Export ${count}`}
    </button>
  );
}

/**
 * Invariants that only exist across a set: the folder drawn differently from
 * the other eleven, two icons that mean the same thing, an icon that drifted
 * from rules the rest follow. No per-icon rule can see any of them.
 *
 * Nothing here blocks. A pattern is a pattern, not a law.
 */
function Audit() {
  const { library, mutate, version } = useLibrary();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const findings = useMemo(() => (library ? auditLibrary(library) : []), [library, version]);
  const proposals = useMemo(() => (library ? proposeRules(library) : []), [library, version]);
  if (!library) return null;
  const reviewed = library.iconsInLanguage(library.manifest.language).filter((i) => i.status !== "draft").length;

  const adopt = async (index: number) => {
    const proposal = proposals[index];
    if (!proposal) return;
    setBusy(true);
    try {
      await mutate((lib) => lib.saveLanguage(proposal.apply(), { note: `Adopted: ${proposal.label.toLowerCase()}` }));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const emergent = proposals.length > 0 && (
    <section className="proposals">
      <h3>Rules your set already follows</h3>
      <p className="muted small-text">
        Written nowhere, true of every icon. Declaring one turns a habit into something the system can hold for you.
      </p>
      <ul>
        {proposals.map((proposal, i) => (
          <li key={proposal.id}>
            <div>
              <strong>{proposal.label}.</strong> {proposal.message}
              <div className="muted small-text">
                {proposal.wouldFail.length === 0
                  ? "Nothing in the set would start failing."
                  : `${proposal.wouldFail.length} would start failing: ${proposal.wouldFail.join(", ")}.`}
              </div>
            </div>
            <button className="primary" disabled={busy} onClick={() => void adopt(i)}>
              Declare it
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  if (reviewed === 0) {
    return <p className="muted">Nothing to audit yet. Drafts are excluded, because an unfinished icon is not drift.</p>;
  }
  if (findings.length === 0) {
    return (
      <div className="audit">
        {error && <p className="error-text">{error}</p>}
        <p className="muted">
          {reviewed} icons checked against each other in {library.language.name}. Nothing stands out.
        </p>
        {emergent}
      </div>
    );
  }

  const groups = [...new Map(findings.map((f) => [f.id, findings.filter((g) => g.id === f.id)])).values()];
  return (
    <div className="audit">
      <p className="muted small-text">
        {findings.length} {findings.length === 1 ? "finding" : "findings"} across {reviewed} icons. None of these stop
        anything being published.
      </p>
      {error && <p className="error-text">{error}</p>}
      {emergent}
      {groups.map((group) => (
        <section key={group[0]!.id}>
          <h3>
            {group[0]!.label} <span className="muted small-text">{group.length}</span>
          </h3>
          <ul>
            {group.map((finding, i) => (
              <li key={i} className={finding.severity}>
                <span>{finding.message}</span>
                <span className="audit-icons">
                  {finding.icons.map((name) => (
                    <button key={name} className="ghost small" onClick={() => navigate(`library/${encodeURIComponent(name)}`)}>
                      {name}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Concepts with no published icon. A gap is a request, not silence: it is the
 * answer to "what is the icon for X?" when there is not one yet.
 */
function Gaps() {
  const { library, version } = useLibrary();
  const gaps = useMemo(() => library?.gaps() ?? [], [library, version]);
  if (!library) return null;
  const total = library.concepts().length;

  return (
    <div className="gaps">
      {total === 0 ? (
        <p className="muted">
          No concepts recorded yet. One is written down each time you approve an icon for something new, and from then
          on the same request needs no model.
        </p>
      ) : gaps.length === 0 ? (
        <p className="muted">Every concept in this library has a published icon in {library.language.name}.</p>
      ) : (
        <>
          <p className="muted small-text">
            {gaps.length} of {total} concepts have no published icon in {library.language.name}.
          </p>
          <ul className="gap-list">
            {gaps.map((concept) => (
              <li key={concept.id}>
                <div>
                  <strong>{concept.name}</strong>
                  {concept.description && <span className="muted"> — {concept.description}</span>}
                  {concept.aliases.length > 0 && (
                    <div className="muted small-text">also: {concept.aliases.join(", ")}</div>
                  )}
                  <div className="muted small-text">
                    {concept.composition
                      ? `${concept.composition.arrangement} of ${concept.composition.parts.map((p) => p.element).join(", ")}`
                      : "no decomposition recorded yet"}
                  </div>
                </div>
                <button onClick={() => navigate("create")}>Create</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <FilledCoverage />
    </div>
  );
}

/**
 * What the set is missing in the filled style.
 *
 * The same question as the concept gaps above, one level down, so it lives in
 * the same place. It reports against the language's policy and stops there: the
 * system never decides that an icon needs a filled version, because that is a
 * fact about a product's tab bars and not a property of a drawing.
 */
function FilledCoverage() {
  const { library, version } = useLibrary();
  const coverage = useMemo(() => library?.filledCoverage(), [library, version]);
  if (!library || !coverage) return null;
  if (!library.language.style.allowed.includes("filled")) return null;

  return (
    <div className="filled-coverage">
      <h3>Filled versions</h3>
      {coverage.policy.length === 0 ? (
        <p className="muted small-text">
          {library.language.name} asks for no filled versions. {coverage.covered.length > 0
            ? `${coverage.covered.length} ${coverage.covered.length === 1 ? "icon has" : "icons have"} one anyway, which is fine.`
            : "Name the concepts that need one under Styles in the language, and they will be listed here."}
        </p>
      ) : coverage.missing.length === 0 ? (
        <p className="muted small-text">
          Every published icon tagged {coverage.policy.join(", ")} has a filled version.
        </p>
      ) : (
        <>
          <p className="muted small-text">
            {coverage.missing.length} of {coverage.required.length} icons tagged {coverage.policy.join(", ")} have no
            filled version.
          </p>
          <ul className="gap-list">
            {coverage.missing.map((record) => (
              <li key={record.spec.name}>
                <div>
                  <strong>{record.spec.name}</strong>
                  {record.concept && <span className="muted"> — {record.concept}</span>}
                </div>
                <button onClick={() => navigate(`library/${encodeURIComponent(record.spec.name)}`)}>Open</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * One icon in the set, drawn the same way a part is drawn on the language
 * canvas: true size, on the ground the app is in, with the name on hover.
 *
 * The two grids are the same kind of looking — is this a set? — so they are
 * the same grid. See the tile rules in styles.css.
 */
function IconCard({ record, style, active }: { record: IconRecord; style: "outline" | VariantKind; active: boolean }) {
  const { library } = useLibrary();
  if (!library) return null;
  // Showing a variant: an icon that does not have it keeps its cell and its
  // canonical drawing, marked. Hiding it would answer "how much of this set is
  // filled" by making the question impossible to ask.
  const variant = style === "outline" ? undefined : library.variantSpec(record.spec.name, style);
  const absent = style !== "outline" && !variant;
  const spec = variant ?? record.spec;
  return (
    <button
      className={`tile ${active ? "sel" : ""} ${record.status === "deprecated" ? "muted-status" : ""} ${absent ? "dim" : ""}`}
      title={absent ? `${record.spec.name} — no ${style} version` : record.spec.name}
      onClick={() => navigate(`library/${encodeURIComponent(record.spec.name)}`)}
    >
      {record.status === "draft" && <span className="tile-mark draft" title="draft — not published" />}
      {style !== "outline" && record.variants?.[style]?.status === "draft" && (
        <span className="tile-mark draft" title={`${style} version is a draft`} />
      )}
      {absent && <span className="tile-mark absent" title={`no ${style} version`} />}
      <Swatch
        tone="surface"
        render={(onDark) => <IconSvg svg={renderSpec(spec, library, onDark).svg} size={record.spec.canvas} />}
      />
      <span className="tile-name">{record.spec.name}</span>
    </button>
  );
}

