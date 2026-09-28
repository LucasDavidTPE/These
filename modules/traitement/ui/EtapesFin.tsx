/** Étapes 05 à 07 : comparaison des éprouvettes, fidélité au classeur Excel, exports. */
import { useContexte } from "@interface/contexte";
import { ecrireClasseur } from "@noyau/formats/xlsx-ecriture";
import { comparerModes, csv, ecartsCalage, projetJSON, tableauCalcul, tableauData, tableauModeleExp, appliquerProjet } from "../core/essai";
import { feuillesEssai } from "../core/exports";
import { nb } from "../core/format";
import { modele } from "../core/modeles";
import { vuesComparaison } from "../core/vues";
import { Bloc } from "./champs";
import { essaiActif, useTraitement } from "./etat";
import { Graphe } from "./Graphe";

export function EtapeComparaison() {
  const s = useTraitement();
  const v = vuesComparaison(s.essais, s.langue);
  const cles: string[] = [];
  for (const e of s.essais) for (const p of modele(e.modeleId).parametres) if (!cles.includes(p.cle)) cles.push(p.cle);
  cles.push("C1", "C2", "Tref");
  const source = { titre: "Comparaison des éprouvettes", source: `Traitement 2S2P1D : ${s.essais.map((e) => e.nom).join(", ")}`, tags: ["2S2P1D", "comparaison"] };
  return (
    <>
      <Bloc titre="Éprouvettes chargées" aide="déposer d'autres fichiers à l'étape 01 pour les comparer">
        <div className="tr-cadre">
          <table className="tr-table">
            <thead>
              <tr>
                <th />
                <th scope="col">Essai</th>
                <th scope="col">Ø (mm)</th>
                <th scope="col">Paliers</th>
                <th scope="col">Cycles</th>
                <th scope="col">Modèle</th>
                <th scope="col">Tref (°C)</th>
                <th scope="col">Écart |E*|</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.essais.map((e, i) => {
                const ec = ecartsCalage(e);
                return (
                  <tr key={e.id}>
                    <td>
                      <input type="checkbox" checked={e.visible} aria-label={`Afficher ${e.nom}`} onChange={(ev) => s.maj(() => (e.visible = ev.target.checked))} />
                    </td>
                    <th scope="row">
                      <span className="tr-puce" style={{ borderColor: e.couleur, color: e.couleur }}>
                        {e.nom}
                      </span>
                    </th>
                    <td>{nb(e.meta.diametre, 2)}</td>
                    <td>{e.paliers.length}</td>
                    <td>{e.paliers.reduce((a, p) => a + p.lignes.length, 0)}</td>
                    <td>{modele(e.modeleId).nom}</td>
                    <td>{e.Tref}</td>
                    <td>{Number.isFinite(ec.module) ? `${nb(ec.module, 2)} %` : "—"}</td>
                    <td>
                      <button type="button" className="tr-mini" disabled={i === s.actif} onClick={() => s.maj((x) => ((x.actif = i), (x.palier = 0), (x.cycle = 0)))}>
                        {i === s.actif ? "courant" : "ouvrir"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloc>
      <div className="tr-grille-2">
        <Graphe titre="Courbes maîtresses |E*|" sous="un essai par couleur, points mesurés et modèle" vue={v.module} figure={{ ...source, titre: "Courbes maîtresses |E*| comparées" }} />
        <Graphe titre="Plans Cole-Cole" sous="E₂ en fonction de E₁" vue={v.cole} figure={{ ...source, titre: "Plans Cole-Cole comparés" }} />
        <Graphe titre="Espaces de Black" sous="|E*| en fonction de φ" vue={v.black} figure={{ ...source, titre: "Espaces de Black comparés" }} />
        <Graphe titre="Facteurs de translation" sous="a_T de chaque essai" vue={v.aT} figure={{ ...source, titre: "Facteurs de translation comparés" }} />
      </div>
      <Bloc titre="Constantes calées">
        <div className="tr-cadre">
          <table className="tr-table">
            <thead>
              <tr>
                <th scope="col">Essai</th>
                {cles.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.essais.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{e.nom}</th>
                  {cles.map((c) => {
                    const x = c === "C1" ? e.C1 : c === "C2" ? e.C2 : c === "Tref" ? e.Tref : e.p[c];
                    return <td key={c}>{x !== undefined && Number.isFinite(x) ? nb(x, x > 1000 ? 0 : 4) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>
    </>
  );
}

const COLS_MODES: [string, string, number][] = [
  ["module", "|E*| (MPa)", 1],
  ["phi", "φ (°)", 2],
  ["eoax", "ε₀ ax (µm/m)", 2],
  ["sigma0", "σ₀ (MPa)", 4],
  ["nu", "ν", 4],
  ["ecA1", "Δ Axial1 (%)", 2],
  ["qMC", "Iq (%)", 2],
];

export function EtapeFidelite() {
  const s = useTraitement();
  const e = essaiActif(s)!;
  const m = comparerModes(e);
  return (
    <Bloc titre="Fidélité au classeur Excel" aide="premier palier, calculé dans les deux modes">
      <p className="discret">
        Le mode « Excel à l'identique » reproduit cinq particularités du classeur Calcul.xlsx : régression sur deux cycles, 410 points au plus, centrage sur I2−1 points, voie
        Axial1 décalée d'une ligne, diviseur de l'indice de qualité non plafonné. Le mode « corrigé » les lève. Les tests de conformité vérifient le premier mode contre les
        valeurs recalculées par un vrai tableur, à 10⁻⁹ près.
      </p>
      {!m ? (
        <p className="discret">Aucun palier traité.</p>
      ) : (
        <div className="tr-cadre">
          <table className="tr-table">
            <thead>
              <tr>
                <th />
                {COLS_MODES.map((c) => (
                  <th key={c[0]} colSpan={3} scope="colgroup">
                    {c[1]}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col">Cycle</th>
                {COLS_MODES.map((c) =>
                  ["Excel", "corrigé", "écart"].map((h) => (
                    <th key={c[0] + h} scope="col">
                      {h}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {m.exact.slice(0, m.corrige.length).map((l, i) => (
                <tr key={l.cycle}>
                  <th scope="row">{l.cycle}</th>
                  {COLS_MODES.map(([cle, , d]) => {
                    const a = l[cle] as number,
                      b = m.corrige[i]![cle] as number;
                    const brut = ((b - a) / Math.abs(a)) * 100;
                    const ec = Math.abs(brut) < 1e-9 ? 0 : brut;
                    return [
                      <td key={cle + "a"}>{nb(a, d)}</td>,
                      <td key={cle + "b"}>{nb(b, d)}</td>,
                      <td key={cle + "e"} className={Math.abs(ec) > 5 ? "grave" : Math.abs(ec) > 1 ? "alerte" : undefined}>
                        {Number.isFinite(ec) ? `${ec >= 0 ? "+" : ""}${nb(ec, 2)} %` : "—"}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloc>
  );
}

export function EtapeExport() {
  const ctx = useContexte();
  const s = useTraitement();
  const e = essaiActif(s)!;
  const texte = (t: string) => new TextEncoder().encode(t);
  const enregistrer = async (nom: string, octets: Uint8Array) => {
    try {
      if (await ctx.plateforme.enregistrerSous(nom, octets)) s.signaler(`${nom} enregistré`);
    } catch (err) {
      s.signaler(`Enregistrement impossible : ${err instanceof Error ? err.message : String(err)}`, "erreur");
    }
  };
  const copier = (t: string, message: string) =>
    navigator.clipboard.writeText(t).then(
      () => s.signaler(message),
      () => s.signaler("Copie refusée", "erreur"),
    );
  async function importer() {
    const f = await ctx.plateforme.ouvrirFichier("Fichier projet 2S2P1D", ["json"]);
    if (!f) return;
    await s.tache("Application du projet…", async () => {
      await appliquerProjet(s.essais, JSON.parse(new TextDecoder().decode(f.octets)));
      s.maj(() => undefined);
      s.signaler("projet rechargé");
    });
  }
  return (
    <div className="tr-grille-2">
      <Bloc titre="Classeur Excel" aide="feuilles Data (colonne Retenu), Calcul et Modele">
        <button type="button" className="principal" onClick={() => void enregistrer(`${e.nom || "synthese"}_Synt_Temp.xlsx`, ecrireClasseur(feuillesEssai(e)))}>
          Exporter .xlsx
        </button>
      </Bloc>
      <Bloc titre="Fichiers CSV" aide="« ; » et virgule décimale, pour Excel">
        <div className="rangee">
          <button type="button" onClick={() => void enregistrer(`${e.nom}_cycles.csv`, texte(csv(tableauData(e))))}>
            Cycles
          </button>
          <button type="button" onClick={() => void enregistrer(`${e.nom}_synthese.csv`, texte(csv(tableauCalcul(e))))}>
            Synthèse
          </button>
          <button type="button" onClick={() => void enregistrer(`${e.nom}_modele.csv`, texte(csv(tableauModeleExp(e))))}>
            Mesures et modèle
          </button>
          <button type="button" onClick={() => void copier(csv(tableauCalcul(e)), "synthèse copiée")}>
            Copier la synthèse
          </button>
        </div>
      </Bloc>
      <Bloc titre="Projet" aide="tri des cycles et calages de tous les essais chargés, à réappliquer aux mêmes fichiers">
        <div className="rangee">
          <button type="button" onClick={() => void enregistrer("projet-2s2p1d.json", texte(projetJSON(s.essais)))}>
            Enregistrer le projet
          </button>
          <button type="button" onClick={() => void importer()}>
            Rouvrir un projet…
          </button>
          <button type="button" onClick={() => void copier(projetJSON(s.essais), "projet copié")}>
            Copier le projet
          </button>
        </div>
      </Bloc>
    </div>
  );
}
