/**
 * Implémentation Tauri : appels aux commandes Rust (src-tauri/src/fichiers, poste.rs, figures/).
 * Aucune logique ici : uniquement des `invoke` et la conversion des erreurs.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { libraryErrorFromIpc, type DirEntry, type LockInfo } from "../../core/library";
import type { Backend, LockAcquired } from "./backend";

/** Commande à corps binaire ; les paramètres texte passent en en-têtes encodés. */
async function callRaw<T>(cmd: string, bytes: Uint8Array, headers: Record<string, string> = {}, path = ""): Promise<T> {
  const encoded = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, encodeURIComponent(v)]));
  try {
    return await invoke<T>(cmd, bytes, { headers: encoded });
  } catch (e) {
    throw libraryErrorFromIpc(e, path);
  }
}

function asBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

async function call<T>(cmd: string, args: Record<string, unknown> = {}, path = ""): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw libraryErrorFromIpc(e, path);
  }
}

/** Chemin absolu Windows d'un fichier de la bibliothèque. */
function absolute(root: string, rel: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  return root.replace(/[\\/]+$/, "") + sep + rel.split("/").join(sep);
}

export function tauriBackend(): Backend {
  return {
    kind: "tauri",
    hostName: () => call<string>("poste_nom"),
    // Remplacés par le pont vers les réglages du poste (voir backend.ts).
    readSettings: async () => null,
    writeSettings: async () => undefined,
    oneDriveCandidates: () => call<string[]>("poste_dossiers_onedrive"),
    pickFolder: async (defaultPath) => {
      const r = await open({ directory: true, multiple: false, defaultPath, title: "Dossier de la bibliothèque" });
      return typeof r === "string" ? r : null;
    },
    openRoot: async (root, create) => {
      if (create) await call<void>("poste_creer_dossier", { chemin: root });
      await call<void>("figures_autoriser_images", { racine: root });
    },
    fs: (root) => ({
      listDir: (path) => call<DirEntry[]>("fichiers_lister", { racine: root, chemin: path }, path),
      readText: (path) => call<string>("fichiers_lire_texte", { racine: root, chemin: path }, path),
      readBytes: async (path) => asBytes(await call<ArrayBuffer>("fichiers_lire_octets", { racine: root, chemin: path }, path)),
      writeTextAtomic: (path, content) => call<void>("fichiers_ecrire_texte", { racine: root, chemin: path, contenu: content }, path),
      writeBytesAtomic: (path, content) => callRaw<void>("fichiers_ecrire_octets", content, { "x-racine": root, "x-chemin": path }, path),
      createDir: (path) => call<void>("fichiers_creer_dossier", { racine: root, chemin: path }, path),
      rename: (from, to) => call<void>("fichiers_renommer", { racine: root, de: from, vers: to }, to),
    }),
    locks: (root) => ({
      read: (folder) => call<LockInfo | null>("verrou_lire", { racine: root, dossier: folder }, folder),
      acquire: (folder, force = false) => call<LockAcquired>("verrou_poser", { racine: root, dossier: folder, forcer: force }, folder),
      release: (folder, force = false) => call<boolean>("verrou_lever", { racine: root, dossier: folder, forcer: force }, folder),
    }),
    removeTemp: (root, path) => call<void>("fichiers_supprimer_temporaire", { racine: root, chemin: path }, path),
    imageUrl: (root, path) => convertFileSrc(absolute(root, path)),

    segment: (image) => callRaw<ArrayBuffer>("cutout_segment", image),
    pasteImage: async () => {
      const png = asBytes(await call<ArrayBuffer>("clipboard_read_image"));
      if (png.length === 0) return null;
      const html = await call<string | null>("clipboard_read_html").catch(() => null);
      return { bytes: png, html };
    },
    copyPng: (png) => callRaw<void>("clipboard_write_png", png),
    copySvg: (svg, png) => call<void>("clipboard_write_svg", { svg, png: Array.from(png) }),
    copyText: (text) => navigator.clipboard.writeText(text),
    openImageFile: async () => {
      const path = await open({
        multiple: false,
        title: "Ouvrir une image",
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp"] }],
      });
      if (typeof path !== "string") return null;
      return asBytes(await call<ArrayBuffer>("file_read_image", { path }, path));
    },
    openDataFile: async () => {
      const path = await open({
        multiple: false,
        title: "Ouvrir des données",
        filters: [{ name: "Données", extensions: ["xlsx", "xlsm", "csv", "tsv", "txt", "dat"] }],
      });
      if (typeof path !== "string") return null;
      const bytes = asBytes(await call<ArrayBuffer>("file_read_data", { path }, path));
      return { name: path.split(/[\\/]/).pop() ?? path, bytes };
    },
    readDroppedFile: async (path) => asBytes(await call<ArrayBuffer>("file_read_image", { path }, path)),
    onFileDrop: async (handler) =>
      getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === "drop") handler(e.payload.paths);
      }),
    saveTextAs: async (content, defaultName, extension) => {
      const path = await save({
        title: "Exporter",
        defaultPath: defaultName,
        filters: [{ name: extension === "svg" ? "SVG" : extension === "sty" ? "Paquet LaTeX" : "LaTeX", extensions: [extension] }],
      });
      if (!path) return false;
      await call<void>("file_write_text", { path, content }, path);
      return true;
    },
    savePngAs: async (png, defaultName) => {
      const path = await save({ title: "Enregistrer l'image", defaultPath: defaultName, filters: [{ name: "PNG", extensions: ["png"] }] });
      if (!path) return false;
      await callRaw<void>("file_write_png", png, { "x-path": path }, path);
      return true;
    },
  };
}
