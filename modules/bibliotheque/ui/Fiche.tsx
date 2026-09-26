/**
 * Fiche d'une référence (SPEC §9.2) : ce que le classeur répartissait sur Références,
 * Lecture détaillée et Notes de lecture, sur une seule page. Tout est modifiable.
 */
import { useState } from "react";
import { resoudre } from "@noyau/poste/racines";
import { Message, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { libelleMois, type Calcule } from "../core/calculs";
import { cleProposee, depuisCrossref, urlCrossref } from "../core/doi";
import { ACCES_DOCUMENT, PRIORITES, STATUTS, VERIFICATIONS, type FicheLecture, type NotesLecture, type Reference } from "../core/modele";
import { ChampChoix, ChampTexte, Libelle } from "./champs";
import { PastilleEtat } from "./commun";
import { aujourdhui, type Biblio } from "./donnees";

const FICHE: [keyof FicheLecture, string][] = [
  ["objectif", "Objectif"],
  ["methode", "Méthode"],
  ["resultats", "Résultats annoncés"],
  ["limites", "Limites"],
  ["pourThese", "Pour ta thèse"],
  ["aVerifier", "À vérifier en lisant"],
];
const DIMENSIONS: [keyof FicheLecture, string][] = [
  ["pneu", "Pneu"],
  ["contact", "Contact"],
  ["loi", "Loi de comportement"],
  ["methodeCategorie", "Méthode (catégorie)"],
  ["chargement", "Chargement"],
  ["cible", "Cible"],
  ["validation", "Validation"],
];
const NOTES: [keyof NotesLecture, string][] = [
  ["apport", "Apport central (reformulé)"],
  ["lien", "Lien avec mes travaux"],
  ["equations", "Équations, valeurs, figures à retenir"],
  ["chapitre", "Chapitre de thèse visé"],
  ["aCiter", "À citer"],
];

export function Fiche({ b, c, onEnregistrer, onFermer }: { b: Biblio; c: Calcule; onEnregistrer(r: Reference): void; onFermer(): void }) {
  const ctx = useContexte();
  const [erreur, setErreur] = useState<string | null>(null);
  const [doi, setDoi] = useState("");
  const [recherche, setRecherche] = useState(false);

  /** Métadonnées Crossref : requête réseau seulement sur ce clic (SPEC §11). */
  async function remplirDepuisDoi(valeur: string) {
    setRecherche(true);
    setErreur(null);
    try {
      const rep = await fetch(urlCrossref(valeur), { headers: { Accept: "application/json" } });
      if (!rep.ok) throw new Error(rep.status === 404 ? "DOI inconnu de Crossref." : `Crossref a répondu ${rep.status}.`);
      const m = depuisCrossref(await rep.json());
      const suite = { ...r, ...Object.fromEntries(Object.entries(m).filter(([, v]) => v !== "" && v !== null)) } as Reference;
      if (!r.cle || r.cle.startsWith("nouvelle")) suite.cle = cleProposee(suite);
      onEnregistrer({ ...suite, verifieLe: new Date().toISOString().slice(0, 10) });
    } catch (e) {
      setErreur(`Remplissage depuis le DOI impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRecherche(false);
    }
  }
  const r = c.ref;
  const maj = (champ: Partial<Reference>) => onEnregistrer({ ...r, ...champ });
  const t = (k: keyof Reference) => (v: string) => maj({ [k]: v } as Partial<Reference>);
  const n = (k: keyof Reference) => (v: string) => maj({ [k]: v === "" ? null : Number(v) } as Partial<Reference>);

  const lien = r.url || (r.doi ? `https://doi.org/${r.doi}` : "");
  const lienAvecProxy = b.parametres.proxy && r.accesDocument === "Éditeur (abonnement)" ? b.parametres.proxy + lien : lien;
  const ouvrirPdf = () => {
    const res = resoudre(`biblio-pdf:${r.fichierPdf}`, ctx.reglages.racines);
    if (res.ok) void ctx.plateforme.ouvrirDossier(res.chemin).catch((e: unknown) => setErreur(String(e)));
    else setErreur(`${res.message} Déclarez le dossier des PDF (racine « biblio-pdf ») dans les réglages du poste.`);
  };

  return (
    <div className="fiche">
      <div className="fiche-entete">
        <button type="button" onClick={onFermer}>
          ← Références
        </button>
        <div>
          <div className="discret chemin">
            {c.id} · {r.cle}
          </div>
          <h2>{r.titre || "(sans titre)"}</h2>
          <div>
            {c.citation} · {r.support} <PastilleEtat etat={c.etat} /> {c.alerte ? <span className="texte-attention"> {c.alerte}</span> : null}
          </div>
        </div>
      </div>
      <div className="rangee" style={{ margin: "10px 0 16px" }}>
        {r.statut !== "Lu" ? (
          <button type="button" className="principal" onClick={() => maj({ statut: "Lu", dateLecture: aujourdhui() })}>
            Marquer lu
          </button>
        ) : null}
        {lien ? (
          <button type="button" onClick={() => void ctx.plateforme.ouvrirLien(lienAvecProxy)}>
            Ouvrir le lien
          </button>
        ) : null}
        {r.doi ? (
          <button type="button" onClick={() => void ctx.plateforme.ouvrirLien(`https://doi.org/${r.doi}`)}>
            doi.org
          </button>
        ) : null}
        {r.urlRecherche ? (
          <button type="button" onClick={() => void ctx.plateforme.ouvrirLien(r.urlRecherche)}>
            Scholar
          </button>
        ) : null}
        {r.fichierPdf ? (
          <button type="button" onClick={ouvrirPdf}>
            Ouvrir le PDF
          </button>
        ) : null}
      </div>
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}

      <Section titre="Lecture">
        <div className="grille-champs">
          <Libelle titre="Statut">
            <ChampChoix valeur={r.statut} options={STATUTS} onValider={(v) => maj({ statut: v, dateLecture: v === "Lu" && !r.dateLecture ? aujourdhui() : r.dateLecture })} />
          </Libelle>
          <Libelle titre="Date de lecture">
            <ChampTexte type="date" valeur={r.dateLecture} onValider={t("dateLecture")} />
          </Libelle>
          <Libelle titre="Mois du plan">
            <ChampChoix
              valeur={r.mois === null ? "" : String(r.mois)}
              vide="—"
              options={Array.from({ length: b.parametres.nbMois }, (_, i) => [String(i + 1), `${i + 1} — ${libelleMois(i + 1, b.parametres)}`] as [string, string])}
              onValider={n("mois")}
            />
          </Libelle>
          <Libelle titre="Priorité">
            <ChampChoix valeur={r.priorite} options={PRIORITES} vide="—" onValider={t("priorite")} />
          </Libelle>
          <Libelle titre="Axe">
            <ChampChoix
              valeur={r.axe === null ? "" : String(r.axe)}
              vide="—"
              options={b.parametres.axes.map((a) => [String(a.numero), `${a.numero}. ${a.intitule}`] as [string, string])}
              onValider={n("axe")}
            />
          </Libelle>
          <Libelle titre="Pertinence (1-5)">
            <ChampChoix valeur={r.pertinence === null ? "" : String(r.pertinence)} vide="—" options={["1", "2", "3", "4", "5"]} onValider={n("pertinence")} />
          </Libelle>
          <Libelle titre="Commentaire" large>
            <ChampTexte multiligne valeur={r.commentaire} onValider={t("commentaire")} />
          </Libelle>
        </div>
      </Section>

      <Section titre="Mes notes de lecture">
        <div className="grille-champs">
          {NOTES.map(([k, titre]) => (
            <Libelle key={k} titre={titre} large={k !== "chapitre" && k !== "aCiter"}>
              <ChampTexte multiligne={k !== "chapitre" && k !== "aCiter"} valeur={r.notes[k]} onValider={(v) => maj({ notes: { ...r.notes, [k]: v } })} />
            </Libelle>
          ))}
        </div>
      </Section>

      <Section titre="Fiche de lecture (d'après le résumé)">
        <p className="discret">
          Texte lu : {r.fiche.texteLu || "—"} {r.fiche.sourceTexte ? `(${r.fiche.sourceTexte})` : ""}
        </p>
        <div className="grille-champs">
          {FICHE.map(([k, titre]) => (
            <Libelle key={k} titre={titre} large>
              <ChampTexte multiligne valeur={r.fiche[k]} onValider={(v) => maj({ fiche: { ...r.fiche, [k]: v } })} />
            </Libelle>
          ))}
          {DIMENSIONS.map(([k, titre]) => (
            <Libelle key={k} titre={titre}>
              <ChampTexte valeur={r.fiche[k]} onValider={(v) => maj({ fiche: { ...r.fiche, [k]: v } })} />
            </Libelle>
          ))}
        </div>
        {r.categories.length ? <p className="discret">Matrice croisée : {r.categories.join(" · ")}</p> : null}
      </Section>

      <Section titre="Accès et vérification">
        <div className="grille-champs">
          <Libelle titre="Accès au document">
            <ChampChoix valeur={r.accesDocument} vide="—" options={ACCES_DOCUMENT} onValider={t("accesDocument")} />
          </Libelle>
          <Libelle titre="Fichier PDF (dossier biblio-pdf)">
            <ChampTexte valeur={r.fichierPdf} onValider={t("fichierPdf")} placeholder="vide = pas encore récupéré" />
          </Libelle>
          <Libelle titre="Vérification">
            <ChampChoix valeur={r.verification} vide="—" options={VERIFICATIONS} onValider={t("verification")} />
          </Libelle>
          <Libelle titre="Source de vérification">
            <ChampTexte valeur={r.sourceVerification} onValider={t("sourceVerification")} />
          </Libelle>
          <Libelle titre="Comment l'obtenir" large>
            <ChampTexte multiligne valeur={r.commentObtenir} onValider={t("commentObtenir")} />
          </Libelle>
          <Libelle titre="Contribution et lien avec tes travaux" large>
            <ChampTexte multiligne valeur={r.contribution} onValider={t("contribution")} />
          </Libelle>
          <Libelle titre="Voir aussi" large>
            <ChampTexte valeur={r.voirAussi} onValider={t("voirAussi")} />
          </Libelle>
        </div>
      </Section>

      <Section
        titre="Métadonnées"
        aDroite={
          <span className="rangee">
            <input className="champ" placeholder="DOI (10.xxxx/…)" value={doi || r.doi} onChange={(e) => setDoi(e.target.value)} style={{ width: 240 }} />
            <button type="button" disabled={recherche || !(doi || r.doi)} onClick={() => void remplirDepuisDoi(doi || r.doi)}>
              {recherche ? "Recherche…" : "Remplir depuis le DOI"}
            </button>
          </span>
        }
      >
        <div className="grille-champs">
          <Libelle titre="Clé">
            <ChampTexte valeur={r.cle} onValider={t("cle")} />
          </Libelle>
          <Libelle titre="Type RIS">
            <ChampChoix valeur={r.typeRis} vide="—" options={Object.entries(b.parametres.typesRis).map(([k, v]) => [k, `${k} — ${v}`] as [string, string])} onValider={t("typeRis")} />
          </Libelle>
          <Libelle titre="Année">
            <ChampTexte type="number" valeur={r.annee === null ? "" : String(r.annee)} onValider={n("annee")} />
          </Libelle>
          <Libelle titre="Titre" large>
            <ChampTexte valeur={r.titre} onValider={t("titre")} />
          </Libelle>
          <Libelle titre="Auteurs (Nom, P.; Nom, P.)" large>
            <ChampTexte valeur={r.auteurs} onValider={t("auteurs")} />
          </Libelle>
          <Libelle titre="Support (revue, actes)" large>
            <ChampTexte valeur={r.support} onValider={t("support")} />
          </Libelle>
          {(
            [
              ["volume", "Vol."],
              ["numero", "N°"],
              ["pages", "Pages"],
              ["editeur", "Éditeur / institution"],
              ["doi", "DOI"],
              ["identifiant", "Identifiant (rapport, norme, ISBN…)"],
              ["url", "Lien (URL)"],
            ] as [keyof Reference, string][]
          ).map(([k, titre]) => (
            <Libelle key={k} titre={titre}>
              <ChampTexte valeur={String(r[k] ?? "")} onValider={t(k)} />
            </Libelle>
          ))}
          <Libelle titre="Bibliographie du TFE">
            <ChampChoix valeur={r.tfe ? "Oui" : "Non"} options={["Oui", "Non"]} onValider={(v) => maj({ tfe: v === "Oui" })} />
          </Libelle>
        </div>
      </Section>
    </div>
  );
}
