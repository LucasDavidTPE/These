/** Demandes et pistes non couvertes (SPEC §9.2). */
import { alerteDemande, dateLimite, relanceLe } from "../core/calculs";
import { STATUTS_DEMANDE, STATUTS_PISTE, type Demande, type Piste } from "../core/modele";
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
