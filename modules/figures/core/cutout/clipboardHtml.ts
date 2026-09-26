/**
 * Format « HTML Format » du presse-papier Windows : quelques lignes d'en-tête
 * (`Version:`, `StartHTML:`, `SourceURL:`…) suivies du fragment HTML copié.
 * On en tire l'adresse de la page et celle de l'image, pour préremplir la source (SPEC §3).
 */
import type { FigureSource } from "../library/meta";

export interface ClipboardOrigin {
  /** Page d'où vient la copie (`SourceURL:`), absente pour Word/PowerPoint. */
  pageUrl?: string;
  /** Adresse de l'image (`<img src>`), rendue absolue ; les `data:` sont ignorés. */
  imageUrl?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e]!);
}

function isWebUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

export function parseClipboardHtml(raw: string | null | undefined): ClipboardOrigin {
  if (!raw) return {};
  const out: ClipboardOrigin = {};
  const header = /^SourceURL:(.*)$/m.exec(raw.slice(0, 2000));
  const page = header?.[1]?.trim();
  if (page && isWebUrl(page)) out.pageUrl = page;

  const img = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(raw);
  const src = img ? decodeEntities((img[1] ?? img[2] ?? img[3] ?? "").trim()) : "";
  if (src && !/^data:/i.test(src)) {
    try {
      const abs = new URL(src, out.pageUrl).toString();
      if (isWebUrl(abs)) out.imageUrl = abs;
    } catch {
      // src relatif sans page de référence : inutilisable.
    }
  }
  return out;
}

/** Source proposée pour une image collée : la page (à citer) et, en note, l'image. */
export function sourceFromOrigin(origin: ClipboardOrigin): FigureSource | undefined {
  if (origin.pageUrl) {
    return origin.imageUrl && origin.imageUrl !== origin.pageUrl
      ? { type: "web", url: origin.pageUrl, note: `Image : ${origin.imageUrl}` }
      : { type: "web", url: origin.pageUrl };
  }
  if (origin.imageUrl) return { type: "web", url: origin.imageUrl };
  return undefined;
}
