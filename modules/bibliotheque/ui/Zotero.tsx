/**
 * Panneau « Mettre à jour Zotero » : la clé d'API de ce poste, le réglage des PDF liés
 * dans Zotero, puis préparer (lecture de Zotero, plan) et envoyer. Aucune requête réseau
 * sans un clic sur l'un des boutons (SPEC §11).
 */
import { useState } from "react";
import { Message } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { REFERENCES, type Reference } from "../core/modele";
import {
  ClientZotero,
  compter,
  envoyer,
  ErreurZotero,
  lireZotero,
  NOM_COLLECTION,
  planifier,
  verifierCle,
  type Instantane,
  type Plan,
  type Rapport,
} from "../core/zotero";
import { ecrireEtatZotero, lireEtatZotero, lirePdfsPresents, type Biblio } from "./donnees";

const message = (e: unknown) => (e instanceof ErreurZotero || e instanceof Error ? e.message : String(e));
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${n} ${n > 1 ? plusieurs : un}`;

export function PanneauZotero({ b, enregistrer, onFermer }: { b: Biblio; enregistrer(id: string, r: Reference): Promise<unknown>; onFermer(): void }) {
  const ctx = useContexte();
  const compte = ctx.reglages.zotero;
  const fs = ctx.espace?.fichiers ?? null;
  const [cle, setCle] = useState("");
  const [changer, setChanger] = useState(false);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prepare, setPrepare] = useState<{ plan: Plan; instantane: Instantane; pdfs: Set<string> } | null>(null);
  const [progression, setProgression] = useState<{ fait: number; total: number; etape: string } | null>(null);
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [copie, setCopie] = useState(false);
  /** Dossier des PDF : `Espace\bibliotheque\pdf`, le répertoire de base à donner à Zotero. */
  const dossierPdf = ctx.racines["biblio-pdf"] ?? "";
  const prefixe = compte ? `/users/${compte.utilisateur}` : "";
  const client = (k: string) => new ClientZotero((r) => ctx.plateforme.zotero({ ...r, cle: k }));
  const fiches = b.references.map((r) => ({ id: r.id, ref: r.valeur }));

  async function tache(nom: string, f: () => Promise<void>) {
    setErreur(null);
    setOccupe(nom);
    try {
      await f();
    } catch (e) {
      setErreur(message(e));
    } finally {
      setOccupe(null);
      setProgression(null);
    }
  }

  const enregistrerCle = () =>
    tache("Vérification de la clé…", async () => {
      const k = cle.trim();
      if (!/^[A-Za-z0-9]{10,}$/.test(k)) throw new Error("Une clé d'API Zotero est faite de lettres et de chiffres (24 en général).");
      const c = await verifierCle(client(k));
      await ctx.enregistrerReglages({ ...ctx.reglages, zotero: { cle: k, ...c } });
      setCle("");
      setChanger(false);
      setPrepare(null);
    });

  const preparer = () =>
    tache("Lecture de votre bibliothèque Zotero…", async () => {
      if (!compte || !fs) return;
      setRapport(null);
      const [instantane, etat, pdfs] = await Promise.all([lireZotero(client(compte.cle), prefixe), lireEtatZotero(fs), dossierPdf ? lirePdfsPresents(ctx.plateforme.fichiers(dossierPdf), fiches) : new Set<string>()]);
      setPrepare({ plan: planifier(fiches, b.parametres, etat, instantane, `users/${compte.utilisateur}`, pdfs), instantane, pdfs });
    });

  const lancer = () =>
    tache("Envoi vers Zotero…", async () => {
      if (!compte || !fs || !prepare) return;
      const r = await envoyer({
        client: client(compte.cle),
        prefixe,
        fiches,
        parametres: b.parametres,
        plan: prepare.plan,
        instantane: prepare.instantane,
        etat: await lireEtatZotero(fs),
        pdfPresents: prepare.pdfs,
        sauver: (e) => ecrireEtatZotero(fs, e),
        progression: (fait, total, etape) => setProgression({ fait, total, etape }),
      });
      // « Dans Zotero » coché sur les fiches envoyées.
      for (const id of r.envoyees) {
        const o = b.references.find((x) => x.id === id);
        if (o && !o.valeur.dansZotero) await enregistrer(id, { ...o.valeur, dansZotero: true });
      }
      setRapport(r);
      setPrepare(null);
    });

  async function copier() {
    try {
      await navigator.clipboard.writeText(dossierPdf);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch {
      setErreur("Copie impossible : sélectionnez le chemin à la main.");
    }
  }

  const c = prepare ? compter(prepare.plan) : null;
  const ecrasees = prepare ? prepare.plan.actions.filter((a) => a.genre === "maj" && a.ecrase) : [];
  const douteuses = prepare ? prepare.plan.actions.filter((a) => a.genre === "douteuse") : [];
  const titreDe = (id: string) => b.references.find((r) => r.id === id)?.valeur.titre ?? id;
  const aEcrire = c ? c.creer + c.recreer + c.associer + c.maj : 0;

  return (
    <div className="carte zotero">
      <div className="rangee" style={{ justifyContent: "space-between" }}>
        <h3>Mettre à jour Zotero</h3>
        <button type="button" onClick={onFermer}>
          Fermer
        </button>
      </div>
      <p className="discret">
        Sens unique : Thèse est la source. Chaque fiche crée ou met à jour son entrée Zotero (collection « {NOM_COLLECTION} »), avec ses notes de
        lecture et son PDF <strong>lié</strong> (le fichier reste dans l'espace). Rien n'est supprimé dans Zotero ; vos étiquettes et collections
        Zotero sont gardées.
      </p>
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}

      <h4>1. Clé d'API {compte && !changer ? "✓" : ""}</h4>
      {compte && !changer ? (
        <p className="rangee">
          <span>
            Compte Zotero <strong>{compte.nom || compte.utilisateur}</strong> (n° {compte.utilisateur}), clé enregistrée sur ce PC.
          </span>
          <button type="button" onClick={() => setChanger(true)}>
            Changer de clé
          </button>
          <button type="button" onClick={() => void ctx.enregistrerReglages({ ...ctx.reglages, zotero: null }).then(() => setPrepare(null))}>
            Oublier la clé
          </button>
        </p>
      ) : (
        <>
          <p className="discret">
            Sur zotero.org, créez une clé avec « Allow library access », « Allow notes access » et « Allow write access ». Elle reste sur ce PC (pas
            dans OneDrive) : à refaire une fois sur l'autre PC.
          </p>
          <div className="rangee">
            <button type="button" onClick={() => void ctx.plateforme.ouvrirLien("https://www.zotero.org/settings/keys/new")}>
              Créer une clé sur zotero.org
            </button>
            <input className="champ" placeholder="Clé d'API" value={cle} onChange={(e) => setCle(e.target.value)} style={{ width: 260 }} aria-label="Clé d'API Zotero" />
            <button type="button" className="principal" disabled={!cle.trim() || occupe !== null} onClick={() => void enregistrerCle()}>
              Vérifier et enregistrer
            </button>
            {compte ? (
              <button type="button" onClick={() => setChanger(false)}>
                Annuler
              </button>
            ) : null}
          </div>
        </>
      )}

      <h4>2. PDF liés (une fois sur chaque PC)</h4>
      <p className="discret">
        Dans Zotero : <em>Édition → Paramètres → Avancé → Fichiers et dossiers → Répertoire de base des pièces jointes liées</em>, choisissez :
      </p>
      <p className="rangee">
        <code className="zotero-chemin">{dossierPdf}</code>
        <button type="button" onClick={() => void copier()}>
          {copie ? "Copié" : "Copier"}
        </button>
      </p>
      <p className="discret">Les PDF s'ouvrent alors depuis Zotero sur les deux PC, sans occuper le stockage Zotero (pas sur zotero.org ni l'iPad).</p>

      <h4>3. Envoyer</h4>
      <div className="rangee">
        <button type="button" disabled={!compte || occupe !== null} onClick={() => void preparer()}>
          Préparer
        </button>
        {prepare ? (
          <button type="button" className="principal" disabled={occupe !== null || aEcrire === 0} onClick={() => void lancer()}>
            Envoyer vers Zotero
          </button>
        ) : null}
        {occupe ? <span className="discret">{occupe}</span> : null}
        {progression && progression.total > 1 ? (
          <>
            <span className="discret">
              {progression.etape} : {progression.fait} / {progression.total}
            </span>
            <progress max={progression.total} value={progression.fait} />
          </>
        ) : null}
      </div>

      {prepare && c ? (
        <div className="zotero-plan">
          {prepare.plan.autreCompte ? <Message niveau="attention">Le dernier envoi visait un autre compte Zotero : les fiches sont rapprochées de zéro.</Message> : null}
          <ul>
            <li>{pluriel(c.creer, "entrée à créer", "entrées à créer")}</li>
            {c.associer ? <li>{pluriel(c.associer, "fiche déjà dans Zotero, reconnue", "fiches déjà dans Zotero, reconnues")} (identifiant, DOI ou titre) : complétée(s)</li> : null}
            {c.maj ? <li>{pluriel(c.maj, "entrée à mettre à jour", "entrées à mettre à jour")}</li> : null}
            {c.recreer ? <li>{pluriel(c.recreer, "entrée supprimée dans Zotero", "entrées supprimées dans Zotero")} : recréée(s)</li> : null}
            <li>{pluriel(c.inchangee, "inchangée", "inchangées")}</li>
            {prepare.plan.pdfAbsents.length ? (
              <li title={prepare.plan.pdfAbsents.map(titreDe).join("\n")}>
                {pluriel(prepare.plan.pdfAbsents.length, "PDF nommé dans une fiche mais absent", "PDF nommés dans les fiches mais absents")} de l'espace : pas de pièce
                jointe
              </li>
            ) : null}
          </ul>
          {ecrasees.length ? (
            <Message niveau="attention">
              {pluriel(ecrasees.length, "entrée a été modifiée", "entrées ont été modifiées")} dans Zotero depuis le dernier envoi ; les champs venant de
              Thèse y seront remplacés : {ecrasees.map((a) => a.id).join(", ")}.
            </Message>
          ) : null}
          {douteuses.length ? (
            <details>
              <summary>
                {pluriel(douteuses.length, "fiche laissée de côté", "fiches laissées de côté")} : plusieurs entrées Zotero lui ressemblent
              </summary>
              <ul>
                {douteuses.map((a) =>
                  a.genre === "douteuse" ? (
                    <li key={a.id}>
                      <strong>{a.id}</strong> {titreDe(a.id)} — {a.candidats.length} entrées possibles. Fusionnez les doublons dans Zotero (clic droit →
                      Fusionner) puis préparez à nouveau.
                    </li>
                  ) : null,
                )}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {rapport ? (
        <Message niveau={rapport.echecs.length ? "attention" : "info"}>
          Zotero à jour : {pluriel(rapport.crees, "entrée créée", "entrées créées")}, {rapport.associees} reconnue(s), {rapport.misesAJour} mise(s) à jour,{" "}
          {rapport.inchangees} inchangée(s) ; {pluriel(rapport.pdfLies, "PDF lié", "PDF liés")}, {pluriel(rapport.notes, "note", "notes")}.
          {rapport.pdfDejaLa.length ? ` ${rapport.pdfDejaLa.length} entrée(s) avaient déjà un PDF dans Zotero : pas de second.` : ""}
          {rapport.echecs.length ? (
            <>
              {" "}
              Refusé par Zotero :
              <ul>
                {rapport.echecs.map((e, i) => (
                  <li key={i}>
                    {e.id} : {e.message}
                  </li>
                ))}
              </ul>
              Ces fiches seront retentées au prochain envoi.
            </>
          ) : null}
        </Message>
      ) : null}
      <p className="discret petit">
        Fichier de suivi : <code>{REFERENCES.dossier.replace(/\/references$/, "")}/zotero.json</code> (clé Zotero de chaque fiche, dans l'espace).
      </p>
    </div>
  );
}
