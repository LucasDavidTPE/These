/** Synthèse d'un critère : une section par étiquette, articles cités en [@BIB-…], prête pour l'état de l'art. */
import { useMemo, useState } from "react";
import { Markdown } from "@interface/Markdown";
import { useContexte } from "@interface/contexte";
import { synthese, type ObjetRef, type ReglagesLecture } from "../../core/lecture";

export function SyntheseVue({ refs, reglages }: { refs: ObjetRef[]; reglages: ReglagesLecture }) {
  const ctx = useContexte();
  const [critere, setCritere] = useState(reglages.criteres[0]?.id ?? "");
  const [copie, setCopie] = useState(false);
  const parId = useMemo(() => new Map(refs.map((r) => [r.id, r.valeur])), [refs]);
  const actifs = useMemo(() => refs.filter((r) => r.valeur.statut !== "Écarté"), [refs]);
  const md = useMemo(() => synthese(actifs, reglages, critere, (id) => parId.get(id)?.titre || id), [actifs, reglages, critere, parId]);
  const nom = reglages.criteres.find((c) => c.id === critere)?.nom ?? critere;

  return (
    <>
      <div className="filtres">
        <select className="champ" value={critere} onChange={(e) => setCritere(e.target.value)} aria-label="Critère">
          {reglages.criteres.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(md).then(
              () => (setCopie(true), setTimeout(() => setCopie(false), 1500)),
              () => setCopie(false),
            )
          }
        >
          {copie ? "Copié ✓" : "Copier le Markdown"}
        </button>
        <button type="button" onClick={() => void ctx.plateforme.enregistrerSous(`synthese-${critere}.md`, new TextEncoder().encode(md))}>
          Enregistrer en .md…
        </button>
      </div>
      <p className="discret petit">
        Les citations <code>[@BIB-…]</code> deviennent « (Auteur, année) » dans les présentations ; dans Word, insérez-les avec Zotero. Synthèse de « {nom} » sur les
        articles non écartés.
      </p>
      <div className="carte lc-synthese">
        <Markdown texte={md} />
      </div>
    </>
  );
}
