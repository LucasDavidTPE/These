/**
 * Légende proposée automatiquement depuis la source (SPEC §3) :
 * « Adapté de De Beer et al. (1997). »
 */
import type { FigureSource } from "./meta";

export function generateCaption(source: FigureSource | undefined): string {
  if (!source || source.type === "own") return "";
  const author = source.author?.trim();
  const year = source.year;
  if (author) return year ? `Adapté de ${author} (${year}).` : `Adapté de ${author}.`;
  const host = hostOf(source.url);
  if (host) return year ? `Adapté de ${host} (${year}).` : `Adapté de ${host}.`;
  return "";
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(url.trim());
  return m ? m[1]!.replace(/^www\./i, "").toLowerCase() : "";
}
