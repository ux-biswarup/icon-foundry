/**
 * Minimal file-store abstraction so the same Library model runs over a
 * browser directory handle, Node's fs, or memory (tests, demos).
 * Paths are POSIX-style and relative to the library root.
 */
export interface FileStore {
  read(path: string): Promise<string | undefined>;
  write(path: string, text: string): Promise<void>;
  delete(path: string): Promise<void>;
  /** Files directly under `dir`, as paths relative to the root. */
  list(dir: string): Promise<string[]>;
}

export class MemoryStore implements FileStore {
  private readonly files = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.files.set(k, v);
  }

  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }

  async list(dir: string): Promise<string[]> {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    return [...this.files.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/")).sort();
  }

  /** Snapshot of all files, for export and tests. */
  toJSON(): Record<string, string> {
    return Object.fromEntries([...this.files.entries()].sort());
  }
}
