/**
 * Module Bibliothèque (SPEC §9) : le classeur de bibliographie, avec une interface faite
 * pour ça. Onglets comme les feuilles, fiche d'une référence sur une page.
 */
import { useState } from "react";
import { Message, Page } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { versBibtex, versRis } from "../core/exports";
import { importerClasseur, type ImportClasseur } from "../core/import";
import { nouvelleReference } from "../core/modele";
import { Fiche } from "./Fiche";
import { useBiblio } from "./donnees";
import { AnalyseVue, CorrectionsVue, DemandesVue, PistesVue } from "./suivi";
import { FILTRES_VIDES, type Filtres } from "./format";
import { PlanVue, ReferencesVue, TableauDeBordVue } from "./vues";
import "./bibliotheque.css";

const ONGLETS = [
  ["tableau", "Tableau de bord"],
  ["references", "Références"],
  ["plan", "Plan de lecture"],
  ["demandes", "Demandes"],
  ["corrections", "Corrections TFE"],
  ["pistes", "Pistes"],
  ["analyse", "Analyse croisée"],
] as const;
type Onglet = (typeof ONGLETS)[number][0];

const octetsTexte = (s: string) => new TextEncoder().encode(s);

export function BibliothequePage() {
  const ctx = useContexte();
  const d = useBiblio();
  const b = d.biblio;
  const [onglet, setOnglet] = useState<Onglet>("tableau");
  const [fiche, setFiche] = useState<string | null>(null);
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [aImporter, setAImporter] = useState<{ nom: string; imp: ImportClasseur } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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
    const ok = await ctx.plateforme.enregistrerSous(
      format === "ris" ? "biblio_these_lucas.ris" : "biblio_these_lucas.bib",
      octetsTexte(format === "ris" ? versRis(refs, b.parametres) : versBibtex(refs)),
    );
    if (ok) setMessage(`${refs.length} références exportées en ${format === "ris" ? "RIS" : "BibTeX"}.`);
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
              <button type="button" onClick={() => void exporter("ris")}>
                Exporter RIS
              </button>
              <button type="button" onClick={() => void exporter("bib")}>
                Exporter BibTeX
              </button>
            </>
          ) : null}
        </>
      }
    >
      {erreur || d.erreur ? <Message niveau="erreur">{erreur ?? d.erreur}</Message> : null}
      {message ? <Message niveau="info">{message}</Message> : null}
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
        <Fiche b={b} c={courante} onEnregistrer={(r) => void d.enregistrerReference(courante.id, r)} onFermer={() => setFiche(null)} />
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
          ) : (
            <AnalyseVue b={b} enregistrer={(t) => void d.enregistrerAnalyse(t)} />
          )}
        </>
      )}
    </Page>
  );
}
