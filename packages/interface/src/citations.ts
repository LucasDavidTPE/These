/**
 * Citations de la Bibliothèque dans les autres modules, par l'action « bibliotheque.citations ».
 * Rien n'apparaît si le module Bibliothèque n'est pas dans l'installeur, si l'utilisateur a coupé
 * les citations, ou si aucune des références n'est dans sa bibliothèque.
 */
import type { ReferenceCitee } from "@noyau/citations";
import type { Contexte } from "./contexte";

export interface CitationsResolues {
  actives: boolean;
  refs: Map<string, ReferenceCitee>;
}

export async function resoudreCitations(ctx: Contexte, cles: readonly string[]): Promise<CitationsResolues> {
  if (!cles.length || !ctx.registre.aAction("bibliotheque.citations")) return { actives: false, refs: new Map() };
  const r = (await ctx.registre.executer("bibliotheque.citations", { ctx, cles })) as { actives: boolean; refs: Record<string, ReferenceCitee> };
  return { actives: r.actives, refs: new Map(Object.entries(r.refs)) };
}
