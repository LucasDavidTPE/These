/**
 * Implémentation de démonstration, en mémoire : permet d'ouvrir l'interface dans un
 * navigateur (`npm run dev`) sans Tauri, avec une petite bibliothèque d'exemple qui
 * montre les cas particuliers (verrou d'un autre poste, conflit OneDrive, ID en double…).
 */
import {
  LockedError,
  MemoryFs,
  NotFoundError,
  joinPath,
  lockStatus,
  newMeta,
  parseLock,
  serializeMeta,
  type FigureKind,
  type FigureMeta,
} from "../../core/library";
import { exportSvg } from "../../core/schema";
import type { Backend, LockAcquired } from "./backend";

/** Schéma d'exemple (structure sous profil de pression) pour essayer l'éditeur. */
const DEMO_FIGURE = {
  format: "figurine/1",
  canvas: { unit: "mm", width: 140, height: 90, grid: 1 },
  theme: "these",
  items: [
    {
      id: "pav",
      type: "layer_stack",
      at: [10, 30],
      params: {
        width: 120,
        layers: [
          { name: "BB", h: 8, hatch: "bitumineux" },
          { name: "GB", h: 12, hatch: "bitumineux-dense" },
          { name: "GRH", h: 20, hatch: "granulaire" },
          { name: "PF", h: 15, hatch: "sol", semi_infinite: true },
        ],
      },
    },
    { id: "p", type: "pressure_profile", on: "pav.top", params: { width: 70, height: 14 } },
  ],
};

const HOST = "PC-DEMO";
const ROOT = "C:\\Users\\Demo\\OneDrive\\Figurine";

