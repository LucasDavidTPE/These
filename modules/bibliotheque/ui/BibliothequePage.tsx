/**
 * Module Bibliothèque (SPEC §9) : le classeur de bibliographie, avec une interface faite
 * pour ça. Onglets comme les feuilles, fiche d'une référence sur une page.
 */
import { useEffect, useRef, useState } from "react";
import { Message, Page } from "@interface/composants";
import { absolu } from "@noyau/stockage";
import { BandeauHorsEspace } from "@interface/BandeauHorsEspace";
import { useContexte } from "@interface/contexte";
import { useOuverture } from "@interface/ouverture";
import { versBibtex, versRis } from "../core/exports";
import { importerClasseur, type ImportClasseur } from "../core/import";
import { libelleLien, lienARevoir, liensAVerifier } from "../core/liens";
import { nomNote, noteReference, pointMensuel } from "../core/markdown";
import { nouvelleReference } from "../core/modele";
import { Fiche } from "./Fiche";
import { PanneauZotero } from "./Zotero";
import { aujourdhui, ecrireCitations, lireCitations, useBiblio } from "./donnees";
import { AnalyseVue, CorrectionsVue, DemandesVue, PistesVue } from "./suivi";
import { FILTRES_VIDES, type Filtres } from "./format";
import { PlanVue, ReferencesVue, TableauDeBordVue } from "./vues";
import { LectureCroisee } from "./lecture/LectureCroisee";
import "./bibliotheque.css";

const ONGLETS = [
  ["tableau", "Tableau de bord"],
  ["references", "Références"],
  ["plan", "Plan de lecture"],
  ["demandes", "Demandes"],
  ["corrections", "Corrections TFE"],
  ["pistes", "Pistes"],
  ["lecture", "Lecture croisée"],
  ["analyse", "Analyse (classeur)"],
] as const;
type Onglet = (typeof ONGLETS)[number][0];

const octetsTexte = (s: string) => new TextEncoder().encode(s);

