/**
 * Étape 2 et 3 de l'atelier COMSOL : réglages du tracé choisi (au centre) et aperçu en direct (à droite).
 * Chaque mode dit en clair ce qu'il fait ; les choix se font sur ce qui existe dans les fichiers ouverts.
 */
import { useState } from "react";
import {
  FACTEUR_LONGUEUR,
  LIBELLES_PALETTES,
  OPERATIONS,
  PALETTES_CARTE,
  arrondirClic,
  combiner,
  comparables,
  decrireExport,
  geometrie,
  grapheBarres,
  grapheCarte,
  grapheProfils,
  grapheTemporel,
  hauteurEgale,
  libelleColonne,
  lireValeurs,
  motsDuNom,
  pic,
  profilsInterpoles,
  synthese,
  syntheseLatex,
  type ExportComsol,
  type GraphDoc,
  type LigneSynthese,
  type ModePic,
  type Operation,
  type PaletteCarte,
  type Statistique,
} from "../../core/graph";
import { useGraph } from "../graph/useGraph";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { getBackend } from "../platform/backend";
import { AtelierApercu } from "./AtelierApercu";
import { calculer, type Resultat } from "./atelierCalcul";
import { useAtelier, useLegendes } from "./useAtelier";

const fr = (x: number) => String(Number(x.toPrecision(5))).replace(".", ",").replace("-", "−");
const nombre = (t: string) => Number(t.trim().replace(",", ".").replace("−", "-"));
const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");
const communes = (es: readonly ExportComsol[]) => (es.length ? es[0]!.colonnes.map((c) => c.expression).filter((x) => es.every((e) => e.colonnes.some((c) => c.expression === x))) : []);
const court = (e: ExportComsol | undefined, x: string) => {
  const c = e?.colonnes.find((k) => k.expression === x);
  return c ? `${libelleColonne(c).court} (${libelleColonne(c).unite})` : x;
};
const parDefaut = (xs: string[]) => xs.find((x) => /ezz$/i.test(x)) ?? xs[0];

