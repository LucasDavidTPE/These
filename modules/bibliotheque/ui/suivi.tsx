/** Demandes, corrections du TFE, pistes non couvertes, analyse croisée (SPEC §9.2). */
import { useMemo } from "react";
import { Section } from "@interface/composants";
import { alerteDemande, dateLimite, relanceLe } from "../core/calculs";
import { STATUTS_DEMANDE, STATUTS_PISTE, type Correction, type Demande, type Piste } from "../core/modele";
import { ChampChoix, ChampTexte } from "./champs";
import { PastilleEtat } from "./commun";
import { dateFr } from "./format";
import type { Biblio } from "./donnees";

export function DemandesVue({ b, enregistrer }: { b: Biblio; enregistrer(id: string, d: Demande): void }) {
  return (
    <table className="tableau">
      <thead>
        <tr>
          <th>N°</th>
          <th>Document</th>
          <th>Interlocuteur</th>
          <th>Mois d'usage</th>
          <th>À envoyer avant le</th>
          <th>Date d'envoi</th>
          <th>Statut</th>
          <th>Relance le</th>
          <th>Alerte</th>
        </tr>
      </thead>
      <tbody>
        {b.demandes.map(({ id, valeur: d }) => (
          <tr key={id}>
            <td className="chemin">{id}</td>
            <td>
              <strong>{d.document}</strong>
              <div className="discret petit">{d.pourquoi}</div>
            </td>
            <td>{d.interlocuteur}</td>
            <td>{d.moisUsage}</td>
            <td className="nowrap">{dateFr(dateLimite(d, b.parametres))}</td>
            <td>
              <ChampTexte type="date" valeur={d.dateEnvoi} onValider={(v) => enregistrer(id, { ...d, dateEnvoi: v, statut: v && d.statut === "À envoyer" ? "Envoyée" : d.statut })} />
            </td>
            <td>
              <ChampChoix valeur={d.statut} options={STATUTS_DEMANDE} onValider={(v) => enregistrer(id, { ...d, statut: v })} />
            </td>
            <td className="nowrap">{dateFr(relanceLe(d, b.parametres))}</td>
            <td>
              <PastilleEtat etat={alerteDemande(d, b.parametres, b.aujourdhui)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CorrectionsVue({ b, enregistrer }: { b: Biblio; enregistrer(id: string, c: Correction): void }) {
  return (
    <table className="tableau">
      <thead>
        <tr>
          <th>Clé</th>
          <th>Champ</th>
          <th>Ce que dit le TFE</th>
          <th>Correction</th>
          <th>Justification et source</th>
          <th>Corrigé</th>
        </tr>
      </thead>
      <tbody>
        {b.corrections.map(({ id, valeur: c }) => (
          <tr key={id} className={c.corrige ? "lue" : undefined}>
            <td className="chemin">{c.cle}</td>
            <td>{c.champ}</td>
            <td>{c.tfe}</td>
            <td>
              <strong>{c.correction}</strong>
            </td>
            <td className="discret petit">{c.justification}</td>
            <td>
              <input type="checkbox" checked={c.corrige} aria-label="Corrigé" onChange={(e) => enregistrer(id, { ...c, corrige: e.target.checked })} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PistesVue({ b, enregistrer }: { b: Biblio; enregistrer(id: string, p: Piste): void }) {
  return (
    <table className="tableau">
      <thead>
        <tr>
          <th>Sujet</th>
          <th>Axe</th>
          <th>Constat</th>
          <th>Suite à donner</th>
          <th>Statut</th>
          <th>Référence trouvée</th>
        </tr>
      </thead>
      <tbody>
        {b.pistes.map(({ id, valeur: p }) => (
          <tr key={id}>
            <td>
              <strong>{p.sujet}</strong>
            </td>
            <td>{p.axe}</td>
            <td className="petit">{p.constat}</td>
            <td className="petit">{p.suite}</td>
            <td>
              <ChampChoix valeur={p.statut} options={STATUTS_PISTE} onValider={(v) => enregistrer(id, { ...p, statut: v })} />
            </td>
            <td>
              <ChampTexte valeur={p.referenceTrouvee} onValider={(v) => enregistrer(id, { ...p, referenceTrouvee: v })} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AnalyseVue({ b, enregistrer }: { b: Biblio; enregistrer(texte: string): void }) {
  // Matrice croisée recalculée : nombre de références par catégorie et par axe.
  const { groupes, axes } = useMemo(() => {
    const cats = [...new Set(b.references.flatMap((r) => r.valeur.categories))];
    const groupes = new Map<string, string[]>();
    for (const c of cats) {
      const [g = "", n = c] = c.split(" / ");
      groupes.set(g, [...(groupes.get(g) ?? []), n]);
    }
    return { groupes, axes: b.parametres.axes };
  }, [b]);
  const compte = (cat: string, axe: number | null) => b.references.filter((r) => r.valeur.categories.includes(cat) && (axe === null || r.valeur.axe === axe)).length;
  return (
    <>
      <Section titre="Matrice croisée (calculée)">
        <div className="defilement">
          <table className="tableau matrice">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Total</th>
                {axes.map((a) => (
                  <th key={a.numero} title={a.intitule}>
                    Axe {a.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...groupes].flatMap(([g, noms]) => [
                <tr key={g} className="groupe">
                  <td colSpan={axes.length + 2}>{g}</td>
                </tr>,
                ...noms.map((n) => {
                  const cat = `${g} / ${n}`;
                  return (
                    <tr key={cat}>
                      <td>{n}</td>
                      <td className="gras">{compte(cat, null)}</td>
                      {axes.map((a) => {
                        const v = compte(cat, a.numero);
                        return (
                          <td key={a.numero} style={{ opacity: v ? 1 : 0.3 }}>
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
      </Section>
      <Section titre="Synthèses rédigées">
        <p className="discret">Texte libre (Markdown), repris de la feuille « Analyse croisée ». Enregistré en quittant le champ.</p>
        <ChampTexte multiligne valeur={b.analyse} onValider={enregistrer} />
      </Section>
    </>
  );
}
