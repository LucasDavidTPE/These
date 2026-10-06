/** Dans la fiche d'une référence : ses cases de la grille de lecture et ses liens vers d'autres articles. */
import { useMemo, useState } from "react";
import { Section } from "@interface/composants";
import { citation } from "../../core/calculs";
import { avecCellule, cleEtiquette, delier, lier, liensDe, vocabulaire, type ObjetRef, type ReglagesLecture } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import { EditeurEtiquettes, Puces } from "./Etiquettes";

export function LectureFiche({
  id,
  r,
  refs,
  reglages,
  enregistrer,
  enregistrerAutre,
  ouvrir,
}: {
  id: string;
  r: Reference;
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  enregistrer(r: Reference): void;
  /** Enregistre une autre fiche (lien entrant retiré depuis celle-ci). */
  enregistrerAutre(id: string, r: Reference): void;
  ouvrir(id: string): void;
}) {
  const [edition, setEdition] = useState<string | null>(null);
  const [type, setType] = useState(reglages.typesLiens[0]?.id ?? "");
  const [recherche, setRecherche] = useState("");
  const [note, setNote] = useState("");
  const [cible, setCible] = useState<string | null>(null);
  const tous = useMemo(() => refs.map((x) => (x.id === id ? { id, valeur: r } : x)), [refs, id, r]);
  const liens = liensDe(tous, id, reglages.typesLiens);
  const parId = new Map(tous.map((x) => [x.id, x.valeur]));
  const nomRef = (x: string) => (parId.get(x) ? citation(parId.get(x)!) || parId.get(x)!.titre.slice(0, 50) : x);
  const candidats = useMemo(() => {
    const q = cleEtiquette(recherche);
    if (!q) return [];
    return tous.filter((x) => x.id !== id && cleEtiquette(`${x.id} ${citation(x.valeur)} ${x.valeur.titre}`).includes(q)).slice(0, 8);
  }, [tous, id, recherche]);

  return (
    <Section titre="Lecture croisée">
      <div className="lc-fiche">
        {reglages.criteres.map((c) => (
          <div key={c.id} className="lc-fiche-ligne">
            <span className="discret" title={c.aide || undefined}>
              {c.nom}
            </span>
            {edition === c.id ? (
              <EditeurEtiquettes autoFocus valeur={r.lecture[c.id]} vocabulaire={vocabulaire(tous, c.id, reglages)} aide={c.aide} onValider={(cell) => enregistrer(avecCellule(r, c.id, cell))} onFermer={() => setEdition(null)} />
            ) : (
              <button type="button" className="lc-case-bouton" onClick={() => setEdition(c.id)}>
                {r.lecture[c.id] ? <Puces c={r.lecture[c.id]} /> : <span className="discret">—</span>}
              </button>
            )}
          </div>
        ))}
      </div>
      <h3 className="lc-sous-titre">Liens avec d'autres articles</h3>
      {liens.length ? (
        <ul className="lc-liens">
          {liens.map((l) => (
            <li key={`${l.sens}|${l.type}|${l.id}`}>
              <span className="discret">{l.libelle}</span>{" "}
              <button type="button" className="lien" onClick={() => ouvrir(l.id)} title={parId.get(l.id)?.titre}>
                {nomRef(l.id)}
              </button>
              {l.note ? <span className="discret"> — {l.note}</span> : null}{" "}
              <button
                type="button"
                className="lien petit"
                onClick={() => (l.sens === "sortant" ? enregistrer(delier(r, l.id, l.type)) : parId.get(l.id) && enregistrerAutre(l.id, delier(parId.get(l.id)!, id, l.type)))}
              >
                retirer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="discret petit">Aucun lien. Exemple : cet article « étend » un autre, « contredit » un résultat, « utilise les données de »…</p>
      )}
      <div className="rangee lc-ajout-lien">
        <span>Cet article</span>
        <select className="champ" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de lien">
          {reglages.typesLiens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>
        <span className="lc-cible">
          <input
            className="champ"
            value={cible ? nomRef(cible) : recherche}
            placeholder="article (auteur, titre, BIB-…)"
            aria-label="Article visé"
            onChange={(e) => (setCible(null), setRecherche(e.target.value))}
          />
          {!cible && candidats.length ? (
            <ul className="lc-suggestions">
              {candidats.map((x) => (
                <li key={x.id} onMouseDown={(e) => (e.preventDefault(), setCible(x.id), setRecherche(""))}>
                  <strong>{citation(x.valeur) || x.id}</strong> <span className="discret petit">{x.valeur.titre}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </span>
        <input className="champ" value={note} placeholder="note (facultative)" onChange={(e) => setNote(e.target.value)} aria-label="Note du lien" />
        <button
          type="button"
          disabled={!cible || !type}
          onClick={() => {
            if (!cible) return;
            enregistrer(lier({ id, valeur: r }, { vers: cible, type, note }));
            setCible(null);
            setNote("");
          }}
        >
          Lier
        </button>
      </div>
    </Section>
  );
}
