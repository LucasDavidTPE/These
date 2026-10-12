/** Réglages de la lecture croisée : critères (colonnes), types de liens, vocabulaire (renommer, fusionner, définir). */
import { useMemo, useState } from "react";
import { Section } from "@interface/composants";
import { slugifier } from "@noyau/texte";
import { definir, renommerEtiquette, vocabulaire, type ObjetRef, type ReglagesLecture } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import { ChampTexte } from "../champs";

export function ReglagesVue({
  refs,
  reglages,
  enregistrerReglages,
  enregistrerLot,
}: {
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  enregistrerReglages(r: ReglagesLecture): void;
  enregistrerLot(modifiees: ObjetRef[]): Promise<void>;
}) {
  const [nouveau, setNouveau] = useState("");
  const [nouveauType, setNouveauType] = useState({ nom: "", inverse: "" });
  const [critere, setCritere] = useState(reglages.criteres[0]?.id ?? "");
  const voc = useMemo(() => vocabulaire(refs, critere, reglages), [refs, critere, reglages]);
  const majCritere = (i: number, champs: Partial<ReglagesLecture["criteres"][number]>) =>
    enregistrerReglages({ ...reglages, criteres: reglages.criteres.map((c, j) => (j === i ? { ...c, ...champs } : c)) });
  const deplacer = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= reglages.criteres.length) return;
    const c = [...reglages.criteres];
    [c[i], c[j]] = [c[j]!, c[i]!];
    enregistrerReglages({ ...reglages, criteres: c });
  };
  const ajouterCritere = () => {
    const nom = nouveau.trim();
    if (!nom) return;
    let id = slugifier(nom) || "critere";
    for (let k = 2; reglages.criteres.some((c) => c.id === id); k++) id = `${slugifier(nom) || "critere"}-${k}`;
    enregistrerReglages({ ...reglages, criteres: [...reglages.criteres, { id, nom, aide: "" }] });
    setNouveau("");
  };
  const supprimerCritere = async (id: string) => {
    const n = refs.filter((r) => r.valeur.lecture[id]).length;
    if (!window.confirm(`Supprimer ce critère ?${n ? ` Ses cases (${n} article(s)) sont effacées des fiches.` : ""}`)) return;
    const modifiees = refs
      .filter((r) => r.valeur.lecture[id])
      .map((r) => {
        const lecture = { ...r.valeur.lecture };
        delete lecture[id];
        return { id: r.id, valeur: { ...r.valeur, lecture } as Reference };
      });
    await enregistrerLot(modifiees);
    const definitions = { ...reglages.definitions };
    delete definitions[id];
    enregistrerReglages({ ...reglages, criteres: reglages.criteres.filter((c) => c.id !== id), definitions, croisements: reglages.croisements.filter(([a, b]) => a !== id && b !== id) });
  };

  return (
    <>
      <Section titre="Critères (colonnes de la grille)">
        <table className="tableau">
          <thead>
            <tr>
              <th />
              <th>Nom</th>
              <th>Ce qu'on y note</th>
              <th>Renseignés</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reglages.criteres.map((c, i) => (
              <tr key={c.id}>
                <td className="rangee">
                  <button type="button" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label="Monter">
                    ↑
                  </button>
                  <button type="button" disabled={i === reglages.criteres.length - 1} onClick={() => deplacer(i, 1)} aria-label="Descendre">
                    ↓
                  </button>
                </td>
                <td>
                  <ChampTexte valeur={c.nom} onValider={(v) => v.trim() && majCritere(i, { nom: v.trim() })} />
                </td>
                <td>
                  <ChampTexte valeur={c.aide} onValider={(v) => majCritere(i, { aide: v })} />
                </td>
                <td>{refs.filter((r) => r.valeur.lecture[c.id]).length}</td>
                <td>
                  <button type="button" className="lien" onClick={() => void supprimerCritere(c.id)}>
                    supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rangee">
          <input className="champ" value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder="Nouveau critère (Échelle, Matériau, Données expérimentales…)" style={{ width: 340 }} onKeyDown={(e) => e.key === "Enter" && ajouterCritere()} />
          <button type="button" disabled={!nouveau.trim()} onClick={ajouterCritere}>
            Ajouter
          </button>
        </div>
        <p className="discret petit">Renommer un critère renomme aussi sa colonne dans Excel à la prochaine synchronisation (synchronisez avant de le renommer si le classeur a des modifications).</p>
      </Section>

      <Section titre="Types de liens entre articles">
        <table className="tableau">
          <thead>
            <tr>
              <th>A … B</th>
              <th>Vu depuis B</th>
              <th>Liens</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reglages.typesLiens.map((t, i) => {
              const n = refs.reduce((s, r) => s + r.valeur.liens.filter((l) => l.type === t.id).length, 0);
              const maj = (champs: Partial<typeof t>) => enregistrerReglages({ ...reglages, typesLiens: reglages.typesLiens.map((x, j) => (j === i ? { ...x, ...champs } : x)) });
              return (
                <tr key={t.id}>
                  <td>
                    <ChampTexte valeur={t.nom} onValider={(v) => v.trim() && maj({ nom: v.trim() })} />
                  </td>
                  <td>
                    <ChampTexte valeur={t.inverse} onValider={(v) => maj({ inverse: v.trim() || t.nom })} />
                  </td>
                  <td>{n}</td>
                  <td>
                    {n ? (
                      <span className="discret petit">utilisé</span>
                    ) : (
                      <button type="button" className="lien" onClick={() => enregistrerReglages({ ...reglages, typesLiens: reglages.typesLiens.filter((x) => x.id !== t.id) })}>
                        supprimer
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="rangee">
          <input className="champ" value={nouveauType.nom} onChange={(e) => setNouveauType({ ...nouveauType, nom: e.target.value })} placeholder="nouveau type (« valide »)" />
          <input className="champ" value={nouveauType.inverse} onChange={(e) => setNouveauType({ ...nouveauType, inverse: e.target.value })} placeholder="vu depuis l'autre (« est validé par »)" />
          <button
            type="button"
            disabled={!nouveauType.nom.trim()}
            onClick={() => {
              let id = slugifier(nouveauType.nom) || "lien";
              for (let k = 2; reglages.typesLiens.some((t) => t.id === id); k++) id = `${slugifier(nouveauType.nom) || "lien"}-${k}`;
              enregistrerReglages({ ...reglages, typesLiens: [...reglages.typesLiens, { id, nom: nouveauType.nom.trim(), inverse: nouveauType.inverse.trim() || nouveauType.nom.trim() }] });
              setNouveauType({ nom: "", inverse: "" });
            }}
          >
            Ajouter
          </button>
        </div>
      </Section>

      <Section titre="Vocabulaire">
        <div className="filtres">
          <select className="champ" value={critere} onChange={(e) => setCritere(e.target.value)} aria-label="Critère">
            {reglages.criteres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          <span className="discret petit">Renommer une étiquette sous le nom d'une autre les fusionne ; un nom vide la retire de toutes les fiches.</span>
        </div>
        <table className="tableau">
          <thead>
            <tr>
              <th>Étiquette</th>
              <th>Articles</th>
              <th>Définition</th>
            </tr>
          </thead>
          <tbody>
            {voc.map((e) => (
              <tr key={e.cle}>
                <td>
                  <ChampTexte
                    valeur={e.etiquette}
                    onValider={(v) => {
                      if (v.trim() === e.etiquette) return;
                      if (!v.trim() && !window.confirm(`Retirer « ${e.etiquette} » de ${e.ids.length} fiche(s) ?`)) return;
                      void enregistrerLot(renommerEtiquette(refs, critere, e.etiquette, v)).then(() => {
                        if (e.definition && v.trim()) enregistrerReglages(definir(definir(reglages, critere, e.etiquette, ""), critere, v, e.definition));
                      });
                    }}
                  />
                </td>
                <td>{e.ids.length}</td>
                <td>
                  <ChampTexte multiligne valeur={e.definition} onValider={(v) => enregistrerReglages(definir(reglages, critere, e.etiquette, v))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
