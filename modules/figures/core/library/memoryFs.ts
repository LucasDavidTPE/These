import { AlreadyExistsError, NotFoundError, type DirEntry, type LibraryFs } from "./fs";
import { isSafeRelativePath } from "./paths";

/** Faux système de fichiers en mémoire, pour les tests et le développement sans Tauri. */
export class MemoryFs implements LibraryFs {
  private readonly files = new Map<string, string>();
  private readonly binaries = new Map<string, Uint8Array>();
  private readonly dirs = new Set<string>([""]);

  /** Crée les fichiers donnés (et leurs dossiers parents). */
  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) this.put(path, content);
  }

  /** Écriture brute, non atomique, pour préparer un scénario de test. */
  put(path: string, content: string): void {
    this.check(path);
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join("/"));
    this.files.set(path, content);
  }

  /** Ajoute un dossier vide. */
  mkdirp(path: string): void {
    this.check(path);
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) this.dirs.add(parts.slice(0, i).join("/"));
  }

  has(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }

  /** Supprime un fichier (préparation de scénarios, démo). */
  remove(path: string): void {
    this.files.delete(path);
    this.binaries.delete(path);
  }

  /** Contenu d'un fichier binaire écrit par writeBytesAtomic. */
  getBytes(path: string): Uint8Array | undefined {
    return this.binaries.get(path);
  }

  get(path: string): string | undefined {
    return this.files.get(path);
  }

  /** Tous les fichiers, triés : pratique pour comparer un état attendu. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  async listDir(path: string): Promise<DirEntry[]> {
    if (!this.dirs.has(path)) throw new NotFoundError(path);
    const prefix = path === "" ? "" : `${path}/`;
    const out: DirEntry[] = [];
    const direct = (p: string) => p.startsWith(prefix) && p !== path && !p.slice(prefix.length).includes("/");
    for (const d of this.dirs) if (direct(d)) out.push({ name: d.slice(prefix.length), kind: "dir" });
    for (const f of this.files.keys()) if (direct(f)) out.push({ name: f.slice(prefix.length), kind: "file" });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new NotFoundError(path);
    return content;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const bin = this.binaries.get(path);
    if (bin) return bin.slice();
    return new TextEncoder().encode(await this.readText(path));
  }

  async writeTextAtomic(path: string, content: string): Promise<void> {
    this.check(path);
    if (!this.dirs.has(parent(path))) throw new NotFoundError(parent(path));
    if (this.dirs.has(path)) throw new AlreadyExistsError(path);
    this.files.set(path, content);
  }

  async writeBytesAtomic(path: string, content: Uint8Array): Promise<void> {
    await this.writeTextAtomic(path, `(binaire, ${content.length} octets)`);
    this.binaries.set(path, content.slice());
  }

  async createDir(path: string): Promise<void> {
    this.check(path);
    if (this.has(path)) throw new AlreadyExistsError(path);
    if (!this.dirs.has(parent(path))) throw new NotFoundError(parent(path));
    this.dirs.add(path);
  }

  async rename(from: string, to: string): Promise<void> {
    this.check(from);
    this.check(to);
    if (this.has(to)) throw new AlreadyExistsError(to);
    if (!this.dirs.has(parent(to))) throw new NotFoundError(parent(to));
    const content = this.files.get(from);
    if (content !== undefined) {
      this.files.delete(from);
      this.files.set(to, content);
      const bin = this.binaries.get(from);
      if (bin) {
        this.binaries.delete(from);
        this.binaries.set(to, bin);
      }
      return;
    }
    if (!this.dirs.has(from)) throw new NotFoundError(from);
    const moved = (p: string) => p === from || p.startsWith(`${from}/`);
    for (const d of [...this.dirs].filter(moved)) {
      this.dirs.delete(d);
      this.dirs.add(to + d.slice(from.length));
    }
    for (const [f, c] of [...this.files.entries()].filter(([f]) => moved(f))) {
      this.files.delete(f);
      this.files.set(to + f.slice(from.length), c);
    }
    for (const [f, c] of [...this.binaries.entries()].filter(([f]) => moved(f))) {
      this.binaries.delete(f);
      this.binaries.set(to + f.slice(from.length), c);
    }
  }

  private check(path: string): void {
    if (!isSafeRelativePath(path)) throw new Error(`Chemin relatif invalide : « ${path} »`);
  }
}

function parent(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}
