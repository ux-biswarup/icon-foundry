import { compose } from "@icon-foundry/icon-composer";
import type { ElementRecord } from "@icon-foundry/icon-library";
import type { Primitive } from "@icon-foundry/icon-primitives";
import { renderSvg } from "@icon-foundry/icon-renderer";
import type { IconSpec } from "@icon-foundry/icon-spec";
import { useState } from "react";
import { IconSvg } from "../components/IconSvg.js";
import { StatusPill } from "../components/Status.js";
import { useLibrary } from "../store/LibraryContext.js";

export function ElementsPage() {
  const { library, mutate, version } = useLibrary();
  const [error, setError] = useState<string>();
  if (!library) return null;
  void version;
  const registry = library.registry();
  const lang = library.language;
  const tokens = lang.sizes[lang.defaultCanvas]!;

  const preview = (p: Primitive): string => {
    const box = tokens.optical[p.opticalShape];
    const spec: IconSpec = { name: p.name, language: lang.id, canvas: lang.defaultCanvas, elements: [{ primitive: p.name, ...box }] };
    return renderSvg(compose(spec, lang, { registry }), lang);
  };

  const custom = library.elements();
  const builtins = registry.list().filter((p) => p.origin === "builtin");
  const act = (fn: Parameters<typeof mutate>[0]) =>
    mutate(fn).then(() => setError(undefined)).catch((e) => setError(e instanceof Error ? e.message : String(e)));

  return (
    <div className="page elements">
      <header className="page-header">
        <h1>Elements</h1>
        <p className="lede">The recurring parts every icon is built from. Drafted elements come from Create; approving one makes it part of the vocabulary.</p>
      </header>
      {error && <p className="error-text">{error}</p>}

      <section>
        <h2>This library ({custom.length})</h2>
        {custom.length === 0 && <p className="muted">No custom elements yet. They appear when you approve an icon that needed a new subject.</p>}
        <div className="element-grid">
          {custom.map((e) => (
            <ElementCard key={e.name} record={e} svg={registry.has(e.name) ? preview(registry.get(e.name)) : undefined} usages={library.usages(e.name).length} onAction={act} />
          ))}
        </div>
      </section>

      <section>
        <h2>Built in ({builtins.length})</h2>
        <div className="element-grid">
          {builtins.map((p) => (
            <div key={p.name} className="element">
              <div className="swatch light">
                <IconSvg svg={preview(p)} size={48} />
              </div>
              <div className="element-name">{p.name}</div>
              <div className="muted small-text">
                {p.category} · {p.opticalShape}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ElementCard({
  record: e,
  svg,
  usages,
  onAction,
}: {
  record: ElementRecord;
  svg: string | undefined;
  usages: number;
  onAction: (fn: (lib: NonNullable<ReturnType<typeof useLibrary>["library"]>) => Promise<unknown>) => Promise<unknown>;
}) {
  return (
    <div className="element custom">
      <div className="swatch light">
        <IconSvg svg={svg} size={48} />
      </div>
      <div className="element-name">
        {e.name} <StatusPill status={e.status} />
      </div>
      <div className="muted small-text">
        {e.category} · {e.opticalShape ?? "auto"} · used by {usages}
      </div>
      {e.description && <p className="small-text">{e.description}</p>}
      <div className="actions">
        {e.status !== "approved" && (
          <button className="primary" onClick={() => void onAction((lib) => lib.setElementStatus(e.name, "approved"))}>
            Approve
          </button>
        )}
        {e.status !== "deprecated" && (
          <button onClick={() => void onAction((lib) => lib.setElementStatus(e.name, "deprecated"))}>Deprecate</button>
        )}
        {usages === 0 && (
          <button className="danger" onClick={() => confirm(`Delete element "${e.name}"?`) && void onAction((lib) => lib.removeElement(e.name))}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
