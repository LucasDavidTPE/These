import { estCheminRelatifSur, parent } from "./chemins";
import { DejaExistant, Introuvable, type Entree, type Fichiers } from "./fichiers";

/** Faux système de fichiers en mémoire, pour les tests et la démo dans un navigateur. */
export class FichiersMemoire implements Fichiers {
  private readonly textes = new Map<string, string>();
  private readonly binaires = new Map<string, Uint8Array>();
  private readonly dossiers = new Set<string>([""]);

  /** Crée les fichiers donnés (et leurs dossiers parents). */
  constructor(initial: Record<string, string> = {}) {
    for (const [chemin, contenu] of Object.entries(initial)) this.poser(chemin, contenu);
  }

  /** Écriture brute, non atomique, pour préparer un scénario de test. */
  poser(chemin: string, contenu: string): void {
    this.verifier(chemin);
    this.creerParents(chemin);
    this.textes.set(chemin, contenu);
  }

  /** Supprime un fichier (préparation de scénarios). */
  supprimer(chemin: string): void {
    this.textes.delete(chemin);
    this.binaires.delete(chemin);
  }

  lire(chemin: string): string | undefined {
    return this.textes.get(chemin);
  }

  /** Tous les fichiers, triés : pratique pour comparer un état attendu. */
  instantane(): Record<string, string> {
    return Object.fromEntries([...this.textes.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  async listDir(path: string): Promise<Entree[]> {
    if (!this.dossiers.has(path)) throw new Introuvable(path);
    const prefixe = path === "" ? "" : `${path}/`;
    const direct = (p: string) => p.startsWith(prefixe) && p !== path && !p.slice(prefixe.length).includes("/");
    const out: Entree[] = [];
    for (const d of this.dossiers) if (direct(d)) out.push({ name: d.slice(prefixe.length), kind: "dir" });
    for (const f of this.textes.keys()) if (direct(f)) out.push({ name: f.slice(prefixe.length), kind: "file" });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async exists(path: string): Promise<boolean> {
    return this.dossiers.has(path) || this.textes.has(path);
  }

  async readText(path: string): Promise<string> {
    const contenu = this.textes.get(path);
    if (contenu === undefined) throw new Introuvable(path);
    return contenu;
  }

  async readBytes(path: string): Promise<Uint8Array> {
    const bin = this.binaires.get(path);
    if (bin) return bin.slice();
    return new TextEncoder().encode(await this.readText(path));
  }

  async writeTextAtomic(path: string, content: string): Promise<void> {
    this.verifier(path);
    if (!this.dossiers.has(parent(path))) throw new Introuvable(parent(path));
    if (this.dossiers.has(path)) throw new DejaExistant(path);
    this.textes.set(path, content);
    this.binaires.delete(path);
  }

  async writeBytesAtomic(path: string, content: Uint8Array): Promise<void> {
    await this.writeTextAtomic(path, `(binaire, ${content.length} octets)`);
    this.binaires.set(path, content.slice());
  }

  async writeTextNew(path: string, content: string): Promise<void> {
    if (await this.exists(path)) throw new DejaExistant(path);
    await this.writeTextAtomic(path, content);
  }

  async createDir(path: string): Promise<void> {
    this.verifier(path);
    if (await this.exists(path)) throw new DejaExistant(path);
    if (!this.dossiers.has(parent(path))) throw new Introuvable(parent(path));
    this.dossiers.add(path);
  }

  async ensureDir(path: string): Promise<void> {
    if (path === "") return;
    this.verifier(path);
    if (this.textes.has(path)) throw new DejaExistant(path);
    this.creerParents(path);
    this.dossiers.add(path);
  }

  async rename(from: string, to: string): Promise<void> {
    this.verifier(from);
    this.verifier(to);
    if (await this.exists(to)) throw new DejaExistant(to);
    if (!this.dossiers.has(parent(to))) throw new Introuvable(parent(to));
    const contenu = this.textes.get(from);
    if (contenu !== undefined) {
      this.textes.delete(from);
      this.textes.set(to, contenu);
      const bin = this.binaires.get(from);
      if (bin) {
        this.binaires.delete(from);
        this.binaires.set(to, bin);
      }
      return;
    }
    if (!this.dossiers.has(from)) throw new Introuvable(from);
    const deplace = (p: string) => p === from || p.startsWith(`${from}/`);
    for (const d of [...this.dossiers].filter(deplace)) {
      this.dossiers.delete(d);
      this.dossiers.add(to + d.slice(from.length));
    }
    for (const [f, c] of [...this.textes.entries()].filter(([f]) => deplace(f))) {
      this.textes.delete(f);
      this.textes.set(to + f.slice(from.length), c);
    }
    for (const [f, c] of [...this.binaires.entries()].filter(([f]) => deplace(f))) {
      this.binaires.delete(f);
      this.binaires.set(to + f.slice(from.length), c);
    }
  }

  private creerParents(chemin: string): void {
    const parts = chemin.split("/");
    for (let i = 1; i < parts.length; i++) this.dossiers.add(parts.slice(0, i).join("/"));
  }

  private verifier(chemin: string): void {
    if (!estCheminRelatifSur(chemin)) throw new Error(`Chemin relatif invalide : « ${chemin} »`);
  }
}
