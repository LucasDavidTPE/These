/**
 * ChaussSpec : calcul semi-analytique spectral de chaussées multicouches (portage TypeScript
 * de chausspec v0.4). Un cas = un fichier JSON au format du code Python, rangé dans
 * `chausspec/<nom>.json` de l'espace ; le calcul tourne dans un Worker.
 */
import { useCallback, useEffect, useState } from "react";
import { Message, Page, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import type { CaseJSON } from "../core/io";
import { EditeurCalcul, EditeurChargement, EditeurStructure } from "./EditeurCas";
import { useChaussspec } from "./etat";
import { EXEMPLES } from "./exemples";
import { calculer } from "./execution";
import { Resultats } from "./Resultats";
import "./chausspec.css";

const DOSSIER = "chausspec";
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "cas";

export function ChaussspecPage() {
  const ctx = useContexte();
  const s = useChaussspec();
  const [liste, setListe] = useState<string[]>([]);

  const [tour, setTour] = useState(0);
  const relire = useCallback(() => setTour((t) => t + 1), []);
  // Cas enregistrés de l'espace, relus quand l'espace change (autre poste, OneDrive).
  useEffect(() => {
    const fs = ctx.espace?.fichiers;
    if (!fs) return;
    let actif = true;
    fs.listDir(DOSSIER).then(
      (e) => actif && setListe(e.filter((x) => x.kind === "file" && x.name.endsWith(".json")).map((x) => x.name.slice(0, -5)).sort()),
      () => actif && setListe([]),
    );
    return () => {
      actif = false;
    };
  }, [ctx.espace, ctx.revision, tour]);

  async function ouvrirCas(nom: string) {
    try {
      const texte = await ctx.espace!.fichiers.readText(`${DOSSIER}/${nom}.json`);
      s.ouvrir(JSON.parse(texte) as CaseJSON, nom);
    } catch (e) {
      s.signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  async function enregistrer(nom = s.nom) {
    if (!ctx.espace) return s.signaler("Aucun espace ouvert : exportez le cas en JSON.", "attention");
    const n = slug(nom);
    await ctx.espace.fichiers.ensureDir(DOSSIER);
    await ctx.espace.fichiers.writeTextAtomic(`${DOSSIER}/${n}.json`, JSON.stringify(s.cas, null, 2) + "\n");
    useChaussspec.setState({ nom: n, modifie: false });
    s.signaler(`Cas enregistré : ${DOSSIER}/${n}.json (se calcule aussi avec python -m chausspec).`);
    relire();
  }

  async function importer() {
    const f = await ctx.plateforme.ouvrirFichier("Cas chausspec (JSON)", ["json"]);
    if (!f) return;
    try {
      const cas = JSON.parse(new TextDecoder().decode(f.octets)) as CaseJSON;
      if (!cas.structure || !cas.loading) throw new Error("Ce fichier n'est pas un cas chausspec (structure et loading attendus).");
      s.ouvrir(cas, slug(f.nom.replace(/\.json$/i, "")));
      const cartes = cas.loading.wheels.filter((w) => w.footprint.type === "map" && !("P" in w.footprint && w.footprint.P));
      s.signaler(cartes.length ? `Cas importé. ${cartes.length} carte(s) de pression référencée(s) par fichier : les importer avec « CSV… » dans le chargement.` : "Cas importé.", cartes.length ? "attention" : "info");
    } catch (e) {
      s.signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  function lancer() {
    const cas = JSON.parse(JSON.stringify(s.cas)) as CaseJSON;
    const c = calculer(cas, (part, texte) => useChaussspec.setState((x) => ({ calcul: x.calcul ? { ...x.calcul, part, texte } : x.calcul })));
    useChaussspec.setState({ calcul: { part: 0, texte: "Préparation…", annuler: c.annuler }, message: null });
    c.promesse.then(
      (r) => useChaussspec.setState({ resultat: r, casCalcule: JSON.stringify(cas), calcul: null, message: { niveau: "info", texte: `Calcul terminé en ${r.meta.cpuS.toFixed(1).replace(".", ",")} s.` } }),
      (e: unknown) => useChaussspec.setState({ calcul: null, message: { niveau: e instanceof Error && e.message === "Calcul annulé." ? "info" : "erreur", texte: e instanceof Error ? e.message : String(e) } }),
    );
  }

  const perime = s.resultat && s.casCalcule !== JSON.stringify(s.cas);

  return (
    <Page
      titre="ChaussSpec"
      sousTitre="Chaussées multicouches (visco)élastiques, chargements de surface quelconques : statique, harmonique, charge roulante"
      actions={
        <>
          <select
            className="champ"
            value=""
            aria-label="Ouvrir un cas"
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("ex:")) {
                const ex = EXEMPLES.find((x) => x.id === v.slice(3))!;
                s.ouvrir(ex.cas(), `exemple-${ex.id}`);
              } else if (v) void ouvrirCas(v);
            }}
          >
            <option value="">Ouvrir…</option>
            {ctx.espace && liste.length ? (
              <optgroup label="Cas enregistrés">
                {liste.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Exemples">
              {EXEMPLES.map((x) => (
                <option key={x.id} value={`ex:${x.id}`} title={x.note}>
                  {x.nom}
                </option>
              ))}
            </optgroup>
          </select>
          <button type="button" onClick={() => void importer()}>
            Importer un JSON…
          </button>
          <button type="button" onClick={() => void ctx.plateforme.enregistrerSous(`${s.nom}.json`, new TextEncoder().encode(JSON.stringify(s.cas, null, 2) + "\n"))}>
            Exporter le JSON
          </button>
        </>
      }
    >
      <div className="cs-nom rangee">
        <label className="cs-champ">
          <span>Nom du cas</span>
          <input className="champ" value={s.nom} onChange={(e) => useChaussspec.setState({ nom: e.target.value, modifie: true })} />
        </label>
        <button type="button" className="principal" disabled={!ctx.espace} onClick={() => void enregistrer()}>
          Enregistrer{s.modifie ? " *" : ""}
        </button>
        {s.cas._commentaire ? <span className="discret petit cs-commentaire">{s.cas._commentaire}</span> : null}
      </div>
      {s.message ? <Message niveau={s.message.niveau}>{s.message.texte}</Message> : null}

      <Section titre="Structure">
        <EditeurStructure />
      </Section>
      <Section titre="Chargement">
        <EditeurChargement />
      </Section>
      <Section
        titre="Régime, grille et sorties"
        aDroite={
          s.calcul ? (
            <span className="rangee">
              <span className="cs-jauge" title={s.calcul.texte}>
                <i style={{ width: `${Math.round(s.calcul.part * 100)}%` }} />
              </span>
              <span className="petit">{s.calcul.texte}</span>
              <button type="button" onClick={s.calcul.annuler}>
                Annuler
              </button>
            </span>
          ) : (
            <button type="button" className="principal" onClick={lancer}>
              Calculer
            </button>
          )
        }
      >
        <EditeurCalcul />
      </Section>
      {s.resultat ? (
        <Section titre={`Résultats${perime ? " (le cas a changé depuis ce calcul)" : ""}`}>
          <Resultats key={s.casCalcule ?? ""} r={s.resultat} />
        </Section>
      ) : null}
    </Page>
  );
}