/** Cases à cocher des grandeurs ; `seule` : un choix unique (liste). */
function Grandeurs({ e, liste, actives, set, seule }: { e: ExportComsol | undefined; liste: string[]; actives: string[]; set: (v: string[]) => void; seule?: boolean }) {
  if (seule)
    return (
      <label className="field">
        <span>Grandeur</span>
        <select value={actives[0] ?? ""} onChange={(x) => set([x.target.value])}>
          {liste.map((x) => (
            <option key={x} value={x}>
              {court(e, x)}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <fieldset className="atelier-champ">
      <legend>Grandeurs (une courbe par grandeur cochée)</legend>
      <div className="comsol-expressions">
        {liste.map((x) => (
          <label key={x} className="chip" title={x}>
            <input type="checkbox" checked={actives.includes(x)} onChange={(ev) => set(ev.target.checked ? [...actives, x] : actives.filter((y) => y !== x))} />
            {court(e, x)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Choix d'un fichier dans une liste, décrit en clair. */
function ChoixFichier({ libelle, liste, valeur, set, legende }: { libelle: string; liste: ExportComsol[]; valeur: ExportComsol | undefined; set: (e: ExportComsol) => void; legende: (e: ExportComsol) => string }) {
  const longueur = useAtelier((s) => s.longueur);
  return (
    <label className="field">
      <span>{libelle}</span>
      <select value={valeur ? liste.indexOf(valeur) : 0} onChange={(x) => set(liste[Number(x.target.value)]!)}>
        {liste.map((e, i) => (
          <option key={i} value={i}>
            {legende(e)} — {decrireExport(e, longueur).titre}
          </option>
        ))}
      </select>
    </label>
  );
}

function Colonnes({ options, apercu }: { options: React.ReactNode; apercu: React.ReactNode }) {
  return (
    <>
      <div className="atelier-reglages">{options}</div>
      <section className="atelier-colonne atelier-resultat">
        <h3>
          <span className="atelier-etape">3</span> Aperçu
        </h3>
        {apercu}
      </section>
    </>
  );
}

const interfacesSi = () => (useAtelier.getState().couches ? useReglagesComsol.getState().reglages.interfaces : undefined);

// ---- Comparer des profils ----

export function ModeProfils() {
  const exports = useGraph((s) => s.comsol);
  const a = useAtelier();
  useReglagesComsol((s) => s.reglages);
  const legende = useLegendes();
  const lignes = exports.filter((e) => geometrie(e).genre === "profil");
  const [exclus, setExclus] = useState<string[]>([]);
  const choisis = lignes.filter((e) => !exclus.includes(e.nom));
  const liste = communes(choisis.length ? choisis : lignes);
  const [choix, setChoix] = useState<string[] | null>(null);
  const actives = (choix ?? [parDefaut(liste)].filter((x): x is string => !!x)).filter((x) => liste.includes(x));
  const [orientation, setOrientation] = useState<"auto" | "verticale" | "horizontale">("auto");
  const [profondeur, setProfondeur] = useState(true);
  const enZ = choisis.length > 0 && choisis.every((e) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));
  const resultat: Resultat = calculer(() =>
    choisis.length && actives.length
      ? {
          doc: grapheProfils(choisis, { expressions: actives, longueur: a.longueur, profondeur: enZ && orientation !== "horizontale" && profondeur, orientation, noms: choisis.map(legende), interfaces: interfacesSi() }),
          titre: actives.length === 1 ? `${court(choisis[0], actives[0]!)} — ${choisis.length} profil(s) COMSOL` : `Profils COMSOL — ${choisis.map(legende).join(", ")}`,
        }
      : null,
  );
  return (
    <Colonnes
      options={
        <>
          <fieldset className="atelier-champ">
            <legend>Lignes à superposer (une courbe chacune)</legend>
            {lignes.map((e) => (
              <label key={e.nom} className="chip">
                <input type="checkbox" checked={!exclus.includes(e.nom)} onChange={(x) => setExclus(x.target.checked ? exclus.filter((n) => n !== e.nom) : [...exclus, e.nom])} />
                {legende(e)}
              </label>
            ))}
          </fieldset>
          <Grandeurs e={choisis[0]} liste={liste} actives={actives} set={setChoix} />
          <fieldset className="atelier-champ">
            <legend>Sens du tracé</legend>
            <label className="chip">
              <input type="radio" checked={orientation === "auto"} onChange={() => setOrientation("auto")} />
              Automatique ({enZ ? "ligne verticale : valeur en abscisse, profondeur en ordonnée" : "position en abscisse, valeur en ordonnée"})
            </label>
            <label className="chip">
              <input type="radio" checked={orientation === "verticale"} onChange={() => setOrientation("verticale")} />
              Valeur en abscisse, position en ordonnée
            </label>
            <label className="chip">
              <input type="radio" checked={orientation === "horizontale"} onChange={() => setOrientation("horizontale")} />
              Position en abscisse, valeur en ordonnée
            </label>
            {enZ && orientation !== "horizontale" ? (
              <label className="chip">
                <input type="checkbox" checked={profondeur} onChange={(e) => setProfondeur(e.target.checked)} />
                Profondeur positive, de la surface vers le bas
              </label>
            ) : null}
          </fieldset>
        </>
      }
      apercu={<AtelierApercu resultat={resultat} aide={!choisis.length ? "Cochez au moins une ligne." : undefined} />}
    />
  );
}

// ---- Carte d'une coupe ----

function usePlans() {
  const exports = useGraph((s) => s.comsol);
  return exports.filter((e) => {
    const g = geometrie(e);
    return g.genre === "coupe" && g.reguliere;
  });
}

export function ModeCarte() {
  const a = useAtelier();
  useReglagesComsol((s) => s.reglages);
  const legende = useLegendes();
  const plans = usePlans();
  const [plan, setPlan] = useState<ExportComsol | undefined>(undefined);
  const p = plan && plans.includes(plan) ? plan : plans[0];
  const liste = p ? p.colonnes.map((c) => c.expression) : [];
  const [choix, setChoix] = useState<string | null>(null);
  const expr = choix && liste.includes(choix) ? choix : parDefaut(liste);
  const [palette, setPalette] = useState<PaletteCarte | "auto">("auto");
  const [iso, setIso] = useState("");
  const [egalite, setEgalite] = useState(false);
  const resultat: Resultat = calculer(() => {
    if (!p || !expr) return null;
    let doc: GraphDoc = grapheCarte(p, expr, a.longueur, { interfaces: interfacesSi() });
    const isolignes = lireValeurs(iso.replace(/−/g, "-"));
    doc = { ...doc, carte: { ...doc.carte!, ...(palette !== "auto" ? { palette } : {}), ...(isolignes.length ? { isolignes } : {}) } };
    if (egalite) doc = { ...doc, egalite: true, height: hauteurEgale({ ...doc, egalite: true }) };
    return { doc, titre: `${legende(p)} — ${court(p, expr)}` };
  });
  return (
    <Colonnes
      options={
        <>
          <ChoixFichier libelle="Plan de coupe" liste={plans} valeur={p} set={setPlan} legende={legende} />
          <Grandeurs e={p} liste={liste} actives={expr ? [expr] : []} set={(v) => setChoix(v[0] ?? null)} seule />
          <label className="field">
            <span>Couleurs</span>
            <select value={palette} onChange={(e) => setPalette(e.target.value as PaletteCarte | "auto")}>
              <option value="auto">Automatique (rouge-bleu si le signe change, sinon viridis)</option>
              {PALETTES_CARTE.map((x) => (
                <option key={x} value={x}>
                  {LIBELLES_PALETTES[x]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Isolignes (valeurs séparées par ;, facultatif)</span>
            <input value={iso} onChange={(e) => setIso(e.target.value)} placeholder="−200 ; −100 ; 0" />
          </label>
          <label className="chip">
            <input type="checkbox" checked={egalite} onChange={(e) => setEgalite(e.target.checked)} />
            Vraies proportions (1 m = 1 m)
          </label>
          <p className="muted small">Bornes des couleurs, contour d'empreinte, annotations, taille : dans Graphes, après « Continuer ».</p>
        </>
      }
      apercu={<AtelierApercu resultat={resultat} />}
    />
  );
}

// ---- Profils dans une coupe (clic sur la carte) ----

export function ModeCoupeProfils() {
  const a = useAtelier();
  useReglagesComsol((s) => s.reglages);
  const legende = useLegendes();
  const plans = usePlans();
  const [plan, setPlan] = useState<ExportComsol | undefined>(undefined);
  const p = plan && plans.includes(plan) ? plan : plans[0];
  const liste = p ? p.colonnes.map((c) => c.expression) : [];
  const [choix, setChoix] = useState<string | null>(null);
  const expr = choix && liste.includes(choix) ? choix : parDefaut(liste);
  const [sens, setSens] = useState<"verticales" | "horizontales">("verticales");
  const [valeurs, setValeurs] = useState<number[]>([]);
  const [saisie, setSaisie] = useState("");
  const [profondeur, setProfondeur] = useState(true);
  const g = p ? geometrie(p) : null;
  const [kx, ky] = (g?.varient ?? [0, 1]) as [number, number];
  const nomH = p ? p.coordonnees[kx]!.toLowerCase() : "x";
  const nomV = p ? p.coordonnees[ky]!.toLowerCase() : "z";
  const fixe = sens === "verticales" ? kx : ky;
  const nomFixe = sens === "verticales" ? nomH : nomV;
  const lettre = (i: number) => String.fromCharCode(97 + (i % 26));

  const carte: Resultat = calculer(() => {
    if (!p || !expr) return null;
    const doc = grapheCarte(p, expr, a.longueur, { interfaces: interfacesSi() });
    return {
      doc: { ...doc, reperes: [...(doc.reperes ?? []), ...valeurs.map((v, i) => ({ axe: sens === "verticales" ? ("x" as const) : ("y" as const), valeur: v, texte: lettre(i), trait: "solid" as const }))] },
      titre: "",
    };
  });
  const etendue = carte && "doc" in carte ? (sens === "verticales" ? carte.doc.carte!.x : carte.doc.carte!.y) : [0, 1];
  const ajouter = (v: number) => setValeurs([...valeurs, arrondirClic(v, etendue.at(-1)! - etendue[0]!)].filter((x, i, t) => t.indexOf(x) === i));
  const resultat: Resultat = calculer(() => {
    if (!p || !expr || !valeurs.length) return null;
    const f = FACTEUR_LONGUEUR[a.longueur]! / (FACTEUR_LONGUEUR[p.uniteLongueur] ?? 1);
    const profils = profilsInterpoles(
      p,
      fixe,
      valeurs.map((v) => v / f),
    ).map((x, i) => ({ ...x, legende: `${lettre(i)}. $${nomFixe}$ = ${fr(valeurs[i]!)} ${a.longueur}` }));
    return {
      doc: grapheProfils(profils, { expressions: [expr], longueur: a.longueur, profondeur, interfaces: interfacesSi() }),
      titre: `${court(p, expr)} — profils à ${nomFixe} = ${valeurs.map(fr).join(" ; ")} ${a.longueur}`,
    };
  });
  return (
    <Colonnes
      options={
        <>
          <ChoixFichier libelle="Plan de coupe" liste={plans} valeur={p} set={(e) => (setPlan(e), setValeurs([]))} legende={legende} />
          <Grandeurs e={p} liste={liste} actives={expr ? [expr] : []} set={(v) => setChoix(v[0] ?? null)} seule />
          <fieldset className="atelier-champ">
            <legend>Lignes à placer</legend>
            <label className="chip">
              <input type="radio" checked={sens === "verticales"} onChange={() => (setSens("verticales"), setValeurs([]))} />
              Verticales : à {nomH} fixé (profils le long de {nomV})
            </label>
            <label className="chip">
              <input type="radio" checked={sens === "horizontales"} onChange={() => (setSens("horizontales"), setValeurs([]))} />
              Horizontales : à {nomV} fixé (profils le long de {nomH})
            </label>
          </fieldset>
          <p className="atelier-consigne">
            <strong>Cliquez sur la carte</strong> pour placer une ligne, ou tapez des valeurs de {nomFixe} ({a.longueur}) :
          </p>
          <div className="comsol-ligne">
            <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="700 ; 848 ; 900 ; 967" onKeyDown={(e) => e.key === "Enter" && (setValeurs([...valeurs, ...lireValeurs(saisie.replace(/−/g, "-"))]), setSaisie(""))} />
            <button
              type="button"
              disabled={!lireValeurs(saisie).length}
              onClick={() => {
                setValeurs([...valeurs, ...lireValeurs(saisie.replace(/−/g, "-"))]);
                setSaisie("");
              }}
            >
              Ajouter
            </button>
          </div>
          <div className="atelier-grandeurs">
            {valeurs.map((v, i) => (
              <span key={i} className="atelier-puce">
                {lettre(i)}. {nomFixe} = {fr(v)} {a.longueur}{" "}
                <button type="button" className="lien" aria-label="Retirer" onClick={() => setValeurs(valeurs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
            {valeurs.length ? (
              <button type="button" className="lien" onClick={() => setValeurs([])}>
                tout retirer
              </button>
            ) : null}
          </div>
          {sens === "verticales" && /^z$/i.test(nomV) ? (
            <label className="chip">
              <input type="checkbox" checked={profondeur} onChange={(e) => setProfondeur(e.target.checked)} />
              Profondeur positive, de la surface vers le bas
            </label>
          ) : null}
        </>
      }
      apercu={
        <>
          <AtelierApercu resultat={carte} onClic={(x, y) => ajouter(sens === "verticales" ? x : y)} sansEnvoi petit aide="Carte : cliquez pour placer une ligne (a, b, c…)." />
          <AtelierApercu resultat={resultat} aide={valeurs.length ? "Profils le long des lignes placées :" : undefined} />
        </>
      }
    />
  );
}

// ---- Signal dans le temps ----

export function ModeTemps() {
  const exports = useGraph((s) => s.comsol);
  const legende = useLegendes();
  const tables = exports.filter((e) => e.nature === "table");
  const [exclus, setExclus] = useState<string[]>([]);
  const choisies = tables.filter((e) => !exclus.includes(e.nom));
  const liste = communes(choisies.length ? choisies : tables);
  const [choix, setChoix] = useState<string[] | null>(null);
  const actives = (choix ?? liste.slice(0, 1)).filter((x) => liste.includes(x));
  const [refMode, setRefMode] = useState<string>("aucune");
  const [refValeur, setRefValeur] = useState("");
  const [refTexte, setRefTexte] = useState("Élastique");
  const [instant, setInstant] = useState("10");
  const [modePic, setModePic] = useState<ModePic | "">("abs");
  const resultat: Resultat = calculer(() => {
    if (!choisies.length || !actives.length) return null;
    let reference: { valeur: number; texte: string } | null = null;
    if (refMode === "valeur" && refValeur.trim()) {
      const v = nombre(refValeur);
      if (!Number.isFinite(v)) throw new Error("Valeur de référence : un nombre.");
      reference = { valeur: v, texte: refTexte };
    } else if (refMode !== "aucune" && refMode !== "valeur") {
      const e = exports[Number(refMode)]!;
      const j = e.colonnes.findIndex((c) => c.expression === actives[0]);
      if (j < 0) throw new Error(`${legende(e)} n'a pas la grandeur ${court(choisies[0], actives[0]!)}.`);
      const pk = pic(e.valeurs[0]!, e.valeurs[e.coordonnees.length + j]!, "abs");
      if (pk) reference = { valeur: Number(pk.y.toPrecision(6)), texte: refTexte || legende(e) };
    }
    const t = nombre(instant);
    return {
      doc: grapheTemporel(choisies, { expressions: actives, noms: choisies.map(legende), reference, instant: instant.trim() && Number.isFinite(t) ? t : null, pic: modePic || null }),
      titre: `${court(choisies[0], actives[0]!)} au cours du temps — ${choisies.map(legende).join(", ")}`,
    };
  });
  return (
    <Colonnes
      options={
        <>
          <fieldset className="atelier-champ">
            <legend>Signaux à superposer</legend>
            {tables.map((e) => (
              <label key={e.nom} className="chip">
                <input type="checkbox" checked={!exclus.includes(e.nom)} onChange={(x) => setExclus(x.target.checked ? exclus.filter((n) => n !== e.nom) : [...exclus, e.nom])} />
                {legende(e)}
              </label>
            ))}
          </fieldset>
          <Grandeurs e={choisies[0]} liste={liste} actives={actives} set={setChoix} />
          <fieldset className="atelier-champ">
            <legend>Valeur de référence (trait horizontal)</legend>
            <select value={refMode} onChange={(e) => setRefMode(e.target.value)}>
              <option value="aucune">Aucune</option>
              <option value="valeur">Une valeur que je tape</option>
              {exports.map((e, i) =>
                e.colonnes.some((c) => c.expression === actives[0]) ? (
                  <option key={i} value={String(i)}>
                    Le pic de « {legende(e)} » ({sansExt(e.nom)})
                  </option>
                ) : null,
              )}
            </select>
            {refMode === "valeur" ? <input value={refValeur} onChange={(e) => setRefValeur(e.target.value)} placeholder="−152" aria-label="Valeur" /> : null}
            {refMode !== "aucune" ? <input value={refTexte} onChange={(e) => setRefTexte(e.target.value)} aria-label="Texte de la référence" placeholder="Élastique" /> : null}
          </fieldset>
          <label className="field">
            <span>Instant repère, en s (trait vertical ; vide = aucun)</span>
            <input value={instant} onChange={(e) => setInstant(e.target.value)} />
          </label>
          <label className="field">
            <span>Pic à annoter (valeur, instant, décalage par rapport à l'instant repère)</span>
            <select value={modePic} onChange={(e) => setModePic(e.target.value as ModePic | "")}>
              <option value="">Aucun</option>
              <option value="abs">Plus grande valeur absolue</option>
              <option value="max">Maximum</option>
              <option value="min">Minimum</option>
            </select>
          </label>
        </>
      }
      apercu={<AtelierApercu resultat={resultat} />}
    />
  );
}

// ---- Comparer deux cas ----

const EXPLICATIONS: Record<Operation, string> = {
  rapport: "A / B : 1,5 = A vaut une fois et demie B.",
  difference: "A − B, dans l'unité de la grandeur.",
  ecart: "(A − B) / |B| en % ; attention au signe pour des compressions (valeurs négatives).",
};

export function ModeComparer() {
  const exports = useGraph((s) => s.comsol);
  const a = useAtelier();
  useReglagesComsol((s) => s.reglages);
  const legende = useLegendes();
  const [ia, setIa] = useState(0);
  const [ib, setIb] = useState(1);
  const [op, setOp] = useState<Operation>("rapport");
  const [choix, setChoix] = useState<string | null>(null);
  const A = exports[Math.min(ia, exports.length - 1)];
  const B = exports[Math.min(ib, exports.length - 1)];
  const raison = A && B ? comparables(A, B) : "Choisissez A et B.";
  const liste = A && B && !raison ? communes([A, B]) : [];
  const expr = choix && liste.includes(choix) ? choix : parDefaut(liste);
  const resultat: Resultat = calculer(() => {
    if (raison) throw new Error(raison);
    if (!A || !B || !expr) return null;
    const res = combiner(A, B, op, { nomA: legende(A), nomB: legende(B), expressions: [expr] });
    const g = geometrie(res).genre;
    const titre = `${court(A, expr)} : ${res.legende}`;
    if (g === "coupe") return { doc: grapheCarte(res, expr, a.longueur, { interfaces: interfacesSi() }), titre };
    if (g === "profil") return { doc: grapheProfils([res], { expressions: [expr], longueur: a.longueur, profondeur: true, noms: [res.legende!], interfaces: interfacesSi() }), titre };
    if (g === "serie") return { doc: grapheTemporel([res], { expressions: [expr], noms: [res.legende!] }), titre };
    throw new Error("Ce genre de fichier ne se trace pas directement ; le résultat peut aller dans la synthèse.");
  });
  const choixFichier = (libelle: string, v: number, set: (n: number) => void, autre?: ExportComsol) => (
    <label className="field">
      <span>{libelle}</span>
      <select value={Math.min(v, exports.length - 1)} onChange={(e) => set(Number(e.target.value))}>
        {exports.map((e, i) => {
          const r = autre && autre !== e ? comparables(autre, e) : null;
          return (
            <option key={i} value={i}>
              {autre === e ? "= A : " : r ? "✗ " : autre ? "✓ " : ""}
              {legende(e)} ({sansExt(e.nom)})
            </option>
          );
        })}
      </select>
    </label>
  );
  return (
    <Colonnes
      options={
        <>
          {choixFichier("Cas A", ia, setIa)}
          {choixFichier("Cas B (✓ = même grille que A)", ib, setIb, A)}
          <fieldset className="atelier-champ">
            <legend>Opération, point par point</legend>
            {(Object.keys(OPERATIONS) as Operation[]).map((o) => (
              <label key={o} className="chip" title={EXPLICATIONS[o]}>
                <input type="radio" checked={op === o} onChange={() => setOp(o)} />
                {OPERATIONS[o]}
              </label>
            ))}
            <p className="muted small">{EXPLICATIONS[op]}</p>
          </fieldset>
          {liste.length ? <Grandeurs e={A} liste={liste} actives={expr ? [expr] : []} set={(v) => setChoix(v[0] ?? null)} seule /> : null}
          <button
            type="button"
            disabled={!!raison || !A || !B}
            title="Le résultat rejoint la liste des fichiers : carte, profils dans une coupe, synthèse…"
            onClick={() => {
              try {
                if (A && B) useGraph.setState({ comsol: [...exports, combiner(A, B, op, { nomA: legende(A), nomB: legende(B) })] });
              } catch (e) {
                window.alert(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Garder le résultat dans la liste des fichiers
          </button>
        </>
      }
      apercu={<AtelierApercu resultat={resultat} />}
    />
  );
}

// ---- Tableau de synthèse ----

export function ModeSynthese() {
  const exports = useGraph((s) => s.comsol);
  const a = useAtelier();
  const reg = useReglagesComsol();
  const legende = useLegendes();
  const [choixFichiers, setChoixFichiers] = useState<Record<string, boolean>>({});
  const inclus = (e: ExportComsol) => choixFichiers[e.nom] ?? (!e.legende && e.nature !== "table" && geometrie(e).genre !== "point");
  const fichiers = exports.filter(inclus);
  const liste = communes(fichiers);
  const [choix, setChoix] = useState<string[] | null>(null);
  const actives = (choix ?? [parDefaut(liste)].filter((x): x is string => !!x)).filter((x) => liste.includes(x));
  const [virgule, setVirgule] = useState(true);
  const mots = fichiers.length ? motsDuNom(fichiers[0]!.nom) : [];
  const [categorie, setCategorie] = useState<number | null>(null);
  const [groupe, setGroupe] = useState<number | null>(null);
  const [stat, setStat] = useState<Statistique>("abs");
  const [exprBarres, setExprBarres] = useState<string | null>(null);
  const cat = categorie ?? Math.max(0, mots.length - 1);
  const grp = groupe ?? Math.max(0, mots.length - 2);
  let lignes: LigneSynthese[] = [];
  let erreur = "";
  try {
    lignes = actives.length ? synthese(fichiers, actives, { longueur: a.longueur, correspondances: reg.reglages.correspondances }) : [];
  } catch (e) {
    erreur = e instanceof Error ? e.message : String(e);
  }
  // légendes de l'atelier (saisies comprises) plutôt que celles recalculées sur la sélection
  lignes = lignes.map((l) => ({ ...l, legende: legende(fichiers.find((e) => e.nom === l.fichier)!) }));
  const xBarres = exprBarres && actives.includes(exprBarres) ? exprBarres : actives[0];
  const barres: Resultat = calculer(() =>
    lignes.length && xBarres ? { doc: grapheBarres(lignes, { expression: xBarres, categorie: cat, groupe: grp, statistique: stat, correspondances: reg.reglages.correspondances }), titre: `${court(fichiers[0], xBarres)} — synthèse COMSOL` } : null,
  );
  const tex = () => syntheseLatex(lignes, { longueur: a.longueur, virgule });
  return (
    <Colonnes
      options={
        <>
          <fieldset className="atelier-champ">
            <legend>Cas (une ligne du tableau chacun)</legend>
            {exports.map((e) => (
              <label key={e.nom} className="chip" title={e.nom}>
                <input type="checkbox" checked={inclus(e)} onChange={(x) => setChoixFichiers({ ...choixFichiers, [e.nom]: x.target.checked })} />
                {legende(e)}
              </label>
            ))}
          </fieldset>
          <Grandeurs e={fichiers[0]} liste={liste} actives={actives} set={setChoix} />
          <label className="chip">
            <input type="checkbox" checked={virgule} onChange={(e) => setVirgule(e.target.checked)} />
            Virgule décimale dans le LaTeX
          </label>
          <fieldset className="atelier-champ">
            <legend>Diagramme en barres</legend>
            <label className="field">
              <span>Grandeur</span>
              <select value={xBarres ?? ""} onChange={(e) => setExprBarres(e.target.value)}>
                {actives.map((x) => (
                  <option key={x} value={x}>
                    {court(fichiers[0], x)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">Les groupes viennent des mots du nom de fichier (ex. « {fichiers[0] ? sansExt(fichiers[0].nom) : "coupeXZ_R1_VE_het"} »).</p>
            <label className="field">
              <span>En abscisse (groupes)</span>
              <select value={cat} onChange={(e) => setCategorie(Number(e.target.value))}>
                {mots.map((m, i) => (
                  <option key={i} value={i}>
                    mot {i + 1} : « {m} »
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>En couleurs (une barre par)</span>
              <select value={grp} onChange={(e) => setGroupe(Number(e.target.value))}>
                {mots.map((m, i) => (
                  <option key={i} value={i}>
                    mot {i + 1} : « {m} »
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Valeur</span>
              <select value={stat} onChange={(e) => setStat(e.target.value as Statistique)}>
                <option value="abs">Extremum (plus grande valeur absolue)</option>
                <option value="max">Maximum</option>
                <option value="min">Minimum</option>
              </select>
            </label>
          </fieldset>
        </>
      }
      apercu={
        <>
          {erreur ? <p className="banner error">{erreur}</p> : null}
          {lignes.length ? (
            <>
              <div className="comsol-synthese">
                <table>
                  <thead>
                    <tr>
                      <th>Cas</th>
                      <th>Grandeur</th>
                      <th>Max</th>
                      <th>à ({a.longueur})</th>
                      <th>Min</th>
                      <th>à ({a.longueur})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={i}>
                        <td title={l.fichier}>{l.legende}</td>
                        <td>
                          {l.libelle.court} ({l.libelle.unite})
                        </td>
                        <td>{fr(l.max)}</td>
                        <td>{Object.entries(l.posMax).map(([k, v]) => `${k.toLowerCase()} ${fr(v)}`).join(", ")}</td>
                        <td>{fr(l.min)}</td>
                        <td>{Object.entries(l.posMin).map(([k, v]) => `${k.toLowerCase()} ${fr(v)}`).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rangee-boutons">
                <button type="button" onClick={() => void getBackend().then((b) => b.copyText(tex()))}>
                  Copier le tableau LaTeX (booktabs)
                </button>
                <button type="button" onClick={() => void getBackend().then((b) => b.saveTextAs(tex(), "synthese-comsol.tex", "tex"))}>
                  Exporter .tex…
                </button>
              </div>
            </>
          ) : (
            <div className="atelier-apercu vide">Cochez des cas et des grandeurs.</div>
          )}
          {lignes.length ? <AtelierApercu resultat={barres} aide="Diagramme en barres :" /> : null}
        </>
      }
    />
  );
}
