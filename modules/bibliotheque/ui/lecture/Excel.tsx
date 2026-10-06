/**
 * Synchronisation avec le classeur Excel « Lecture croisee.xlsx » : création, fusion à trois voies, conflits
 * à trancher, avertissements. Le classeur est écrit d'abord : s'il est ouvert dans Excel (verrouillé), rien
 * n'est modifié dans l'appli.
 */
import { useState } from "react";
import { Message } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { absolu } from "@noyau/stockage";
import type { ObjetRef, ReglagesLecture } from "../../core/lecture";
import {
  appliquer,
  construireClasseur,
  ecrireSynchro,
  empreinte,
  etatAppli,
  FICHIER_CLASSEUR,
  FICHIER_SYNCHRO,
  fusionner,
  lireClasseur,
  trancherConflits,
  type Etat,
  type Fusion,
} from "../../core/lectureExcel";
import { ecrireFiches, ecrireReglages, type EtatClasseur } from "./donnees";

interface Bilan {
  depuisExcel: number;
  versExcel: number;
  avertissements: string[];
}

export function ExcelVue({ refs, reglages, etat, relire }: { refs: ObjetRef[]; reglages: ReglagesLecture; etat: EtatClasseur | null; relire(): void }) {
  const ctx = useContexte();
  const espace = ctx.espace!;
  const fs = espace.fichiers;
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [enCours, setEnCours] = useState<{ fusion: Fusion; avertissements: string[] } | null>(null);
  const [choix, setChoix] = useState<Record<string, "appli" | "excel">>({});

  /** Écrit le classeur puis l'appli et l'état de synchro. */
  async function finaliser(retenu: Etat, b: Omit<Bilan, "avertissements">, avertissements: string[]) {
    const { modifiees, reglages: nouveaux } = appliquer(refs, reglages, retenu);
    const parId = new Map(modifiees.map((m) => [m.id, m.valeur]));
    const refsApres = refs.map((r) => ({ id: r.id, valeur: parId.get(r.id) ?? r.valeur }));
    const octets = construireClasseur(refsApres, nouveaux, retenu);
    try {
      await fs.writeBytesAtomic(FICHIER_CLASSEUR, octets);
    } catch (e) {
      throw new Error(`Le classeur n'a pas pu être écrit (${e instanceof Error ? e.message : String(e)}). S'il est ouvert dans Excel, enregistrez-le et fermez-le, puis recommencez : rien n'a été modifié.`, { cause: e });
    }
    await ecrireFiches(fs, modifiees);
    if (nouveaux !== reglages) await ecrireReglages(fs, nouveaux);
    await fs.writeTextAtomic(FICHIER_SYNCHRO, ecrireSynchro({ empreinte: empreinte(octets), date: new Date().toISOString(), etat: retenu }));
    setBilan({ ...b, avertissements });
    setEnCours(null);
    setChoix({});
    relire();
  }

  async function synchroniser() {
    setOccupe(true);
    setErreur(null);
    setBilan(null);
    try {
      const appli = etatAppli(refs, reglages);
      if (!(await fs.exists(FICHIER_CLASSEUR))) {
        await finaliser(appli, { depuisExcel: 0, versExcel: 0 }, []);
        return;
      }
      const octets = await fs.readBytes(FICHIER_CLASSEUR);
      const lu = lireClasseur(octets, refs, reglages);
      const base = etat?.synchro?.etat ?? null;
      const f = fusionner(base, appli, lu, reglages);
      if (f.conflits.length) {
        setEnCours({ fusion: f, avertissements: lu.avertissements });
        setChoix({});
        return;
      }
      await finaliser(f.etat, { depuisExcel: f.depuisExcel, versExcel: f.versExcel }, lu.avertissements);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  async function appliquerChoix() {
    if (!enCours) return;
    setOccupe(true);
    setErreur(null);
    try {
      const retenu = trancherConflits(enCours.fusion, choix);
      const viaExcel = Object.values(choix).filter((c) => c === "excel").length;
      await finaliser(retenu, { depuisExcel: enCours.fusion.depuisExcel + viaExcel, versExcel: enCours.fusion.versExcel + enCours.fusion.conflits.length - viaExcel }, enCours.avertissements);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  const chemin = absolu(espace.racine, FICHIER_CLASSEUR);
  const date = etat?.synchro?.date ? new Date(etat.synchro.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <>
      <div className="carte">
        <p>
          Le classeur <code>{FICHIER_CLASSEUR}</code> (dans l'espace, donc sur les deux PC) reprend la grille, les liens, le vocabulaire et les croisements. Modifiez-le
          librement dans Excel, enregistrez, fermez, puis synchronisez : ce qui a changé d'un seul côté passe de l'autre, ce qui a changé des deux côtés vous est
          présenté.
        </p>
        <p className="discret petit">
          {!etat?.existe ? "Pas encore de classeur : la première synchronisation le crée." : date ? `Dernière synchronisation : ${date}.` : "Classeur présent, jamais synchronisé depuis ce dossier."}
          {etat?.existe && etat.modifie ? " Il a été modifié depuis." : ""}
        </p>
        <div className="rangee">
          <button type="button" className="principal" disabled={occupe || !!enCours} onClick={() => void synchroniser()}>
            {occupe ? "Synchronisation…" : etat?.existe ? "Synchroniser avec Excel" : "Créer le classeur Excel"}
          </button>
          {etat?.existe ? (
            <>
              <button type="button" onClick={() => void ctx.plateforme.ouvrirDossier(chemin)}>
                Ouvrir dans Excel
              </button>
              <button type="button" onClick={() => void ctx.plateforme.ouvrirDossier(chemin.slice(0, Math.max(chemin.lastIndexOf("\\"), chemin.lastIndexOf("/"))))}>
                Ouvrir le dossier
              </button>
            </>
          ) : null}
        </div>
      </div>
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      {bilan ? (
        <Message niveau={bilan.avertissements.length ? "attention" : "info"}>
          Synchronisé : {bilan.depuisExcel} modification(s) reprise(s) d'Excel, {bilan.versExcel} envoyée(s) vers Excel.
          {bilan.avertissements.length ? (
            <ul>
              {bilan.avertissements.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
        </Message>
      ) : null}
      {enCours ? (
        <div className="carte">
          <strong>
            {enCours.fusion.conflits.length} modification(s) faite(s) des deux côtés depuis la dernière synchronisation : choisissez la version à garder.
          </strong>
          <p className="discret petit">
            Le reste ({enCours.fusion.depuisExcel} reprise(s) d'Excel, {enCours.fusion.versExcel} envoyée(s) vers Excel) sera appliqué en même temps.
          </p>
          <table className="tableau lc-conflits">
            <thead>
              <tr>
                <th>Où</th>
                <th>Dans l'appli</th>
                <th>Dans Excel</th>
              </tr>
            </thead>
            <tbody>
              {enCours.fusion.conflits.map((c) => (
                <tr key={c.cle}>
                  <td>{c.libelle}</td>
                  {(["appli", "excel"] as const).map((cote) => (
                    <td key={cote}>
                      <label className="rangee">
                        <input type="radio" name={c.cle} checked={(choix[c.cle] ?? "appli") === cote} onChange={() => setChoix({ ...choix, [c.cle]: cote })} />
                        <span>{(cote === "appli" ? c.appli : c.excel) || <em className="discret">(vide)</em>}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rangee">
            <button type="button" onClick={() => setChoix(Object.fromEntries(enCours.fusion.conflits.map((c) => [c.cle, "excel"])))}>
              Tout prendre d'Excel
            </button>
            <button type="button" onClick={() => setChoix({})}>
              Tout prendre de l'appli
            </button>
            <button type="button" className="principal" disabled={occupe} onClick={() => void appliquerChoix()}>
              Appliquer et synchroniser
            </button>
            <button type="button" onClick={() => setEnCours(null)}>
              Annuler
            </button>
          </div>
          {enCours.avertissements.length ? (
            <ul className="discret petit">
              {enCours.avertissements.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <details>
        <summary>Écrire dans le classeur</summary>
        <ul className="petit">
          <li>
            Grille : une case = des étiquettes séparées par « ; », puis une note facultative après « | ». Exemple : <code>MEF 3D; Burmister | maillage grossier</code>.
          </li>
          <li>Les colonnes grises (ID, référence, titre, année, statut) viennent de l'appli ; ne renommez pas les titres de colonnes. Trier, filtrer, déplacer : sans effet.</li>
          <li>Liens : une ligne par lien (ID de départ, type choisi dans la liste, ID d'arrivée, note). Supprimer la ligne retire le lien.</li>
          <li>Vocabulaire : la colonne Définition est reprise dans l'appli ; une ligne ajoutée définit une étiquette.</li>
          <li>Croisement : recalculé à chaque synchronisation (cases orangées = combinaisons qu'aucun article ne traite).</li>
        </ul>
      </details>
    </>
  );
}
