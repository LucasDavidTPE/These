/**
 * ViscoCompare : comparaison des profils calculés par COMSOL et par Viscoroute, vitesse par
 * vitesse (portage de LucasDavidTPE/ViscoCompare, sans Python). Les fichiers de calcul sont lus
 * dans leur dossier (racine « viscocompare ») et copiés dans l'espace au passage : la
 * comparaison se rouvre sur l'autre PC. Le dossier source n'est jamais écrit ; les classeurs
 * produits vont dans l'espace (`viscocompare/<étude>/`).
 */
import { useEffect, useMemo, useState } from "react";
import { VUE_ENTIERE, formaterNombre, type Vue } from "@noyau/courbes";
import { ecrireClasseur } from "@noyau/formats/xlsx-ecriture";
import { slugifier } from "@noyau/texte";
import { Message, Page, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { fichiersDonnees } from "@interface/donnees";
import { Courbes } from "@interface/Courbes";
import { ecarts, feuillesCas, panneauxCas } from "../core/comparaison";
import { chargerEtude, trouverEtudes, type Etude } from "../core/dossier";
import { CONVENTIONS_SCRIPT, type Conventions } from "../core/lecture";
import { renduCas, titreCas, X_LIBELLE, type OrigineCas } from "./figure";

type Msg = { niveau: "info" | "attention" | "erreur"; texte: string };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Conv({ c, onChange }: { c: Conventions; onChange(c: Conventions): void }) {
  const [texte, setTexte] = useState({ d: String(c.decalageArc), f: String(c.facteurViscoroute) });
  const valider = () => {
    const d = Number(texte.d.replace(",", "."));
    const f = Number(texte.f.replace(",", "."));
    if (Number.isFinite(d) && Number.isFinite(f) && (d !== c.decalageArc || f !== c.facteurViscoroute)) onChange({ ...c, decalageArc: d, facteurViscoroute: f });
  };
  return (
    <details className="carte">
      <summary>
        Conventions : arc_length {c.decalageArc >= 0 ? "+" : "−"} {Math.abs(c.decalageArc)} m, Viscoroute × {formaterNombre(c.facteurViscoroute)}, signe inversé pour {c.signeInverse.join(", ") || "aucune"}
      </summary>
      <p className="discret petit">Valeurs du script d'origine par défaut. COMSOL : déplacements m → µm. Viscoroute : profil en x = 0, déplacements et déformations × facteur.</p>
      <div className="rangee">
        <label className="libelle">
          <span>Décalage d'arc_length (m)</span>
          <input className="champ" value={texte.d} onChange={(e) => setTexte({ ...texte, d: e.target.value })} onBlur={valider} />
        </label>
        <label className="libelle">
          <span>Facteur Viscoroute</span>
          <input className="champ" value={texte.f} onChange={(e) => setTexte({ ...texte, f: e.target.value })} onBlur={valider} />
        </label>
        {(["UX", "UZ"] as const).map((g) => (
          <label key={g}>
            <input type="checkbox" checked={c.signeInverse.includes(g)} onChange={(e) => onChange({ ...c, signeInverse: e.target.checked ? [...c.signeInverse, g] : c.signeInverse.filter((x) => x !== g) })} /> inverser {g}
          </label>
        ))}
        <button type="button" onClick={() => (setTexte({ d: String(CONVENTIONS_SCRIPT.decalageArc), f: String(CONVENTIONS_SCRIPT.facteurViscoroute) }), onChange(CONVENTIONS_SCRIPT))}>
          Valeurs du script
        </button>
      </div>
    </details>
  );
}

export function ViscoComparePage() {
  const ctx = useContexte();
  const racine = ctx.racines.viscocompare;
  // Le dossier vu à travers sa copie dans l'espace : lisible même sans la source sur ce poste.
  const fs = useMemo(() => {
    try {
      return fichiersDonnees(ctx, "viscocompare:");
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.espace, ctx.racines, ctx.plateforme]);
  const [etudes, setEtudes] = useState<string[] | null>(null);
  const [etude, setEtude] = useState<string>("");
  const [conventions, setConventions] = useState<Conventions>(CONVENTIONS_SCRIPT);
  const [donnees, setDonnees] = useState<Etude | null>(null);
  const [vitesse, setVitesse] = useState<number | null>(null);
  const [vue, setVue] = useState<Vue>(VUE_ENTIERE);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    if (!fs) return;
    let annule = false;
    (async () => {
      const e = await trouverEtudes(fs);
      if (annule) return;
      setEtudes(e);
      setEtude((x) => (e.includes(x) ? x : (e[0] ?? "")));
    })().catch((e: unknown) => !annule && setMsg({ niveau: "erreur", texte: message(e) }));
    return () => {
      annule = true;
    };
  }, [fs]);

  useEffect(() => {
    if (!fs || !etudes?.includes(etude)) return;
    let annule = false;
    chargerEtude(fs, etude, conventions)
      .then((d) => {
        if (annule) return;
        setDonnees(d);
        setVitesse((v) => (d.cas.some((c) => c.vitesse === v) ? v : (d.cas[0]?.vitesse ?? null)));
      })
      .catch((e: unknown) => !annule && setMsg({ niveau: "erreur", texte: message(e) }));
    return () => {
      annule = true;
    };
  }, [fs, etudes, etude, conventions]);

  async function choisir() {
    const d = await ctx.plateforme.choisirDossier("Dossier des comparaisons (contenant COMSOL et VISCOROUTE, ou des sous-dossiers qui les contiennent)", racine);
    if (d) await ctx.enregistrerReglages({ ...ctx.reglages, racines: { ...ctx.reglages.racines, viscocompare: d } });
  }

  const cas = donnees?.cas.find((c) => c.vitesse === vitesse) ?? null;

  async function exporterCas() {
    if (!cas) return;
    await ctx.plateforme.enregistrerSous(`comparaison_${cas.nom}.xlsx`, ecrireClasseur(feuillesCas(cas)));
  }

  /** Comme le script, un classeur par cas ; mais dans l'espace, les calculs d'origine ne sont jamais touchés. */
  async function exporterTout() {
    if (!ctx.espace || !donnees) return;
    try {
      const esp = ctx.espace.fichiers;
      const dossier = `viscocompare/${slugifier(etude) || "comparaison"}`;
      await esp.ensureDir(dossier);
      for (const c of donnees.cas) await esp.writeBytesAtomic(`${dossier}/comparaison_${c.nom}.xlsx`, ecrireClasseur(feuillesCas(c)));
      setMsg({ niveau: "info", texte: `${donnees.cas.length} classeur(s) écrit(s) dans l'espace : ${dossier}.` });
    } catch (e) {
      setMsg({ niveau: "erreur", texte: message(e) });
    }
  }

  async function versFigures() {
    if (!cas) return;
    try {
      const origine: OrigineCas = { module: "viscocompare", etude, vitesse: cas.vitesse, conventions, vue };
      const r = await renduCas(cas, etude, vue);
      const dossier = await ctx.registre.executer("figures.enregistrer-image", { ctx, titre: titreCas(etude, cas.vitesse), ...r, source: `ViscoCompare : ${etude || "comparaison"}, V = ${cas.vitesse}`, tags: ["viscocompare", "comsol", "viscoroute"], origine });
      setMsg({ niveau: "info", texte: `Figure enregistrée dans la bibliothèque : ${String(dossier)} (régénérable depuis les fichiers).` });
    } catch (e) {
      setMsg({ niveau: "erreur", texte: message(e) });
    }
  }

  return (
    <Page
      titre="ViscoCompare"
      sousTitre={racine ? <span className="chemin">{racine}</span> : "Comparaison COMSOL / Viscoroute"}
      actions={
        <>
          {donnees?.cas.length ? (
            <button type="button" disabled={!ctx.espace} onClick={() => void exporterTout()} title="Un classeur par vitesse (comme le script), rangé dans l'espace">
              Tout exporter (classeurs)
            </button>
          ) : null}
          <button type="button" onClick={() => void choisir()}>
            {racine ? "Changer de dossier…" : "Choisir le dossier…"}
          </button>
        </>
      }
    >
      {msg ? <Message niveau={msg.niveau}>{msg.texte}</Message> : null}
      {!racine && !etudes?.length ? (
        <div className="carte">
          <p>
            Indiquez le dossier qui contient <code>COMSOL</code> (un export <code>.csv</code> par vitesse, « V=0.1 » dans le nom) et <code>VISCOROUTE</code> (un dossier
            « Vitesse_0.1 » par vitesse, un <code>.json</code> par grandeur), ou plusieurs sous-dossiers organisés ainsi. Les fichiers lus sont copiés dans l'espace ; le dossier n'est jamais modifié.
          </p>
        </div>
      ) : etudes === null ? (
        <p className="discret">Lecture du dossier…</p>
      ) : etudes.length === 0 ? (
        <Message niveau="attention">Aucun dossier contenant à la fois COMSOL et VISCOROUTE, ni ici ni dans les sous-dossiers directs.</Message>
      ) : (
        <>
          <div className="rangee barre-outils">
            {etudes.length > 1 || etudes[0] ? (
              <label className="libelle">
                <span>Étude</span>
                <select className="champ" value={etude} onChange={(e) => setEtude(e.target.value)}>
                  {etudes.map((e) => (
                    <option key={e} value={e}>
                      {e || "(dossier choisi)"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {donnees?.cas.length ? (
              <span className="segmente">
                {donnees.cas.map((c) => (
                  <button key={c.nom} type="button" className={c.vitesse === vitesse ? "actif" : undefined} onClick={() => setVitesse(c.vitesse)}>
                    V = {c.vitesse}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
          <Conv key={JSON.stringify(conventions)} c={conventions} onChange={setConventions} />
          {!donnees ? (
            <p className="discret">Lecture des résultats…</p>
          ) : (
            <>
              {donnees.ecartes.length ? (
                <Message niveau="attention">
                  Écarté{donnees.ecartes.length > 1 ? "s" : ""} :{" "}
                  {donnees.ecartes.map((x) => (
                    <span key={x.chemin}>
                      <code>{x.chemin}</code> ({x.raison}) ·{" "}
                    </span>
                  ))}
                </Message>
              ) : null}
              {!donnees.cas.length ? (
                <Message niveau="attention">
                  Aucune vitesse commune. COMSOL : {donnees.vitessesComsol.join(", ") || "aucune"} ; Viscoroute : {donnees.vitessesViscoroute.join(", ") || "aucune"}.
                </Message>
              ) : cas ? (
                <Section
                  titre={titreCas(etude, cas.vitesse)}
                  aDroite={
                    <span className="rangee">
                      <button type="button" onClick={() => void exporterCas()}>
                        Excel (.xlsx)
                      </button>
                      {ctx.registre.aAction("figures.enregistrer-image") ? (
                        <button type="button" onClick={() => void versFigures()}>
                          Enregistrer dans Figures
                        </button>
                      ) : null}
                    </span>
                  }
                >
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Grandeur</th>
                        <th>Extremum COMSOL</th>
                        <th>Extremum Viscoroute</th>
                        <th>Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ecarts(cas).map((e) => (
                        <tr key={e.grandeur}>
                          <td>{e.grandeur}</td>
                          <td>{e.comsol ? `${formaterNombre(e.comsol.valeur)} en ${formaterNombre(e.comsol.position)} m` : "—"}</td>
                          <td>{e.viscoroute ? `${formaterNombre(e.viscoroute.valeur)} en ${formaterNombre(e.viscoroute.position)} m` : "—"}</td>
                          <td>{e.ecartPourcent === null ? "—" : `${e.ecartPourcent >= 0 ? "+" : ""}${e.ecartPourcent.toFixed(1)} %`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Courbes key={`${etude}/${cas.nom}`} panneaux={panneauxCas(cas)} xLibelle={X_LIBELLE} onVue={setVue} />
                </Section>
              ) : null}
            </>
          )}
        </>
      )}
    </Page>
  );
}
