/**
 * « Rapport LaTeX » de l'atelier COMSOL : un premier jet de la partie résultats, tiré des fichiers ouverts et des
 * figures de l'étude — cas étudiés, figures (`\input` des exports pgfplots), extrema et critères en booktabs,
 * phrases chiffrées qui comparent les cas au cas de référence. Aperçu en direct, copie ou export .tex.
 */
import { useEffect, useState } from "react";
import {
  CAPTEURS_HWD,
  avecCote,
  avecSurface,
  bassin,
  comparerMaillages,
  ecartMesure,
  expressionDeflexion,
  pairesMaillage,
  courtDe,
  decrireExport,
  expressionParDefaut,
  expressionsCommunes,
  geometrie,
  legendesDe,
  motsDuNom,
  parametresDesExports,
  rapportEnBlocs,
  rapportLatex,
  synthese,
  tableauCriteres,
  titreEtape,
  vueEtape,
  type ChoixParametre,
  type Etape,
  type FigureRapport,
  type Langue,
  type TraceBassin,
  type TraceCriteres,
  type TraceMaillage,
} from "../../core/graph";
import { ecrireDocx } from "@noyau/formats/docx-ecriture";
import { useContexte } from "@interface/contexte";
import { getBackend } from "../platform/backend";
import { useContexteTrace } from "./hooks";
import { figuresDeEtude } from "./lot";
import { useAtelier } from "./useAtelier";

const aujourdhui = () => new Date().toLocaleDateString("fr-FR");

/** Largeur et hauteur d'un PNG (en-tête IHDR). */
const taillePng = (o: Uint8Array) => {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  return o.length > 24
    ? { largeur: v.getUint32(16), hauteur: v.getUint32(20) }
    : null;
};

