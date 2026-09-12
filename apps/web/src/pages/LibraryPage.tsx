import { auditLibrary, proposeRules } from "@icon-foundry/icon-audit";
import { exportArchive, exportLibrary, figmaPayload } from "@icon-foundry/icon-export";
import { STATUS_TRANSITIONS, type IconRecord, type IconStatus } from "@icon-foundry/icon-library";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { useMemo, useState } from "react";
import { IconSvg, PreviewStrip } from "../components/IconSvg.js";
import { StatusPill } from "../components/Status.js";
import { ScoreSummary } from "../components/Scores.js";
import { ValidationList } from "../components/ValidationList.js";
import { downloadBytes, downloadText, renderSpec } from "../lib/render.js";
import { navigate } from "../lib/router.js";
import { useLibrary } from "../store/LibraryContext.js";

const ALL: IconStatus[] = ["draft", "review", "published", "deprecated"];

export function LibraryPage({ selected }: { selected?: string | undefined }) {
  const { library, version } = useLibrary();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"icons" | "gaps" | "audit">("icons");
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
        <ExportButton />
        <FigmaButton />
        <button className="primary" onClick={() => navigate("create")}>
          New icon
        </button>
      </div>

      {view === "gaps" && <Gaps />}
      {view === "audit" && <Audit />}

      {view === "icons" && (
      <div className={`split ${current ? "with-detail" : ""}`}>
        <div className="grid">
          {hits.length === 0 && (
            <p className="muted empty">
              {library.icons().length === 0 ? "No icons yet. Create the first one." : "Nothing matches."}
            </p>
          )}
          {hits.map(({ record }) => (
            <IconCard key={record.spec.name} record={record} active={record.spec.name === selected} />
          ))}
        </div>
        {current && <IconDetail record={current} key={current.spec.name + current.updatedAt} />}
      </div>
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
    </div>
  );
}

function IconCard({ record, active }: { record: IconRecord; active: boolean }) {
  const { library } = useLibrary();
  if (!library) return null;
  const { svg } = renderSpec(record.spec, library);
  return (
    <button
      className={`card ${active ? "active" : ""} status-${record.status}`}
      onClick={() => navigate(`library/${encodeURIComponent(record.spec.name)}`)}
    >
      <div className="card-preview">
        <IconSvg svg={svg} size={record.spec.canvas} />
      </div>
      <div className="card-name">{record.spec.name}</div>
    </button>
  );
}

function IconDetail({ record }: { record: IconRecord }) {
  const { library, mutate } = useLibrary();
  const [specText, setSpecText] = useState(() => JSON.stringify(record.spec, null, 2));
  const [tags, setTags] = useState(record.tags.join(", "));
  const [concepts, setConcepts] = useState(record.concepts.join(", "));
  const [error, setError] = useState<string>();
  const [showSpec, setShowSpec] = useState(false);
  if (!library) return null;

  const { svg, validation } = renderSpec(record.spec, library);
  const next = STATUS_TRANSITIONS[record.status];
  const list = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

  const act = (fn: Parameters<typeof mutate>[0]) =>
    mutate(fn).then(() => setError(undefined)).catch((e) => setError(e instanceof Error ? e.message : String(e)));

  return (
    <aside className="detail">
      <header>
        <h2>{record.spec.name}</h2>
        <StatusPill status={record.status} />
        <button className="ghost close" onClick={() => navigate("library")} aria-label="Close">
          ✕
        </button>
      </header>

      <PreviewStrip svg={svg} canvas={record.spec.canvas} />
      <ValidationList result={validation} />
      <ScoreSummary overall={validation.overall} scores={validation.scores} />

      <div className="actions">
        {next.map((s) => (
          <button key={s} className={s === "published" ? "primary" : ""} onClick={() => act((lib) => lib.setStatus(record.spec.name, s))}>
            {s === "published" ? "Publish" : s === "review" ? "Send to review" : s === "deprecated" ? "Deprecate" : "Back to draft"}
          </button>
        ))}
        {(record.status === "draft" || record.status === "deprecated") && (
          <button
            className="danger"
            onClick={() => {
              if (confirm(`Delete "${record.spec.name}"? This cannot be undone.`)) {
                void act((lib) => lib.remove(record.spec.name)).then(() => navigate("library"));
              }
            }}
          >
            Delete
          </button>
        )}
        <button onClick={() => svg && downloadText(`${record.spec.name}.svg`, svg, "image/svg+xml")} disabled={!svg}>
          Download SVG
        </button>
      </div>

      <label>
        Tags
        <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => act((lib) => lib.save(record.spec, { tags: list(tags) }))} />
      </label>
      <label>
        Concepts it answers
        <input
          value={concepts}
          onChange={(e) => setConcepts(e.target.value)}
          onBlur={() => act((lib) => lib.save(record.spec, { concepts: list(concepts) }))}
          placeholder="e.g. cold chain, refrigerated"
        />
      </label>

      <dl className="meta">
        {record.concept && (
          <>
            <dt>Concept</dt>
            <dd>{library.getConcept(record.concept)?.name ?? record.concept}</dd>
          </>
        )}
        <dt>Language</dt>
        <dd>
          {library.language.name} v{library.language.version} · {record.spec.canvas}px · {record.spec.style ?? library.language.style.default}
        </dd>
        {record.source?.brief && (
          <>
            <dt>Brief</dt>
            <dd>{record.source.brief}</dd>
          </>
        )}
        {record.source?.model && (
          <>
            <dt>Drafted by</dt>
            <dd>{record.source.model}</dd>
          </>
        )}
        {record.replacedBy && (
          <>
            <dt>Replaced by</dt>
            <dd>{record.replacedBy}</dd>
          </>
        )}
        <dt>Updated</dt>
        <dd>{new Date(record.updatedAt).toLocaleString()}</dd>
      </dl>

      <details open={showSpec} onToggle={(e) => setShowSpec((e.target as HTMLDetailsElement).open)}>
        <summary>Definition</summary>
        <textarea value={specText} onChange={(e) => setSpecText(e.target.value)} spellCheck={false} rows={14} />
        <div className="actions">
          <button
            onClick={() =>
              act(async (lib) => {
                const spec = parseIconSpec(JSON.parse(specText));
                if (spec.name !== record.spec.name) throw new Error("Renaming is not supported here; create a new icon instead.");
                await lib.save(spec);
              })
            }
          >
            Save definition
          </button>
          <button className="ghost" onClick={() => downloadText(`${record.spec.name}.json`, JSON.stringify(record, null, 2), "application/json")}>
            Export JSON
          </button>
        </div>
      </details>
      {error && <p className="error-text">{error}</p>}
    </aside>
  );
}
