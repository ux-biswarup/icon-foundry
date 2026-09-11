import { STATUS_TRANSITIONS, type IconRecord, type IconStatus } from "@icon-foundry/icon-library";
import { parseIconSpec } from "@icon-foundry/icon-spec";
import { useMemo, useState } from "react";
import { IconSvg, PreviewStrip } from "../components/IconSvg.js";
import { StatusPill } from "../components/Status.js";
import { ValidationList } from "../components/ValidationList.js";
import { downloadText, renderSpec } from "../lib/render.js";
import { navigate } from "../lib/router.js";
import { useLibrary } from "../store/LibraryContext.js";

const ALL: IconStatus[] = ["draft", "review", "published", "deprecated"];

export function LibraryPage({ selected }: { selected?: string | undefined }) {
  const { library, version } = useLibrary();
  const [query, setQuery] = useState("");
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
        <button className="primary" onClick={() => navigate("create")}>
          New icon
        </button>
      </div>

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