export function RapportEtude() {
  const ctx = useContexte();
  const c = useContexteTrace();
  const a = useAtelier();
  const legende = legendesDe(c);
  // les fichiers d'origine (pas les calculés), dans l'ordre de la liste
  const base = c.exports.filter((e) => a.fichiers.some((f) => f.nom === e.nom));
  const parNom = new Map(base.map((e) => [e.nom, e]));
  const leg = (nom: string) =>
    parNom.get(nom) ? legende(parNom.get(nom)!) : nom;
  const donnees = base.filter(
    (e) => e.nature !== "table" && geometrie(e).genre !== "point",
  );
  const params = parametresDesExports(base);
  const [langue, setLangue] = useState<Langue>("fr");
  const [virgule, setVirgule] = useState(true);
  const elastique = base.find((e) =>
    motsDuNom(e.nom).some((m) => /^el$/i.test(m)),
  );
  const [reference, setReference] = useState<string | null>(
    elastique?.nom ?? null,
  );
  const [sections, setSections] = useState({
    cas: true,
    figures: true,
    extrema: true,
    criteres: true,
    bassin: true,
    maillage: true,
  });
  // réglages repris des recettes « bassin » et « maillage » de l'étude, s'il y en a
  const traces = a.recettes.map((r) => r.trace);
  const recetteBassin = traces.find(
    (t): t is TraceBassin => t.mode === "bassin",
  );
  const recetteMaillage = traces.find(
    (t): t is TraceMaillage => t.mode === "maillage",
  );
  const dispo = expressionsCommunes(donnees);
  const [choix, setChoix] = useState<string[] | null>(null);
  const expressions = (
    choix ?? [expressionParDefaut(dispo)].filter((x): x is string => !!x)
  ).filter((x) => dispo.includes(x));
  // trafic repris de la recette « critères » de l'étude, s'il y en a une
  const recette = a.recettes
    .map((r) => r.trace)
    .find(
      (t): t is TraceCriteres => t.mode === "criteres" && t.trafic !== null,
    );
  const [trafic, setTrafic] = useState<string>(
    recette?.trafic ? String(recette.trafic) : "",
  );
  const [etapeTexte, setEtapeTexte] = useState("enveloppe:abs");
  const etape: Etape | null = params.length
    ? Object.fromEntries(
        params.map((p) => [
          p.nom,
          (etapeTexte.startsWith("enveloppe:")
            ? { enveloppe: etapeTexte.slice(10) }
            : { valeur: etapeTexte.slice(8) }) as ChoixParametre,
        ]),
      )
    : null;
  const [figures, setFigures] = useState<
    (FigureRapport & { planche: boolean })[] | null
  >(null);
  const [exclues, setExclues] = useState<string[]>([]);
  const [etat, setEtat] = useState("");
  const etude = a.etude;

  useEffect(() => {
    if (!etude) return;
    let fini = false;
    figuresDeEtude(etude.id)
      .then((f) => !fini && setFigures(f))
      .catch(
        (e: unknown) =>
          !fini && setEtat(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      fini = true;
    };
  }, [etude]);

  let tex = "";
  let erreur = "";
  try {
    const vues = donnees.map((e) => vueEtape(e, etape));
    const L = c.cadre.longueur;
    const lignes = expressions.length
      ? synthese(vues, expressions, {
          longueur: L,
          correspondances: c.correspondances,
        }).map((l) => ({ ...l, legende: leg(l.fichier) }))
      : [];
    const T = Number(trafic.replace(",", ".").replace(/\s/g, ""));
    const avecZ = avecCote(vues);
    const surfaces = avecSurface(vues);
    const listeBassins = surfaces.map((e) =>
      bassin(e, {
        expression: expressionDeflexion(e)!,
        centre: recetteBassin?.centre ?? null,
        capteurs: recetteBassin?.capteurs ?? CAPTEURS_HWD,
        rayon: recetteBassin?.rayon ?? 0.2,
        legende: leg(e.nom),
      }),
    );
    const mesure = recetteBassin?.mesure ?? null;
    const lignesMaillage = (
      recetteMaillage?.paires ?? pairesMaillage(vues)
    ).flatMap((p) => {
      const g = vues.find((e) => e.nom === p.grossier);
      const f = vues.find((e) => e.nom === p.fin);
      if (!g || !f) return [];
      return (
        recetteMaillage?.expressions.length
          ? recetteMaillage.expressions
          : expressions
      ).flatMap((x) => {
        try {
          return [comparerMaillages(g, f, x, L)];
        } catch {
          return [];
        }
      });
    });
    tex = rapportLatex(
      {
        titre: a.titre || etude?.titre || "Étude COMSOL",
        id: etude?.id ?? "comsol",
        date: aujourdhui(),
        cas: base.map((e) => {
          const d = decrireExport(e, L);
          return {
            fichier: e.nom,
            legende: leg(e.nom),
            description: `${d.titre}${d.instants ? ` ; ${d.instants}` : ""}`,
          };
        }),
        figures: (figures ?? []).filter((f) => !exclues.includes(f.id)),
        synthese: lignes,
        longueur: L,
        criteres:
          avecZ.length && c.criteres?.length
            ? tableauCriteres(avecZ, c.criteres, {
                longueur: L,
                trafic: T > 0 ? T : null,
                legende: (e) => leg(e.nom),
              })
            : null,
        trafic: T > 0 ? T : null,
        ...(params.length ? { etape: titreEtape(etape, params) } : {}),
        bassins: listeBassins.length
          ? {
              liste: listeBassins,
              ...(mesure
                ? { ecarts: listeBassins.map((b) => ecartMesure(b, mesure)) }
                : {}),
            }
          : null,
        maillage: lignesMaillage,
      },
      { langue, virgule, reference, sections },
    );
  } catch (e) {
    erreur = e instanceof Error ? e.message : String(e);
  }

  const copier = async () => {
    await (await getBackend()).copyText(tex);
    setEtat("Rapport copié dans le presse-papiers.");
  };
  const exporter = async () => {
    if (
      await (
        await getBackend()
      ).saveTextAs(tex, `resultats-${etude?.id ?? "comsol"}.tex`, "tex")
    )
      setEtat("Rapport enregistré.");
  };
  // le même rapport en Word : phrases, tableaux, et les figures de l'étude en images (export.png de la bibliothèque)
  const word = async () => {
    const images = new Map<
      string,
      { png: Uint8Array; largeur: number; hauteur: number }
    >();
    if (ctx.dossierFigures && sections.figures) {
      const fs = ctx.plateforme.fichiers(ctx.dossierFigures);
      for (const f of (figures ?? []).filter((x) => !exclues.includes(x.id))) {
        const png = await fs
          .readBytes(`${f.dossier}/export.png`)
          .catch(() => null);
        const t = png ? taillePng(png) : null;
        if (png && t) images.set(f.dossier, { png, ...t });
      }
    }
    const blocs = rapportEnBlocs(tex, {
      anglais: langue === "en",
      image: (d) => images.get(d) ?? null,
    });
    if (
      await ctx.plateforme.enregistrerSous(
        `resultats-${etude?.id ?? "comsol"}.docx`,
        ecrireDocx(blocs),
      )
    )
      setEtat(
        "Rapport Word enregistré (légendes numérotées par Word : une fois collé dans la thèse, Ctrl+A puis F9 met les numéros à jour).",
      );
  };
  const section = (k: keyof typeof sections, texte: string) => (
    <label className="chip">
      <input
        type="checkbox"
        checked={sections[k]}
        onChange={(e) => setSections({ ...sections, [k]: e.target.checked })}
      />
      {texte}
    </label>
  );

  return (
    <div className="atelier-rapport">
      <div className="atelier-rapport-options">
        <p className="muted small">
          Premier jet de la partie « résultats » : chiffres exacts tirés des
          fichiers ouverts, phrases à relire et à réécrire. À{" "}
          <code>\input</code> dans l'article (préambule : <code>booktabs</code>,{" "}
          <code>figurine</code>).
        </p>
        <div className="grid2">
          <label className="field">
            <span>Langue</span>
            <select
              value={langue}
              onChange={(e) => {
                setLangue(e.target.value as Langue);
                // point décimal en anglais, virgule en français (modifiable ensuite)
                setVirgule(e.target.value === "fr");
              }}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="field">
            <span>Cas de référence (comparaisons)</span>
            <select
              value={reference ?? ""}
              onChange={(e) => setReference(e.target.value || null)}
            >
              <option value="">(aucun)</option>
              {base.map((e) => (
                <option key={e.nom} value={e.nom}>
                  {leg(e.nom)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="chip">
          <input
            type="checkbox"
            checked={virgule}
            onChange={(e) => setVirgule(e.target.checked)}
          />
          Virgule décimale
        </label>
        <fieldset className="atelier-champ">
          <legend>Sections</legend>
          <div className="atelier-grandeurs">
            {section("cas", "Cas étudiés")}
            {section("figures", "Figures")}
            {section("extrema", "Valeurs extrêmes")}
            {section("criteres", "Critères de dimensionnement")}
            {section("bassin", "Bassin de déflexion")}
            {section("maillage", "Convergence du maillage")}
          </div>
        </fieldset>
        <fieldset className="atelier-champ">
          <legend>Grandeurs des valeurs extrêmes</legend>
          <div className="atelier-grandeurs">
            {dispo.map((x) => (
              <label key={x} className="chip">
                <input
                  type="checkbox"
                  checked={expressions.includes(x)}
                  onChange={(e) =>
                    setChoix(
                      e.target.checked
                        ? [...expressions, x]
                        : expressions.filter((y) => y !== x),
                    )
                  }
                />
                {courtDe(donnees[0], x)}
              </label>
            ))}
          </div>
        </fieldset>
        {params.length ? (
          <label className="field">
            <span>Fichiers à plusieurs instants : valeurs prises</span>
            <select
              value={etapeTexte}
              onChange={(e) => setEtapeTexte(e.target.value)}
            >
              <option value="enveloppe:abs">
                Enveloppe : plus grande valeur absolue
              </option>
              <option value="enveloppe:max">Enveloppe : maximum</option>
              <option value="enveloppe:min">Enveloppe : minimum</option>
              {params[0]!.valeurs.map((v) => (
                <option key={v.texte} value={`instant:${v.texte}`}>
                  {params[0]!.nom} = {v.texte}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field">
          <span>Trafic de calcul (cycles, facultatif : dommage)</span>
          <input
            value={trafic}
            onChange={(e) => setTrafic(e.target.value)}
            placeholder="ex. 2e6"
          />
        </label>
        <fieldset className="atelier-champ">
          <legend>Figures de l'étude (bibliothèque)</legend>
          {!etude ? (
            <p className="muted small">
              Enregistrez l'étude, puis créez des figures (« Continuer dans
              Graphes », « Décliner ») : elles viendront ici.
            </p>
          ) : figures === null ? (
            <p className="muted small">Lecture de la bibliothèque…</p>
          ) : figures.length ? (
            figures.map((f) => (
              <label key={f.id} className="chip">
                <input
                  type="checkbox"
                  checked={!exclues.includes(f.id)}
                  onChange={(e) =>
                    setExclues(
                      e.target.checked
                        ? exclues.filter((x) => x !== f.id)
                        : [...exclues, f.id],
                    )
                  }
                />
                {f.planche ? "▦▦ " : ""}
                {f.id} — {f.titre}
              </label>
            ))
          ) : (
            <p className="muted small">
              Aucune figure tracée depuis cette étude pour l'instant.
            </p>
          )}
        </fieldset>
        <div className="rangee-boutons">
          <button
            type="button"
            className="primary"
            disabled={!tex}
            onClick={() => void copier()}
          >
            Copier le LaTeX
          </button>
          <button type="button" disabled={!tex} onClick={() => void exporter()}>
            Exporter .tex…
          </button>
          <button
            type="button"
            disabled={!tex}
            onClick={() => void word()}
            title="Le même rapport en Word : titres, phrases chiffrées, tableaux, figures de l'étude en images, légendes numérotées"
          >
            Word (.docx)…
          </button>
        </div>
        {etat ? <p className="small">{etat}</p> : null}
      </div>
      <div className="atelier-rapport-apercu">
        {erreur ? <p className="banner error">{erreur}</p> : null}
        <textarea
          readOnly
          value={tex}
          aria-label="Rapport LaTeX"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