export function BibliothequePage() {
  const ctx = useContexte();
  const d = useBiblio();
  const b = d.biblio;
  const [onglet, setOnglet] = useState<Onglet>("tableau");
  const [fiche, setFiche] = useOuverture("bibliotheque");
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [aImporter, setAImporter] = useState<{ nom: string; imp: ImportClasseur } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [verification, setVerification] = useState<{ fait: number; total: number; aRevoir: number } | null>(null);
  const arret = useRef(false);
  const [citations, setCitations] = useState<boolean | null>(null);
  const [zotero, setZotero] = useState(false);
  const fsEspace = ctx.espace?.fichiers;
  useEffect(() => {
    if (!fsEspace) return;
    let annule = false;
    void lireCitations(fsEspace).then((r) => !annule && setCitations(r.actives));
    return () => {
      annule = true;
    };
  }, [fsEspace, ctx.revision]);

  async function basculerCitations(actives: boolean) {
    if (!fsEspace) return;
    setCitations(actives);
    await ecrireCitations(fsEspace, { actives });
  }

  async function choisirClasseur() {
    setErreur(null);
    const f = await ctx.plateforme.ouvrirFichier("Classeur de bibliographie", ["xlsx", "xlsm"]);
    if (!f) return;
    try {
      setAImporter({ nom: f.nom, imp: importerClasseur(f.octets) });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function confirmerImport() {
    if (!aImporter) return;
    await d.importer(aImporter.imp);
    setMessage(`Import terminé : ${aImporter.imp.references.length} références depuis ${aImporter.nom}.`);
    setAImporter(null);
    setOnglet("tableau");
  }

  async function exporter(format: "ris" | "bib") {
    if (!b) return;
    const refs = b.references.map((r) => r.valeur);
    // RIS : chaque PDF de l'espace en ligne L1, que Zotero attache à l'import.
    const dossierPdf = ctx.racines["biblio-pdf"];
    const pdf = (r: (typeof refs)[number]) => (dossierPdf && r.fichierPdf.trim() ? absolu(dossierPdf, r.fichierPdf.trim()) : null);
    const ok = await ctx.plateforme.enregistrerSous(
      format === "ris" ? "biblio_these_lucas.ris" : "biblio_these_lucas.bib",
      octetsTexte(format === "ris" ? versRis(refs, b.parametres, pdf) : versBibtex(refs)),
    );
    if (ok) setMessage(`${refs.length} références exportées en ${format === "ris" ? "RIS" : "BibTeX"}.`);
  }

  /**
   * VerifierLiens : une requête par lien, l'une après l'autre (pas de rafale chez un même
   * éditeur), le résultat noté aussitôt dans la référence. Interruptible.
   */
  async function verifierLiens() {
    if (!b) return;
    const refs = liensAVerifier(b.references);
    if (!window.confirm(`Vérifier ${refs.length} liens ? L'application va interroger chaque site (quelques minutes). Vous pouvez arrêter à tout moment.`)) return;
    arret.current = false;
    const jour = aujourdhui();
    let aRevoir = 0;
    setVerification({ fait: 0, total: refs.length, aRevoir });
    for (const [i, r] of refs.entries()) {
      if (arret.current) break;
      const etat = libelleLien(await ctx.plateforme.verifierLien(r.valeur.url));
      if (lienARevoir(etat)) aRevoir++;
      await d.enregistrerReference(r.id, { ...r.valeur, etatLien: etat, lienControleLe: jour });
      setVerification({ fait: i + 1, total: refs.length, aRevoir });
    }
    setVerification(null);
    setMessage(`${arret.current ? "Vérification arrêtée" : "Liens vérifiés"} : ${aRevoir} lien(s) à revoir (morts ou injoignables), notés dans « État du lien ».`);
  }

  /** GenererNotesObsidian et GenererPointMensuel : une note par référence et le point du mois, dans un dossier choisi. */
  async function exporterMarkdown() {
    if (!b) return;
    const dossier = await ctx.plateforme.choisirDossier("Dossier des notes Markdown (par exemple un coffre Obsidian)");
    if (!dossier) return;
    try {
      const fs = ctx.plateforme.fichiers(dossier);
      const cles = new Set(b.references.map((r) => r.valeur.cle).filter(Boolean));
      for (const c of b.calc) await fs.writeTextAtomic(nomNote(c.id, c.ref), noteReference(c, b.parametres, cles));
      const mois = Math.min(Math.max(b.tb.moisCourant, 1), b.parametres.nbMois);
      await fs.writeTextAtomic(`Point mensuel - mois ${mois}.md`, pointMensuel(mois, b.calc, b.demandes.map((x) => x.valeur), b.parametres, b.aujourdhui));
      setMessage(`${b.calc.length} notes et le point du mois ${mois} écrits dans ${dossier} (les notes existantes de même nom sont remplacées).`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function nouvelle() {
    const id = await d.creerReference({ ...nouvelleReference(), titre: "Nouvelle référence", cle: `nouvelle${Date.now() % 100000}` });
    if (id) {
      setOnglet("references");
      setFiche(id);
    }
  }

  const courante = fiche && b ? b.calc.find((c) => c.id === fiche) : null;

  return (
    <Page
      titre="Bibliothèque"
      sousTitre={b && b.references.length ? `${b.references.length} références · plan de lecture de ${b.parametres.nbMois} mois` : "Références, plan de lecture, fiches"}
      actions={
        <>
          <button type="button" onClick={() => void choisirClasseur()}>
            Importer le classeur…
          </button>
          {b && b.references.length ? (
            <>
              <button type="button" onClick={() => void nouvelle()}>
                Nouvelle référence
              </button>
              <button type="button" className={zotero ? "actif" : undefined} onClick={() => setZotero((z) => !z)} title="Envoie la bibliothèque dans Zotero (création, mise à jour, PDF liés, notes de lecture)">
                Mettre à jour Zotero…
              </button>
              <button type="button" onClick={() => void exporter("ris")} title="Avec le chemin de chaque PDF : à l'import dans Zotero, choisir « Lier les fichiers à leur emplacement d'origine »">
                Exporter RIS
              </button>
              <button type="button" onClick={() => void exporter("bib")}>
                Exporter BibTeX
              </button>
              <button type="button" onClick={() => void exporterMarkdown()} title="Une note par référence et le point du mois (Obsidian ou tout éditeur Markdown)">
                Exporter Markdown…
              </button>
              <button type="button" disabled={verification !== null} onClick={() => void verifierLiens()} title="Teste chaque lien et note le résultat dans « État du lien »">
                Vérifier les liens
              </button>
              {citations !== null ? (
                <label className="rangee" title="Dans les présentations et les panneaux d'explication, [@BIB-020] devient « (Olard & Di Benedetto, 2003) » avec une diapo Références. Décoché : [@…] reste tel qu'écrit. Réglage partagé entre les deux PC.">
                  <input type="checkbox" checked={citations} onChange={(e) => void basculerCitations(e.target.checked)} /> Citations [@…] dans l'application
                </label>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      {erreur || d.erreur ? <Message niveau="erreur">{erreur ?? d.erreur}</Message> : null}
      {message ? <Message niveau="info">{message}</Message> : null}
      <BandeauHorsEspace quoi="biblio-pdf" />
      {zotero && b ? <PanneauZotero b={b} enregistrer={d.enregistrerReference} onFermer={() => setZotero(false)} /> : null}
      {verification ? (
        <div className="message message-info rangee">
          <span>
            Vérification des liens : {verification.fait} / {verification.total} · {verification.aRevoir} à revoir
          </span>
          <progress max={verification.total} value={verification.fait} />
          <button type="button" onClick={() => (arret.current = true)}>
            Arrêter
          </button>
        </div>
      ) : null}
      {aImporter ? (
        <div className="message message-attention">
          <p>
            <strong>{aImporter.nom}</strong> : {aImporter.imp.references.length} références, {aImporter.imp.demandes.length} demandes,{" "}
            {aImporter.imp.corrections.length} corrections, {aImporter.imp.pistes.length} pistes, plan de {aImporter.imp.parametres.nbMois} mois à partir du{" "}
            {aImporter.imp.parametres.debutPlan}.
          </p>
          <p>
            L'import <strong>remplace</strong> les objets de mêmes numéros (BIB-001…) et les paramètres. Tant que vous travaillez dans Excel, c'est ce
            qu'il faut ; après la bascule, ne réimportez plus.
          </p>
          <div className="rangee">
            <button type="button" className="principal" onClick={() => void confirmerImport()}>
              Importer
            </button>
            <button type="button" onClick={() => setAImporter(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {!ctx.espace ? (
        <Message niveau="erreur">La bibliothèque vit dans l'espace Thèse : ouvrez-en un d'abord.</Message>
      ) : !b ? (
        <p className="discret">Chargement…</p>
      ) : b.references.length === 0 && !aImporter ? (
        <div className="carte">
          <p>La bibliothèque est vide.</p>
          <p className="discret">
            Importez le classeur <code>Biblio_These_Lucas_MAITRE.xlsx</code> : références, fiches de lecture, notes, plan de lecture, demandes,
            corrections du TFE et pistes sont repris ; ce qu'Excel calculait est recalculé à l'identique.
          </p>
          <button type="button" className="principal" onClick={() => void choisirClasseur()}>
            Importer le classeur…
          </button>
        </div>
      ) : courante ? (
        <Fiche b={b} c={courante} onEnregistrer={(r) => void d.enregistrerReference(courante.id, r)} onFermer={() => setFiche(null)} onOuvrir={(id) => setFiche(id)} onEnregistrerAutre={(id, r) => void d.enregistrerReference(id, r)} />
      ) : (
        <>
          <nav className="onglets" aria-label="Bibliothèque">
            {ONGLETS.map(([id, titre]) => (
              <button key={id} type="button" className={id === onglet ? "actif" : undefined} onClick={() => setOnglet(id)}>
                {titre}
                {id === "demandes" && b.tb.demandesAEnvoyer ? <span className="compteur">{b.tb.demandesAEnvoyer}</span> : null}
              </button>
            ))}
          </nav>
          {onglet === "tableau" ? (
            <TableauDeBordVue b={b} ouvrir={setFiche} />
          ) : onglet === "references" ? (
            <ReferencesVue b={b} ouvrir={setFiche} filtres={filtres} setFiltres={setFiltres} />
          ) : onglet === "plan" ? (
            <PlanVue b={b} ouvrir={setFiche} />
          ) : onglet === "demandes" ? (
            <DemandesVue b={b} enregistrer={(id, v) => void d.enregistrerDemande(id, v)} />
          ) : onglet === "corrections" ? (
            <CorrectionsVue b={b} enregistrer={(id, v) => void d.enregistrerCorrection(id, v)} />
          ) : onglet === "pistes" ? (
            <PistesVue b={b} enregistrer={(id, v) => void d.enregistrerPiste(id, v)} />
          ) : onglet === "lecture" ? (
            <LectureCroisee b={b} ouvrir={setFiche} />
          ) : (
            <AnalyseVue b={b} enregistrer={(t) => void d.enregistrerAnalyse(t)} />
          )}
        </>
      )}
    </Page>
  );
}