function svgThumb(label: string, hue: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="110" viewBox="0 0 160 110">` +
    `<rect width="160" height="110" fill="hsl(${hue},20%,92%)"/>` +
    `<rect x="20" y="40" width="120" height="14" fill="hsl(${hue},10%,30%)"/>` +
    `<rect x="20" y="54" width="120" height="20" fill="hsl(${hue},10%,55%)"/>` +
    `<rect x="20" y="74" width="120" height="22" fill="hsl(${hue},10%,78%)"/>` +
    `<text x="80" y="28" font-family="sans-serif" font-size="12" text-anchor="middle">${label}</text></svg>`
  );
}

function meta(id: string, title: string, kind: FigureKind, patch: Partial<FigureMeta> = {}): string {
  return serializeMeta({ ...newMeta({ id, title, kind, now: "2026-09-20T10:00:00+02:00", host: "PC-TRAVAIL" }), ...patch });
}

function seed(): MemoryFs {
  const recent = new Date(Date.now() - 2 * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");
  return new MemoryFs({
    "figurine-library.json": "{}\n",
    "FIG-0001_structure-souple-a340/meta.json": meta("FIG-0001", "Structure de chaussée souple sous bogie A340", "schema", {
      tags: ["chaussée", "MAIREINFRA"],
      source: { type: "own" },
      used_in: ["Manuscrit ch. 2"],
    }),
    "FIG-0001_structure-souple-a340/figure.json": JSON.stringify(DEMO_FIGURE, null, 2) + "\n",
    "FIG-0001_structure-souple-a340/export.svg": exportSvg(DEMO_FIGURE),
    "FIG-0002_essai-module/meta.json": meta("FIG-0002", "Essai de module complexe", "image", {
      tags: ["enrobé"],
      source: { type: "article", author: "De Beer et al.", year: 1997, bib: "BIB-042" },
      license: "inconnue",
      caption: "Adapté de De Beer et al. (1997).",
    }),
    "FIG-0002_essai-module/original.png": svgThumb("Photo", 200),
    "FIG-0003_modele-2s2p1d/meta.json": meta("FIG-0003", "Modèle 2S2P1D", "schema", { source: { type: "own" } }),
    "FIG-0003_modele-2s2p1d/export.svg": svgThumb("2S2P1D", 120),
    "FIG-0003_modele-2s2p1d/.lock": JSON.stringify({ host: "PC-MAISON", since: recent }),
    "FIG-0004_ornierage/meta.json": meta("FIG-0004", "Orniérage mesuré", "graph", { source: { type: "own" } }),
    "FIG-0004_ornierage/meta-PC-MAISON.json": meta("FIG-0004", "Orniérage mesuré (version maison)", "graph", {
      source: { type: "own" },
    }),
    "FIG-0005_bogie-plan/meta.json": meta("FIG-0005", "Bogie vu en plan", "schema"),
    "FIG-0005_bogie-maison/meta.json": meta("FIG-0005", "Bogie (créé hors ligne)", "schema"),
    "FIG-0006_photo-carottage/meta.json": meta("FIG-0006", "Photo de carottage", "image", {
      source: { type: "web", url: "https://www.example.org/carotte.jpg" },
    }),
    "FIG-0006_photo-carottage/meta.json.tmp": "{\"id\": \"FIG-00",
  });
}

/**
 * « Détourage » de démonstration, sans modèle : tout pixel assez différent de la couleur
 * du coin haut gauche est gardé. Suffisant pour essayer l'interface.
 */
async function demoSegment(image: Uint8Array): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([image.slice()]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const out = new ArrayBuffer(12 + width * height);
  const view = new DataView(out);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, 0, true);
  const mask = new Uint8Array(out, 12);
  const [r0, g0, b0] = [data[0]!, data[1]!, data[2]!];
  for (let i = 0; i < width * height; i++) {
    const d = Math.abs(data[i * 4]! - r0) + Math.abs(data[i * 4 + 1]! - g0) + Math.abs(data[i * 4 + 2]! - b0);
    mask[i] = Math.min(255, d * 2);
  }
  return out;
}

export function demoBackend(): Backend {
  const fs = seed();
  const blobs = new Map<string, string>();
  let settings: string | null = null;

  const readLock = async (folder: string) => {
    const text = fs.get(joinPath(folder, ".lock"));
    return text === undefined ? null : (parseLock(text) ?? { host: "?", since: "1970-01-01T00:00:00Z" });
  };

  return {
    kind: "demo",
    hostName: async () => HOST,
    readSettings: async () => settings,
    writeSettings: async (content) => {
      settings = content;
    },
    oneDriveCandidates: async () => ["C:\\Users\\Demo\\OneDrive"],
    pickFolder: async () => ROOT,
    openRoot: async () => {},
    fs: () => fs,
    locks: () => ({
      read: readLock,
      acquire: async (folder, force = false): Promise<LockAcquired> => {
        if (!fs.has(folder)) throw new NotFoundError(folder);
        const lock = await readLock(folder);
        const status = lockStatus(lock, HOST, new Date());
        if (status === "other" && !force) throw new LockedError(`Figure en cours d'édition sur ${lock!.host} depuis ${lock!.since}`);
        fs.put(joinPath(folder, ".lock"), JSON.stringify({ host: HOST, since: new Date().toISOString().replace(/\.\d+Z$/, "Z") }));
        if (status === "free") return { outcome: "new" };
        if (status === "mine") return { outcome: "refreshed" };
        if (status === "stale") return { outcome: "took-over-stale", previous: lock };
        return { outcome: "forced", previous: lock! };
      },
      release: async (folder, force = false) => {
        const lock = await readLock(folder);
        if (!lock) return false;
        if (!force && lockStatus(lock, HOST, new Date()) === "other") throw new LockedError(`Verrou tenu par ${lock.host}`);
        fs.remove(joinPath(folder, ".lock"));
        return true;
      },
    }),
    removeTemp: async (_root, path) => {
      if (!path.endsWith(".tmp")) throw new Error("Seuls les fichiers .tmp peuvent être supprimés.");
      fs.remove(path);
    },
    imageUrl: (_root, path) => {
      const bytes = fs.getBytes(path);
      if (bytes) {
        if (!blobs.has(path)) blobs.set(path, URL.createObjectURL(new Blob([bytes.slice()], { type: "image/png" })));
        return blobs.get(path)!;
      }
      const content = fs.get(path) ?? "";
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
    },

    segment: (image) => demoSegment(image),
    pasteImage: async (event) => {
      const file = event?.clipboardData ? [...event.clipboardData.files].find((f) => f.type.startsWith("image/")) : undefined;
      if (!file) return null;
      return { bytes: new Uint8Array(await file.arrayBuffer()), html: event?.clipboardData?.getData("text/html") || null };
    },
    copyPng: async (png) => {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([png.slice()], { type: "image/png" }) })]);
    },
    copySvg: async (svg) => navigator.clipboard.writeText(svg),
    copyText: async (text) => navigator.clipboard.writeText(text),
    openImageFile: () =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
          const f = input.files?.[0];
          resolve(f ? new Uint8Array(await f.arrayBuffer()) : null);
        };
        input.click();
      }),
    openDataFile: () =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xlsm,.csv,.tsv,.txt,.dat";
        input.onchange = async () => {
          const f = input.files?.[0];
          resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
        };
        input.click();
      }),
    readDroppedFile: async () => {
      throw new Error("Glisser-déposer par chemin : seulement dans l'appli.");
    },
    onFileDrop: async () => () => {},
    saveTextAs: async (content, defaultName, extension) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([content], { type: extension === "svg" ? "image/svg+xml" : "text/plain" }));
      a.download = defaultName;
      a.click();
      return true;
    },
    savePngAs: async (png, defaultName) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([png.slice()], { type: "image/png" }));
      a.download = defaultName;
      a.click();
      return true;
    },
  };
}
