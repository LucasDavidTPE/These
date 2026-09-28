/**
 * « Ce que l'on modélise » (étape Calage) : le modèle calé en ressorts, amortisseurs et
 * éléments paraboliques, avec ses constantes (survol : rôle de l'élément ; clic : son
 * curseur), et un essai animé sur une éprouvette cylindrique — sinusoïdal (déformations
 * axiale et radiale, contrainte en avance de φ, boucle σ–ε), fluage ou relaxation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useContexte } from "@interface/contexte";
import { type Essai } from "../core/essai";
import { nb } from "../core/format";
import { disposer, elements, etatSinus, instantSinus, reponse, reseauModele, schemaFigures, temporel, type Organe2D } from "../core/illustration";
import { modele } from "../core/modeles";
import { Bloc } from "./champs";
import { useTraitement } from "./etat";

const ACCENT = "var(--accent, #0b5f5c)";
const EPS0 = 50e-6;

/* ───────────────────────────── schéma rhéologique ───────────────────────────── */

function dessinOrgane(o: Organe2D, actif: boolean) {
  const { x0, x1, y } = o;
  const c = (x0 + x1) / 2;
  const trait = { stroke: actif ? ACCENT : "currentColor", strokeWidth: actif ? 2.2 : 1.4, fill: "none" };
  switch (o.el.kind) {
    case "ressort": {
      const a = x0 + 8,
        b = x1 - 8,
        n = 8,
        pts = [`${x0},${y}`, `${a},${y}`];
      for (let i = 1; i < n; i++) pts.push(`${a + ((b - a) * i) / n},${y + (i % 2 ? -7 : 7)}`);
      pts.push(`${b},${y}`, `${x1},${y}`);
      return <polyline points={pts.join(" ")} {...trait} />;
    }
    case "amortisseur":
    case "parabolique": {
      const g = c - 11,
        d = c + 9,
        piston = c + 1;
      return (
        <g {...trait}>
          <line x1={x0} y1={y} x2={g} y2={y} />
          <polyline points={`${d},${y - 9} ${g},${y - 9} ${g},${y + 9} ${d},${y + 9}`} />
          {o.el.kind === "amortisseur" ? <line x1={piston} y1={y - 6} x2={piston} y2={y + 6} /> : <path d={`M${piston - 3},${y - 6} Q${piston + 5},${y} ${piston - 3},${y + 6}`} />}
          <line x1={o.el.kind === "amortisseur" ? piston : piston + 1} y1={y} x2={x1} y2={y} />
        </g>
      );
    }
    default:
      return (
        <text x={c} y={y + 4} textAnchor="middle" fill="currentColor" fontSize={16}>
          ···
        </text>
      );
  }
}

function SchemaReseau({ e }: { e: Essai }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const r = reseauModele(e);
  const d = disposer(r);
  const els = elements(r);
  const m = modele(e.modeleId);

  function allerAuCurseur(cles: string[]) {
    const d0 = m.parametres.find((p) => cles.includes(p.cle));
    if (!d0) return;
    const champ = document.querySelector<HTMLInputElement>(`.tr-calage input[type="range"][aria-label="${d0.label}"]`);
    champ?.scrollIntoView({ block: "center", behavior: "smooth" });
    champ?.focus();
  }

  const info = survol !== null ? els[survol] : null;
  return (
    <div className="tr-schema">
      <svg viewBox={`0 0 ${d.largeur} ${d.hauteur}`} width="100%" style={{ maxHeight: 260 }} role="img" aria-label={`Schéma du modèle ${m.nom}`}>
        {d.fils.map(([a, b, c, dd], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={dd} stroke="currentColor" strokeWidth={1.4} />
        ))}
        {d.organes.map((o) => (
          <g
            key={o.i}
            className="tr-schema-organe"
            onMouseEnter={() => setSurvol(o.i)}
            onMouseLeave={() => setSurvol(null)}
            onClick={() => allerAuCurseur(o.el.cles)}
            role="button"
            tabIndex={0}
            aria-label={`${o.el.nom} : ${o.el.valeur}`}
            onFocus={() => setSurvol(o.i)}
            onBlur={() => setSurvol(null)}
            onKeyDown={(ev) => ev.key === "Enter" && allerAuCurseur(o.el.cles)}
          >
            <rect x={o.x0} y={o.y - 22} width={o.x1 - o.x0} height={36} fill="transparent" />
            {dessinOrgane(o, survol === o.i)}
            <text x={(o.x0 + o.x1) / 2} y={o.y - 13} textAnchor="middle" fontSize={11} fill={survol === o.i ? ACCENT : "currentColor"} fontWeight={survol === o.i ? 700 : 400}>
              {o.el.nom}
            </text>
            <text x={(o.x0 + o.x1) / 2} y={o.y + 22} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.7}>
              {o.el.valeur}
            </text>
          </g>
        ))}
      </svg>
      <p className="petit tr-schema-info">
        {info ? (
          <>
            <strong>{info.nom}</strong> = {info.valeur} — {info.role}
            {info.cles.length && m.parametres.some((p) => info.cles.includes(p.cle)) ? <span className="discret"> (clic : régler)</span> : null}
          </>
        ) : (
          <span className="discret">Survolez un élément pour voir son rôle et sa valeur ; cliquez pour aller à son curseur. Le schéma suit les constantes.</span>
        )}
      </p>
    </div>
  );
}

