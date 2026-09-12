import { useState } from "react";
import { navigate, useRoute } from "./lib/router.js";
import { THEMES, useTheme } from "./lib/theme.js";
import { CreatePage } from "./pages/CreatePage.js";
import { LanguagePage } from "./pages/LanguagePage.js";
import { LibraryPage } from "./pages/LibraryPage.js";
import { useLibrary } from "./store/LibraryContext.js";
import { supportsFolders } from "./store/stores.js";

export function App() {
  const route = useRoute();
  const { library, source, loading, error, openFolder, useBrowser, createInFolder } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useTheme();
  const [newId, setNewId] = useState("");

  const guard = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <nav className="top">
        <a className="brand" href="#/library">
          ⬡ Icon Foundry
        </a>
        <a className={route.page === "library" ? "on" : ""} href="#/library">
          Library
        </a>
        <a className={route.page === "create" ? "on" : ""} href="#/create">
          Create
        </a>
        <a className={route.page === "language" ? "on" : ""} href="#/language">
          Language
        </a>
        <span className="spacer" />
        {/* Icons are judged on both grounds, so the app has to be able to show
            either one on demand rather than inheriting whatever the machine says. */}
        <div className="theme-seg" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t} className={theme === t ? "on" : ""} onClick={() => setTheme(t)} aria-pressed={theme === t}>
              {t}
            </button>
          ))}
        </div>
        <span className="source">
          {source?.kind === "folder" ? `📁 ${source.name}` : "Browser-only library"}
          {library && <span className="muted"> · {library.manifest.name}</span>}
        </span>
        {supportsFolders() && (
          <button className="ghost" disabled={busy} onClick={guard(openFolder)}>
            Open folder…
          </button>
        )}
        {source?.kind === "folder" && (
          <button className="ghost" disabled={busy} onClick={guard(useBrowser)}>
            Use browser library
          </button>
        )}
      </nav>

      {loading && <p className="page muted">Opening library…</p>}

      {!loading && !library && source?.kind === "folder" && (
        <div className="page setup">
          <h1>Start a library in “{source.name}”</h1>
          <p className="muted">{error}</p>
          <p>This folder is not an Icon Foundry library yet. Create one here; it becomes a plain folder of JSON you can commit to Git.</p>
          <label>
            Library id (kebab-case)
            <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="acme-icons" />
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newId) || busy}
              onClick={guard(() => createInFolder({ id: newId, name: newId }).then(() => navigate("library")))}
            >
              Create library here
            </button>
            <button className="ghost" onClick={guard(useBrowser)}>
              Use the browser library instead
            </button>
          </div>
        </div>
      )}

      {!loading && library && (
        <>
          {route.page === "library" && <LibraryPage selected={route.name} />}
          {route.page === "create" && <CreatePage />}
          {route.page === "language" && <LanguagePage />}
        </>
      )}
      {!loading && !library && source?.kind !== "folder" && error && <p className="page error-text">{error}</p>}
    </div>
  );
}
