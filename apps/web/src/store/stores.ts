import type { FileStore } from "@icon-foundry/icon-library";
import { idb } from "./idb.js";

/* File System Access API types that lib.dom does not ship yet. */
declare global {
  interface Window {
    showDirectoryPicker?(options?: { mode?: "read" | "readwrite"; id?: string }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
    queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }
}

export const supportsFolders = (): boolean => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

/** A library folder on the user's disk, through the File System Access API. */
export class DirectoryStore implements FileStore {
  constructor(readonly root: FileSystemDirectoryHandle) {}

  private async dir(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
    let handle = this.root;
    for (const seg of segments) {
      try {
        handle = await handle.getDirectoryHandle(seg, { create });
      } catch {
        return undefined;
      }
    }
    return handle;
  }

  private split(path: string): { dirs: string[]; name: string } {
    const parts = path.split("/").filter(Boolean);
    return { dirs: parts.slice(0, -1), name: parts[parts.length - 1] ?? "" };
  }

  async read(path: string): Promise<string | undefined> {
    const { dirs, name } = this.split(path);
    const dir = await this.dir(dirs, false);
    if (!dir) return undefined;
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      return await file.text();
    } catch {
      return undefined;
    }
  }

  async write(path: string, text: string): Promise<void> {
    const { dirs, name } = this.split(path);
    const dir = await this.dir(dirs, true);
    if (!dir) throw new Error(`cannot create ${dirs.join("/")}`);
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async delete(path: string): Promise<void> {
    const { dirs, name } = this.split(path);
    const dir = await this.dir(dirs, false);
    if (dir) await dir.removeEntry(name);
  }

  async list(dirPath: string): Promise<string[]> {
    const dir = await this.dir(dirPath.split("/").filter(Boolean), false);
    if (!dir) return [];
    const out: string[] = [];
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === "file") out.push(`${dirPath}/${name}`);
    }
    return out.sort();
  }
}

/** Browser-only storage for trying the app without a folder. Data stays in this browser. */
export class BrowserStore implements FileStore {
  constructor(private readonly prefix = "default") {}
  private key(path: string) {
    return `${this.prefix}:${path}`;
  }
  async read(path: string) {
    return idb.get<string>("files", this.key(path));
  }
  async write(path: string, text: string) {
    await idb.set("files", this.key(path), text);
  }
  async delete(path: string) {
    await idb.delete("files", this.key(path));
  }
  async list(dir: string) {
    const prefix = this.key(dir.endsWith("/") ? dir : `${dir}/`);
    const keys = (await idb.keys("files")).map(String);
    return keys
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
      .map((k) => k.slice(this.prefix.length + 1))
      .sort();
  }
}

const HANDLE_KEY = "library-folder";

export async function rememberFolder(handle: FileSystemDirectoryHandle): Promise<void> {
  await idb.set("handles", HANDLE_KEY, handle);
}

export async function forgetFolder(): Promise<void> {
  await idb.delete("handles", HANDLE_KEY);
}

/** Reconnect to the last folder if the browser still grants permission. */
export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  const handle = await idb.get<FileSystemDirectoryHandle>("handles", HANDLE_KEY);
  if (!handle) return undefined;
  const state = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (state === "granted") return handle;
  const granted = await handle.requestPermission?.({ mode: "readwrite" });
  return granted === "granted" ? handle : undefined;
}
