import { DEFAULT_LANGUAGE_ID } from "@icon-foundry/icon-language";
import { Library } from "@icon-foundry/icon-library";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { seedDemo } from "./demo.js";
import { BrowserStore, DirectoryStore, forgetFolder, rememberFolder, rememberedFolder, supportsFolders } from "./stores.js";

export type Source = { kind: "folder"; name: string } | { kind: "browser" };

interface LibraryState {
  library: Library | undefined;
  source: Source | undefined;
  loading: boolean;
  error: string | undefined;
  /** Bumps after every mutation so views re-read the (mutable) Library. */
  version: number;
  /** Run a mutation against the library and re-render. */
  mutate<T>(fn: (library: Library) => Promise<T>): Promise<T>;
  /** Read from the library without marking anything changed. */
  read<T>(fn: (library: Library) => Promise<T>): Promise<T>;
  openFolder(): Promise<void>;
  createInFolder(input: { id: string; name: string }): Promise<void>;
  useBrowser(): Promise<void>;
}

const Ctx = createContext<LibraryState | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<Library>();
  const [source, setSource] = useState<Source>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);
  const [pendingFolder, setPendingFolder] = useState<FileSystemDirectoryHandle>();

  const loadBrowser = useCallback(async () => {
    const store = new BrowserStore();
    let lib: Library;
    try {
      lib = await Library.open(store);
    } catch {
      lib = await seedDemo(store);
    }
    setLibrary(lib);
    setSource({ kind: "browser" });
  }, []);

  const loadFolder = useCallback(async (handle: FileSystemDirectoryHandle) => {
    const store = new DirectoryStore(handle);
    try {
      const lib = await Library.open(store);
      setLibrary(lib);
      setSource({ kind: "folder", name: handle.name });
      setPendingFolder(undefined);
      await rememberFolder(handle);
    } catch (e) {
      // Not a library yet: offer to create one here.
      setPendingFolder(handle);
      setLibrary(undefined);
      setSource({ kind: "folder", name: handle.name });
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const handle = supportsFolders() ? await rememberedFolder() : undefined;
        if (handle) await loadFolder(handle);
        else await loadBrowser();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBrowser, loadFolder]);

  const state = useMemo<LibraryState>(
    () => ({
      library,
      source,
      loading,
      error,
      version,
      async mutate(fn) {
        if (!library) throw new Error("no library open");
        const out = await fn(library);
        setVersion((v) => v + 1);
        return out;
      },
      async read(fn) {
        if (!library) throw new Error("no library open");
        return fn(library);
      },
      async openFolder() {
        if (!window.showDirectoryPicker) throw new Error("This browser cannot open folders. Use Chrome or Edge, or the browser-only library.");
        const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "icon-foundry-library" });
        setError(undefined);
        await loadFolder(handle);
      },
      async createInFolder(input) {
        if (!pendingFolder) throw new Error("no folder selected");
        const lib = await Library.create(new DirectoryStore(pendingFolder), { ...input, language: DEFAULT_LANGUAGE_ID });
        setLibrary(lib);
        setError(undefined);
        setPendingFolder(undefined);
        await rememberFolder(pendingFolder);
        setVersion((v) => v + 1);
      },
      async useBrowser() {
        await forgetFolder();
        setError(undefined);
        setPendingFolder(undefined);
        await loadBrowser();
        setVersion((v) => v + 1);
      },
    }),
    [library, source, loading, error, version, pendingFolder, loadBrowser, loadFolder],
  );

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useLibrary(): LibraryState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLibrary outside provider");
  return ctx;
}