/* ───────────────────────────── éprouvette animée ───────────────────────────── */

/** Éprouvette cylindrique vue de côté, déformations exagérées (eax, erad relatifs, −1 à 1). */
function Eprouvette({ eax, erad, force, legende, k = 0.12 }: { eax: number; erad: number; force: number; legende: string; k?: number }) {
  // k : exagération (déformation affichée pour une déformation réduite de 1)
  const H0 = 130,
    D0 = 70;
  const H = H0 * (1 + k * eax),
    D = D0 * (1 + k * erad);
  const cx = 90,
    cy = 122;
  const haut = cy - H / 2,
    bas = cy + H / 2;
  const fleche = Math.max(4, Math.abs(force) * 22);
  const sens = force >= 0 ? 1 : -1; // traction vers l'extérieur
  return (
    <svg viewBox="0 0 180 262" className="tr-eprouvette" role="img" aria-label="Éprouvette déformée">
      <rect x={cx - 48} y={haut - 8} width={96} height={8} fill="currentColor" opacity={0.35} />
      <rect x={cx - 48} y={bas} width={96} height={8} fill="currentColor" opacity={0.35} />
      <rect x={cx - D / 2} y={haut} width={D} height={H} fill={ACCENT} opacity={0.18} stroke={ACCENT} strokeWidth={1.4} rx={2} />
      <ellipse cx={cx} cy={haut} rx={D / 2} ry={5} fill="none" stroke={ACCENT} strokeWidth={1} opacity={0.7} />
      {/* repères du diamètre et de la hauteur initiaux */}
      <rect x={cx - D0 / 2} y={cy - H0 / 2} width={D0} height={H0} fill="none" stroke="currentColor" strokeDasharray="3 3" opacity={0.35} />
      {/* efforts */}
      <line x1={cx} y1={haut - 8} x2={cx} y2={haut - 8 - sens * fleche} stroke="#b5542a" strokeWidth={2.2} markerEnd="url(#tr-pointe)" />
      <line x1={cx} y1={bas + 8} x2={cx} y2={bas + 8 + sens * fleche} stroke="#b5542a" strokeWidth={2.2} markerEnd="url(#tr-pointe)" />
      <defs>
        <marker id="tr-pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#b5542a" />
        </marker>
      </defs>
      <text x={cx} y={256} textAnchor="middle" fontSize={10} fill="currentColor">
        {legende}
      </text>
    </svg>
  );
}

function courbe(pts: [number, number][], x: (v: number) => number, y: (v: number) => number) {
  return pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("");
}

