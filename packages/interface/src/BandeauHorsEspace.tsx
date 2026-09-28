/**
 * Rappel, dans le module concerné, qu'un ancien emplacement n'est pas encore rapatrié dans
 * l'espace : sans lui, la bibliothèque ou les PDF paraîtraient vides.
 */
import { horsEspace, type DansLEspace } from "@noyau/poste/racines";
import { Message } from "./composants";
import { useContexte } from "./contexte";
import { PHRASES_DANS_L_ESPACE } from "./rapatriement";

export function BandeauHorsEspace({ quoi }: { quoi: DansLEspace }) {
  const ctx = useContexte();
  const ancien = horsEspace(ctx.reglages, ctx.espace?.racine ?? null).find((a) => a.quoi === quoi);
  if (!ancien) return null;
  const ph = PHRASES_DANS_L_ESPACE[quoi];
  return (
    <Message niveau="attention">
      <span>
        {ph.sujet} {ph.vit} désormais dans l'espace ; sur ce poste, {ph.pronom} encore dans <span className="chemin">{ancien.chemin}</span>.{" "}
      </span>
      <button type="button" onClick={() => ctx.naviguer("reglages")}>
        Rapatrier dans l'espace…
      </button>
    </Message>
  );
}
