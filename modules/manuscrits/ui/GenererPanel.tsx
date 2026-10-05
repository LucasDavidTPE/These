/**
 * « Générer le manuscrit » : fusionne les parties du plan en un seul .docx, rangé dans
 * `manuscrits/<manuscrit>/sorties/`, avec un rapport (parties, sections, avertissements).
 * Le document produit n'est jamais édité à la main : on le régénère.
 */
import { useState } from "react";
import { Message } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { absolu } from "@noyau/stockage";
import { fusionner, type Rapport } from "../core/fusion";
import { nomSortie, type Manuscrit } from "../core/plan";
import { ecrireSortie, lirePartiesFusion } from "./generer";

interface Sortie {
  nom: string;
  chemin: string;
  octets: number;
  rapport: Rapport;
  repli: string[];
  duree: number;
}

const mo = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} ko` : `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`);

export function GenererPanel({ projet, m, sauver }: { projet: string; m: Manuscrit; sauver(m: Manuscrit): Promise<void> }) {
  const ctx = useContexte();
  const espace = ctx.espace!;
  const [mode, setMode] = useState<"relecture" | "propre">("relecture");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string[] | null>(null);
  const [sortie, setSortie] = useState<Sortie | null>(null);

  async function generer() {
    setOccupe(true);
    setErreur(null);
    setSortie(null);
    try {
      const lues = await lirePartiesFusion(ctx, projet, m);
      if (lues.manquantes.length) return setErreur(["La fusion est impossible :", ...lues.manquantes]);
      // laisse l'interface afficher « Fusion en cours… » avant le calcul
      await new Promise((ok) => setTimeout(ok, 30));
      const debut = performance.now();
      const { octets, rapport } = fusionner(lues.parties, { mode, titre: m.titre, saut: m.fusion.saut, nettoyage: m.fusion.nettoyage });
      const nom = nomSortie(m, mode);
      const chemin = await ecrireSortie(espace.fichiers, projet, nom, octets);
      setSortie({ nom, chemin, octets: octets.length, rapport, repli: lues.repli, duree: Math.round(performance.now() - debut) });
    } catch (e) {
      setErreur([`Fusion impossible : ${e instanceof Error ? e.message : String(e)}`, "Si le document produit est ouvert dans Word, fermez-le et recommencez."]);
    } finally {
      setOccupe(false);
    }
  }

  const avertissements = sortie ? [...sortie.repli.map((message) => ({ partie: "", message })), ...sortie.rapport.avertissements] : [];

  return (
    <div className="carte ms-generer">
      <div className="rangee">
        <strong>Générer le manuscrit</strong>
        <select className="champ" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Version à générer">
          <option value="relecture">Relecture complète (consignes gardées)</option>
          <option value="propre">Version propre (sans consignes)</option>
        </select>
        <label className="rangee petit" title="Chaque chapitre, la bibliographie et les annexes commencent sur une page de droite : pour l'impression recto-verso">
          <input type="checkbox" checked={m.fusion.saut === "oddPage"} onChange={(e) => void sauver({ ...m, fusion: { ...m.fusion, saut: e.target.checked ? "oddPage" : "nextPage" } })} /> chapitres sur page impaire
        </label>
        <button type="button" className="principal" disabled={occupe} onClick={() => void generer()}>
          {occupe ? "Fusion en cours…" : "Générer"}
        </button>
      </div>
      <p className="discret petit">
        Met les parties bout à bout dans l'ordre du plan (ou aux repères « ◆ Insérer ici : fichier.docx » du document maître), garde les en-têtes et la pagination de chaque
        chapitre, et range le résultat dans <code>manuscrits/{projet}/sorties/</code>. Les fichiers Word ne sont pas modifiés.
      </p>
      {erreur ? (
        <Message niveau="erreur">
          {erreur.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </Message>
      ) : null}
      {sortie ? (
        <>
          <Message niveau={avertissements.length ? "attention" : "info"}>
            <strong>{sortie.nom}</strong> : {sortie.rapport.parties.length} parties {sortie.rapport.assemblage === "reperes" ? "insérées aux repères du document maître" : "mises à la suite"},{" "}
            {sortie.rapport.paragraphes.toLocaleString("fr-FR")} paragraphes, {sortie.rapport.sections} sections, {mo(sortie.octets)}, en {sortie.duree} ms
            {avertissements.length ? ` — ${avertissements.length} point${avertissements.length > 1 ? "s" : ""} à voir` : ""}.
          </Message>
          <div className="rangee">
            <button type="button" className="principal" onClick={() => void ctx.plateforme.ouvrirDossier(absolu(espace.racine, sortie.chemin))}>
              Ouvrir dans Word
            </button>
            <button type="button" onClick={async () => ctx.plateforme.enregistrerSous(sortie.nom, await espace.fichiers.readBytes(sortie.chemin))}>
              Copie sous…
            </button>
            <button type="button" onClick={() => void ctx.plateforme.ouvrirDossier(absolu(espace.racine, sortie.chemin.slice(0, sortie.chemin.lastIndexOf("/"))))}>
              Dossier des sorties
            </button>
          </div>
          <p className="discret petit">
            À l'ouverture, Word propose de mettre à jour les champs : répondez <strong>Oui</strong> (table des matières, listes des figures et des tableaux). Puis <em>Zotero → Refresh</em> pour construire
            la bibliographie.
          </p>
          {avertissements.length ? (
            <details open>
              <summary>
                À voir ({avertissements.length})
              </summary>
              <ul className="ms-avertissements">
                {avertissements.map((a, i) => (
                  <li key={i}>
                    {a.partie ? <strong>{a.partie} : </strong> : null}
                    {a.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <details>
            <summary>Parties ({sortie.rapport.parties.length})</summary>
            <table className="tableau">
              <thead>
                <tr>
                  <th>Partie</th>
                  <th>Blocs repris</th>
                  <th>Blocs retirés</th>
                </tr>
              </thead>
              <tbody>
                {sortie.rapport.parties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nom}</td>
                    <td>{p.blocs}</td>
                    <td>{p.retires}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : null}
    </div>
  );
}