function useHorloge(actif: boolean): number {
  const [t, setT] = useState(0);
  const depart = useRef<number | null>(null);
  useEffect(() => {
    if (!actif) return;
    let id = 0;
    const tic = (now: number) => {
      depart.current ??= now - t * 1000;
      setT((now - depart.current) / 1000);
      id = requestAnimationFrame(tic);
    };
    id = requestAnimationFrame(tic);
    return () => {
      cancelAnimationFrame(id);
      depart.current = null;
    };
    // t n'est lu qu'au démarrage, pour reprendre où l'animation s'était arrêtée
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
  return t;
}

type Mode = "sinus" | "fluage" | "relaxation";

function EssaiAnime({ e }: { e: Essai }) {
  const s = useTraitement();
  const [mode, setMode] = useState<Mode>("sinus");
  const [T, setT] = useState(e.Tref);
  const [lf, setLf] = useState(1); // log10 f
  const [joue, setJoue] = useState(false);
  const t = useHorloge(joue);
  const nuDefaut = e.prony?.nu ?? 0.35;

  const sin = etatSinus(e, T, 10 ** lf, EPS0, nuDefaut);
  // Prony du modèle calé : recalculé quand les constantes ou la température changent.
  const tempo = useMemo(() => (mode === "sinus" ? null : temporel(e, T, mode)), [e, T, mode, s.tour]); // eslint-disable-line react-hooks/exhaustive-deps

  let eprouvette: { eax: number; erad: number; force: number; legende: string; k?: number };
  let trace: React.ReactNode = null;
  let texte: string;
  const W = 300,
    Hc = 150;

  if (mode === "sinus") {
    const theta = t * Math.PI; // un cycle en 2 s, quelle que soit la fréquence (ralenti)
    const now = instantSinus(sin, theta);
    eprouvette = { eax: now.eax, erad: now.erad * 2.5, force: now.sigma, legende: `déformations exagérées ×${nb(0.12 / EPS0, 0)}` };
    const pts = (f: (th: number) => number): [number, number][] => Array.from({ length: 121 }, (_, i) => [i / 120, f(theta - 4 * Math.PI + (i / 120) * 4 * Math.PI)]);
    const X = (v: number) => 10 + v * (W - 20),
      Y = (v: number) => Hc / 2 - v * (Hc / 2 - 12);
    const ell = Array.from({ length: 91 }, (_, i) => instantSinus(sin, (i / 90) * 2 * Math.PI));
    const LX = (v: number) => W + 90 + v * 60,
      LY = (v: number) => Hc / 2 - v * 60;
    trace = (
      <svg viewBox={`0 0 ${W + 170} ${Hc}`} className="tr-anime-courbes" role="img" aria-label="Signaux et boucle contrainte-déformation">
        <line x1={10} y1={Hc / 2} x2={W - 10} y2={Hc / 2} stroke="currentColor" opacity={0.25} />
        <path d={courbe(pts((th) => Math.sin(th)), X, Y)} stroke={ACCENT} strokeWidth={1.8} fill="none" />
        <path d={courbe(pts((th) => instantSinus(sin, th).sigma), X, Y)} stroke="#b5542a" strokeWidth={1.8} fill="none" />
        <path d={courbe(pts((th) => -instantSinus(sin, th).erad / Math.max(0.05, sin.nu.norme)), X, Y)} stroke={ACCENT} strokeDasharray="4 3" strokeWidth={1.2} fill="none" opacity={0.7} />
        <line x1={X(1)} y1={8} x2={X(1)} y2={Hc - 8} stroke="currentColor" opacity={0.4} />
        <text x={14} y={14} fontSize={10} fill={ACCENT}>
          ε_ax (trait plein), −ε_rad/ν (tirets)
        </text>
        <text x={14} y={Hc - 4} fontSize={10} fill="#b5542a">
          σ, en avance de φ = {nb(sin.module.phase, 1)}°
        </text>
        {/* boucle σ–ε */}
        <line x1={LX(-1.1)} y1={LY(0)} x2={LX(1.1)} y2={LY(0)} stroke="currentColor" opacity={0.25} />
        <line x1={LX(0)} y1={LY(-1.1)} x2={LX(0)} y2={LY(1.1)} stroke="currentColor" opacity={0.25} />
        <path d={ell.map((q, i) => `${i ? "L" : "M"}${LX(q.eax).toFixed(1)},${LY(q.sigma).toFixed(1)}`).join("") + "Z"} fill="#b5542a" fillOpacity={0.12} stroke="#b5542a" strokeWidth={1.4} />
        <circle cx={LX(now.eax)} cy={LY(now.sigma)} r={4} fill="#b5542a" />
        <text x={LX(0)} y={12} textAnchor="middle" fontSize={10} fill="currentColor">
          σ/σ₀ en fonction de ε/ε₀
        </text>
      </svg>
    );
    texte = `T = ${nb(T, 0)} °C, f = ${nb(10 ** lf)} Hz → f·a_T = ${nb(sin.fr)} Hz : |E*| = ${nb(sin.module.norme, 0)} MPa, φ = ${nb(sin.module.phase, 1)}°, |ν*| = ${nb(sin.nu.norme, 3)}${sin.nu.modele ? ` (déphasage ${nb(sin.nu.phase, 1)}°)` : " (supposé constant)"}. Pour ε₀ = 50 µm/m : σ₀ = ${nb(sin.sigma0, 3)} MPa, énergie dissipée ${nb(sin.energie, 3)} kJ/m³ par cycle (aire de la boucle).`;
  } else if (tempo) {
    const u = Math.min(1, (t % 8) / 6.5); // 6,5 s de balayage, pause, recommence
    const l0 = Math.log10(tempo.t0),
      l1 = Math.log10(tempo.t1);
    const tt = 10 ** (l0 + u * (l1 - l0));
    const valeurs = Array.from({ length: 101 }, (_, i) => 10 ** (l0 + ((l1 - l0) * i) / 100)).map((x) => [x, reponse(tempo, x)] as [number, number]);
    const vMin = Math.min(...valeurs.map((v) => v[1])),
      vMax = Math.max(...valeurs.map((v) => v[1]));
    const X = (v: number) => 30 + ((Math.log10(v) - l0) / (l1 - l0)) * (W + 120),
      Y = (v: number) => Hc - 14 - ((Math.log10(v) - Math.log10(vMin)) / (Math.log10(vMax / vMin) || 1)) * (Hc - 30);
    const v = reponse(tempo, tt);
    const fluage = mode === "fluage";
    const rel = fluage ? (v - vMin) / (vMax - vMin || 1) : v / vMax;
    eprouvette = fluage
      ? { eax: 0.1 + 0.9 * rel, erad: -(0.1 + 0.9 * rel) * nuDefaut * 2.5, force: 0.7, legende: "σ constante, ε(t) = σ·J(t)", k: 0.3 }
      : { eax: 0.6, erad: -0.6 * nuDefaut * 2.5, force: 0.1 + 0.9 * rel, legende: "ε constante, σ(t) = ε·E(t)", k: 0.3 };
    trace = (
      <svg viewBox={`0 0 ${W + 170} ${Hc}`} className="tr-anime-courbes" role="img" aria-label={fluage ? "Fonction de fluage" : "Module de relaxation"}>
        <path d={valeurs.map(([a, b], i) => `${i ? "L" : "M"}${X(a).toFixed(1)},${Y(b).toFixed(1)}`).join("")} stroke={fluage ? ACCENT : "#b5542a"} strokeWidth={1.8} fill="none" />
        <circle cx={X(tt)} cy={Y(v)} r={4.5} fill={fluage ? ACCENT : "#b5542a"} />
        <line x1={30} y1={Hc - 14} x2={W + 150} y2={Hc - 14} stroke="currentColor" opacity={0.3} />
        {[-3, -1, 1, 3, 5].map((k) => (
          <text key={k} x={X(10 ** k)} y={Hc - 2} fontSize={9} textAnchor="middle" fill="currentColor" opacity={0.7}>
            10{k < 0 ? "⁻" : ""}
            {"⁰¹²³⁴⁵⁶⁷⁸⁹"[Math.abs(k)]} s
          </text>
        ))}
        <text x={34} y={12} fontSize={10} fill="currentColor">
          {fluage ? "J(t) (échelles log) : saut élastique instantané, puis fluage retardé" : "E(t) (échelles log) : la contrainte se relâche"}
        </text>
      </svg>
    );
    texte = fluage
      ? `Fluage à ${nb(T, 0)} °C : t = ${nb(tt)} s, J = ${v.toExponential(3).replace(".", ",")} 1/MPa (instantané ${(1 / tempo.serie.E0).toExponential(2).replace(".", ",")}). Calculé sur la série de Prony (Kelvin-Voigt généralisé) du modèle calé.`
      : `Relaxation à ${nb(T, 0)} °C : t = ${nb(tt)} s, E(t) = ${nb(v, 0)} MPa (instantané ${nb(tempo.serie.E0, 0)} MPa, long terme ${nb(tempo.serie.Einf, 1)} MPa). Calculé sur la série de Prony (Maxwell généralisé) du modèle calé.`;
  } else {
    eprouvette = { eax: 0, erad: 0, force: 0, legende: "" };
    texte = "Pas assez de points translatés pour cette représentation.";
  }

  return (
    <div className="tr-anime">
      <div className="rangee">
        <span className="tr-segmente" role="group" aria-label="Type d'essai">
          {(
            [
              ["sinus", "Sinusoïdal"],
              ["fluage", "Fluage"],
              ["relaxation", "Relaxation"],
            ] as [Mode, string][]
          ).map(([m, l]) => (
            <button key={m} type="button" aria-pressed={mode === m} className={mode === m ? "actif" : undefined} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </span>
        <button type="button" className="principal" onClick={() => setJoue(!joue)} aria-pressed={joue}>
          {joue ? "❚❚ Pause" : "▶ Animer"}
        </button>
        <label className="tr-libelle tr-anime-reglage">
          <span>T = {nb(T, 0)} °C</span>
          <input type="range" min={-30} max={60} step={1} value={T} onChange={(ev) => setT(Number(ev.target.value))} aria-label="Température de l'essai animé" />
        </label>
        {mode === "sinus" ? (
          <label className="tr-libelle tr-anime-reglage">
            <span>f = {nb(10 ** lf)} Hz</span>
            <input type="range" min={-3} max={2} step={0.05} value={lf} onChange={(ev) => setLf(Number(ev.target.value))} aria-label="Fréquence de l'essai animé" />
          </label>
        ) : null}
      </div>
      <div className="tr-anime-scene">
        <Eprouvette {...eprouvette} />
        {trace}
      </div>
      <p className="discret petit">{texte}</p>
    </div>
  );
}

/* ───────────────────────────── bloc ───────────────────────────── */

export function Illustration({ e }: { e: Essai }) {
  const ctx = useContexte();
  const s = useTraitement();
  const [valeurs, setValeurs] = useState(true);
  const m = modele(e.modeleId);

  async function versFigures() {
    const sf = schemaFigures(e, valeurs);
    if (!sf) return;
    try {
      const dossier = await ctx.registre.executer("figures.enregistrer-schema", { ctx, titre: sf.titre, source: `Traitement 2S2P1D : ${e.nom}`, tags: ["2S2P1D", "modèle", m.nom], schema: sf.schema });
      s.signaler(`Schéma enregistré dans Figures (${String(dossier)}) : modifiable dans l'éditeur de schémas, export TikZ.`);
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  return (
    <Bloc titre="Ce que l'on modélise" aide={`${m.nom} : schéma rhéologique et essai animé, aux constantes calées`}>
      <div className="tr-grille-2">
        <div>
          <SchemaReseau e={e} />
          {ctx.registre.aAction("figures.enregistrer-schema") ? (
            <div className="rangee">
              <button type="button" onClick={() => void versFigures()} title="Schéma modifiable dans Figures, export TikZ pour le manuscrit">
                → Figures (schéma TikZ)
              </button>
              <label className="tr-case">
                <input type="checkbox" checked={valeurs} onChange={(ev) => setValeurs(ev.target.checked)} /> avec les valeurs
              </label>
            </div>
          ) : null}
        </div>
        <EssaiAnime e={e} />
      </div>
    </Bloc>
  );
}
