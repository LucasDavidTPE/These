/** Colonne « Projets » de la bibliothèque (SPEC §6.1) : filtre, création, dépôt de figures. */
import { useMemo, useState } from "react";
import { SANS_PROJET } from "../../core/library";
import { projetsDe } from "../../core/projets";
import { GLISSE_FIGURE } from "./FigureGrid";
import { useLibrary } from "./useLibrary";

export function ProjetsColonne() {
  const s = useLibrary();
  const [nouveau, setNouveau] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const actif = s.filter.projet;

  const compte = useMemo(() => {
    const c = new Map<string, number>();
    let sans = 0;
    for (const f of s.index?.figures ?? []) {
      const p = projetsDe(f.meta).filter((x) => s.projets.projets.some((pr) => pr.slug === x));
      if (p.length === 0) sans++;
      for (const x of p) c.set(x, (c.get(x) ?? 0) + 1);
    }
    return { c, sans, total: s.index?.figures.length ?? 0 };
  }, [s.index, s.projets]);

  const ligne = (cle: string, libelle: string, n: number, valeur: string | null, depot: boolean) => (
    <li key={cle}>
      <button
        type="button"
        className={`projet-ligne${actif === valeur ? " actif" : ""}${survol === cle ? " survol" : ""}`}
        aria-current={actif === valeur ? "true" : undefined}
        title={libelle}
        onClick={() => s.setFilter({ projet: valeur })}
        onDragOver={
          depot
            ? (e) => {
                if (!e.dataTransfer.types.includes(GLISSE_FIGURE)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "link";
                setSurvol(cle);
              }
            : undefined
        }
        onDragLeave={depot ? () => setSurvol(null) : undefined}
        onDrop={
          depot && valeur
            ? (e) => {
                e.preventDefault();
                setSurvol(null);
                const dossier = e.dataTransfer.getData(GLISSE_FIGURE);
                if (dossier) void s.ajouterAuProjet([dossier], valeur);
              }
            : undefined
        }
      >
        <span className="projet-nom">{libelle}</span>
        <span className="muted small">{n}</span>
      </button>
    </li>
  );

  return (
    <nav className="projets-colonne" aria-label="Projets">
      <div className="projets-titre">Projets</div>
      <ul>
        {ligne("__tous", "Toutes les figures", compte.total, null, false)}
        {ligne("__sans", "Sans projet", compte.sans, SANS_PROJET, false)}
        {s.projets.projets.map((p) => ligne(p.slug, p.titre, compte.c.get(p.slug) ?? 0, p.slug, true))}
      </ul>
      {s.projets.problemes.length > 0 && (
        <p className="muted small" title={s.projets.problemes.map((p) => `${p.slug} : ${p.message}`).join("\n")}>
          {s.projets.problemes.length} dossier(s) de projet illisible(s).
        </p>
      )}
      {nouveau === null ? (
        <button type="button" className="link" onClick={() => setNouveau("")}>
          + Nouveau projet
        </button>
      ) : (
        <form
          className="projet-nouveau"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nouveau.trim()) return;
            void s.creerProjet(nouveau).then(() => setNouveau(null));
          }}
        >
          <input autoFocus value={nouveau} placeholder="Article, chapitre…" aria-label="Titre du projet" onChange={(e) => setNouveau(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNouveau(null)} />
          <div className="row">
            <button type="submit" className="primary" disabled={!nouveau.trim()}>
              Créer
            </button>
            <button type="button" onClick={() => setNouveau(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      <p className="muted small projets-aide">Glissez une figure sur un projet pour l'y ranger ; une figure peut être dans plusieurs projets.</p>
    </nav>
  );
}
