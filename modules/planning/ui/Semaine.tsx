/**
 * Vue Semaine, à la manière d'un agenda : cliquer (ou glisser) sur un créneau ouvre une bulle
 * de création rapide ; glisser un élément le déplace, glisser son bas change la fin ; en haut,
 * la bande « toute la journée » (périodes, jalons, éléments des autres modules). Une lecture
 * de la colonne « À lire » se dépose sur un créneau.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Barre } from "../core/gantt";
import { elementVide, type Categorie, type Element } from "../core/modele";
import { aligner, bande, decaler, disposer, heure, jours, libelleJour, minutes, PAS_MINUTES, placer } from "../core/semaine";

export const TYPE_LECTURE = "application/x-these-lecture";
const PX_MIN = 0.8;
const H_LIGNE_BANDE = 22;
const L_BULLE = 320;

/** Ce que la colonne « À lire » glisse sur la semaine. */
export interface Lecture {
  id: string;
  citation: string;
  titre: string;
  priorite: string;
  mois: number | null;
  etat: string;
  statut: string;
  heures: number;
  score: number;
}

type Glisse =
  | { mode: "creer"; date: string; m0: number; m1: number }
  | { mode: "deplacer" | "etirer"; id: string; x0: number; y0: number; colW: number; dMin: number; dJours: number; bouge: boolean }
  | { mode: "bande"; id: string | null; col0: number; col1: number; x0: number; dJours: number; bouge: boolean };

interface Brouillon {
  date: string;
  dateFin: string;
  debut: number;
  fin: number;
  journee: boolean;
}

interface Ancre {
  gauche: number;
  droite: number;
  haut: number;
}

const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dateLongue = (d: string) => DATE_LONGUE.format(new Date(`${d}T00:00:00Z`));

function horaire(b: Pick<Barre, "debut" | "fin" | "heureDebut" | "heureFin">): string {
  if (b.heureDebut) return `${dateLongue(b.debut)} · ${b.heureDebut} – ${b.heureFin}`;
  if (!b.fin) return `${dateLongue(b.debut)} · jalon`;
  return b.fin === b.debut ? dateLongue(b.debut) : `${dateLongue(b.debut)} → ${dateLongue(b.fin)}`;
}

export function Semaine({
  premier,
  n,
  aujourdhui,
  barres,
  couleur,
  categories,
  element,
  creer,
  enregistrer,
  supprimer,
  editer,
  nouvelleLecture,
  ouvrirFiche,
  marquerLu,
  allerA,
  ouvrirId,
  onOuvert,
}: {
  premier: string;
  n: number;
  aujourdhui: string;
  barres: Barre[];
  couleur(b: Barre): string;
  categories: Categorie[];
  /** L'élément modifiable derrière une barre (undefined : fourni par un autre module). */
  element(id: string): Element | undefined;
  creer(e: Element): Promise<string | undefined>;
  enregistrer(id: string, e: Element): void;
  supprimer(id: string): void;
  /** Formulaire complet (« Plus d'options », « Modifier »). */
  editer(id: string | null, e: Element): void;
  nouvelleLecture(l: Lecture, date: string, debut: number | null): void;
  ouvrirFiche?(refId: string): void;
  marquerLu?(id: string, refId: string): void;
  allerA(source: string): void;
  /** Élément dont il faut ouvrir la bulle (après « Placer » dans la colonne À lire). */
  ouvrirId?: string | null;
  onOuvert?(): void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const corps = useRef<HTMLDivElement>(null);
  const colonnes = useRef<HTMLDivElement>(null);
  const bandeRef = useRef<HTMLDivElement>(null);
  const [glisse, setGlisse] = useState<Glisse | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [ancre, setAncre] = useState<Ancre | null>(null);
  const [survol, setSurvol] = useState<{ date: string; debut: number; duree: number } | null>(null);
  const [hauteur, setHauteur] = useState(520);
  const [maintenant, setMaintenant] = useState(() => new Date());
  const js = jours(premier, n);

  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  // La grille occupe la fenêtre jusqu'en bas ; la journée commence à 7 h 30 à l'écran.
  const mesurer = () => {
    const el = corps.current;
    if (!el) return;
    const h = Math.max(360, Math.round(window.innerHeight - el.getBoundingClientRect().top - 20));
    setHauteur((x) => (Math.abs(x - h) > 2 ? h : x));
  };
  useLayoutEffect(() => {
    if (corps.current) corps.current.scrollTop = 7.5 * 60 * PX_MIN;
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, []);
  // Un message affiché au-dessus décale la grille : la hauteur suit.
  useLayoutEffect(mesurer);
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, []);
  // Ouvre la bulle d'un élément placé depuis la colonne « À lire ».
  useEffect(() => {
    if (!ouvrirId) return;
    const el = racine.current?.querySelector(`[data-ev="${ouvrirId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    choisir(ouvrirId, el);
    onOuvert?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvrirId, barres]);

  function fermer() {
    setBrouillon(null);
    setChoisi(null);
    setAncre(null);
  }

  /** Position (dans la racine) d'un élément de l'écran, pour placer la bulle à côté. */
  function ancrer(r: DOMRect): Ancre {
    const o = racine.current!.getBoundingClientRect();
    return { gauche: r.left - o.left, droite: r.right - o.left, haut: r.top - o.top };
  }

  function choisir(id: string, el: globalThis.Element) {
    setBrouillon(null);
    setChoisi(id);
    setAncre(ancrer(el.getBoundingClientRect()));
  }

  const rectCols = () => colonnes.current!.getBoundingClientRect();
  const colonneDe = (x: number, r = rectCols()) => Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)));
  const minuteDe = (y: number, r = rectCols()) => Math.max(0, Math.min(24 * 60 - PAS_MINUTES, (y - r.top) / PX_MIN));
  const largeurCol = () => rectCols().width / n;

  // ---- Grille horaire ----
  function saisir(ev: React.PointerEvent) {
    if (ev.button !== 0) return;
    const cible = (ev.target as HTMLElement).closest<HTMLElement>("[data-ev]");
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    if (cible) {
      const id = cible.dataset.ev!;
      if (!element(id)) {
        setGlisse({ mode: "deplacer", id, x0: ev.clientX, y0: ev.clientY, colW: largeurCol(), dMin: 0, dJours: 0, bouge: false });
        return;
      }
      const mode = (ev.target as HTMLElement).closest("[data-poignee]") ? "etirer" : "deplacer";
      setGlisse({ mode, id, x0: ev.clientX, y0: ev.clientY, colW: largeurCol(), dMin: 0, dJours: 0, bouge: false });
      return;
    }
    fermer();
    const m = Math.floor(minuteDe(ev.clientY) / PAS_MINUTES) * PAS_MINUTES;
    setGlisse({ mode: "creer", date: js[colonneDe(ev.clientX)]!, m0: m, m1: m });
  }

  function bouger(ev: React.PointerEvent) {
    if (!glisse) return;
    if (glisse.mode === "creer") {
      setGlisse({ ...glisse, m1: aligner(minuteDe(ev.clientY)) });
    } else if (glisse.mode === "deplacer" || glisse.mode === "etirer") {
      const bouge = glisse.bouge || Math.abs(ev.clientX - glisse.x0) + Math.abs(ev.clientY - glisse.y0) > 4;
      if (!element(glisse.id)) return;
      setGlisse({ ...glisse, bouge, dMin: aligner((ev.clientY - glisse.y0) / PX_MIN), dJours: glisse.mode === "deplacer" ? Math.round((ev.clientX - glisse.x0) / glisse.colW) : 0 });
    }
  }

  function lacher() {
    const g = glisse;
    setGlisse(null);
    if (!g) return;
    if (g.mode === "creer") {
      const debut = Math.min(g.m0, g.m1);
      const fin = Math.abs(g.m1 - g.m0) < PAS_MINUTES ? debut + 60 : Math.max(g.m0, g.m1);
      setBrouillon({ date: g.date, dateFin: g.date, debut, fin: Math.min(fin, 24 * 60 - 1), journee: false });
      const r = rectCols();
      const c = js.indexOf(g.date);
      const w = r.width / n;
      setAncre(ancrer(new DOMRect(r.left + c * w, r.top + debut * PX_MIN, w, (fin - debut) * PX_MIN)));
      return;
    }
    if (g.mode !== "deplacer" && g.mode !== "etirer") return;
    const cible = racine.current?.querySelector(`[data-ev="${g.id}"]`);
    if (!g.bouge) {
      if (cible) choisir(g.id, cible);
      return;
    }
    const e = element(g.id);
    if (!e || !e.heureDebut) return;
    const d0 = minutes(e.heureDebut);
    const f0 = minutes(e.heureFin);
    if (g.mode === "deplacer") {
      const i = Math.max(0, Math.min(n - 1, js.indexOf(e.debut) + g.dJours));
      const date = js.indexOf(e.debut) >= 0 ? js[i]! : e.debut;
      enregistrer(g.id, placer(e, date, d0 + g.dMin, f0 + g.dMin));
    } else {
      enregistrer(g.id, placer(e, e.debut, d0, Math.max(d0 + PAS_MINUTES, f0 + g.dMin)));
    }
  }

  // ---- Bande « toute la journée » ----
  const places = bande(barres, premier, n);
  const lignes = Math.max(1, ...places.map((p) => p.ligne + 1));

  function saisirBande(ev: React.PointerEvent) {
    if (ev.button !== 0) return;
    const r = bandeRef.current!.getBoundingClientRect();
    const col = Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - r.left) / r.width) * n)));
    const cible = (ev.target as HTMLElement).closest<HTMLElement>("[data-ev]");
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    if (!cible) fermer();
    setGlisse({ mode: "bande", id: cible?.dataset.ev ?? null, col0: col, col1: col, x0: ev.clientX, dJours: 0, bouge: false });
  }

  function bougerBande(ev: React.PointerEvent) {
    if (!glisse || glisse.mode !== "bande") return;
    const r = bandeRef.current!.getBoundingClientRect();
    const col = Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - r.left) / r.width) * n)));
    const bouge = glisse.bouge || Math.abs(ev.clientX - glisse.x0) > 4;
    setGlisse({ ...glisse, col1: col, bouge, dJours: glisse.id && element(glisse.id) ? Math.round((ev.clientX - glisse.x0) / (r.width / n)) : 0 });
  }

  function lacherBande() {
    const g = glisse;
    setGlisse(null);
    if (!g || g.mode !== "bande") return;
    if (g.id) {
      const cible = racine.current?.querySelector(`[data-ev="${g.id}"]`);
      const e = element(g.id);
      if (!g.bouge || !e || g.dJours === 0) {
        if (cible) choisir(g.id, cible);
      } else enregistrer(g.id, decaler(e, g.dJours));
      return;
    }
    const [a, b] = g.col0 <= g.col1 ? [g.col0, g.col1] : [g.col1, g.col0];
    setBrouillon({ date: js[a]!, dateFin: js[b]!, debut: 9 * 60, fin: 10 * 60, journee: true });
    const r = bandeRef.current!.getBoundingClientRect();
    const w = r.width / n;
    setAncre(ancrer(new DOMRect(r.left + a * w, r.top, (b - a + 1) * w, r.height)));
  }

  // ---- Lectures déposées ----
  const lectureDe = (e: React.DragEvent): Lecture | null => {
    try {
      return JSON.parse(e.dataTransfer.getData(TYPE_LECTURE)) as Lecture;
    } catch {
      return null;
    }
  };
  const accepte = (e: React.DragEvent) => e.dataTransfer.types.includes(TYPE_LECTURE);

  const fait = (b: Barre) => b.avancement >= 100;
  const style = (b: Barre): CSSProperties => ({ ["--couleur" as string]: couleur(b) });
  const nbJours = js.length;
  const colAujourdhui = js.indexOf(aujourdhui);
  const minuteMaintenant = maintenant.getHours() * 60 + maintenant.getMinutes();

  const barreChoisie = choisi ? barres.find((b) => b.id === choisi) : undefined;

  return (
    <div className="sem" ref={racine} style={{ ["--n" as string]: nbJours }}>
      <div className="sem-haut">
        <div className="sem-entete">
          <div />
          {js.map((d) => {
            const l = libelleJour(d);
            return (
              <div key={d} className={`sem-jour${d === aujourdhui ? " sem-auj" : ""}${d < aujourdhui ? " sem-passe" : ""}`}>
                <span>{l.court}</span>
                <strong>{l.numero}</strong>
              </div>
            );
          })}
        </div>
        <div className="sem-bande-rangee">
          <div className="sem-bande-libelle discret petit">journée</div>
          <div
            className="sem-bande"
            ref={bandeRef}
            style={{ gridTemplateRows: `repeat(${lignes}, ${H_LIGNE_BANDE}px)` }}
            onPointerDown={saisirBande}
            onPointerMove={bougerBande}
            onPointerUp={lacherBande}
            onDragOver={(e) => accepte(e) && e.preventDefault()}
            onDrop={(e) => {
              const l = lectureDe(e);
              if (!l) return;
              e.preventDefault();
              const r = bandeRef.current!.getBoundingClientRect();
              nouvelleLecture(l, js[Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)))]!, null);
            }}
          >
            {places.map((p) => {
              const g = glisse?.mode === "bande" && glisse.id === p.barre.id ? glisse : null;
              const d = g ? g.dJours : 0;
              return (
                <div
                  key={p.barre.id}
                  data-ev={p.barre.id}
                  className={`sem-ev-bande${p.barre.fin ? "" : " sem-jalon"}${p.barre.source ? " sem-externe" : ""}${fait(p.barre) ? " sem-fait" : ""}${choisi === p.barre.id ? " sem-choisi" : ""}${p.coupeAvant ? " coupe-avant" : ""}${p.coupeApres ? " coupe-apres" : ""}`}
                  style={{ ...style(p.barre), gridColumn: `${Math.max(1, p.de + 1 + d)} / ${Math.min(n + 1, p.a + 2 + d)}`, gridRow: p.ligne + 1 }}
                  title={`${p.barre.titre}\n${horaire(p.barre)}${p.barre.detail ? `\n${p.barre.detail}` : ""}`}
                >
                  {p.barre.fin ? null : "◆ "}
                  {p.barre.titre}
                </div>
              );
            })}
            {glisse?.mode === "bande" && !glisse.id ? (
              <div className="sem-ev-bande sem-fantome" style={{ gridColumn: `${Math.min(glisse.col0, glisse.col1) + 1} / ${Math.max(glisse.col0, glisse.col1) + 2}`, gridRow: 1 }}>
                (sans titre)
              </div>
            ) : null}
            {brouillon?.journee ? (
              <div className="sem-ev-bande sem-fantome" style={{ gridColumn: `${js.indexOf(brouillon.date) + 1} / ${js.indexOf(brouillon.dateFin) + 2}`, gridRow: 1 }}>
                (sans titre)
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sem-corps" ref={corps} style={{ height: hauteur }}>
        <div className="sem-grille" style={{ height: 24 * 60 * PX_MIN }}>
          <div className="sem-heures">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} style={{ top: (i + 1) * 60 * PX_MIN }}>
                {String(i + 1).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          <div
            className="sem-colonnes"
            ref={colonnes}
            onPointerDown={saisir}
            onPointerMove={bouger}
            onPointerUp={lacher}
            onDragOver={(e) => {
              if (!accepte(e)) return;
              e.preventDefault();
              const r = rectCols();
              setSurvol({ date: js[colonneDe(e.clientX, r)]!, debut: Math.floor(minuteDe(e.clientY, r) / PAS_MINUTES) * PAS_MINUTES, duree: 60 });
            }}
            onDragLeave={() => setSurvol(null)}
            onDrop={(e) => {
              const l = lectureDe(e);
              setSurvol(null);
              if (!l) return;
              e.preventDefault();
              const r = rectCols();
              nouvelleLecture(l, js[colonneDe(e.clientX, r)]!, Math.floor(minuteDe(e.clientY, r) / PAS_MINUTES) * PAS_MINUTES);
            }}
          >
            {js.map((d, i) => (
              <div key={d} className={`sem-col${d === aujourdhui ? " sem-col-auj" : ""}`}>
                {disposer(barres, d).map((p) => {
                  const b = p.barre;
                  const g = glisse && (glisse.mode === "deplacer" || glisse.mode === "etirer") && glisse.id === b.id && glisse.bouge ? glisse : null;
                  const debut = p.debut + (g?.mode === "deplacer" ? g.dMin : 0);
                  const fin = Math.max(debut + PAS_MINUTES, p.fin + (g ? g.dMin : 0));
                  const dj = g?.mode === "deplacer" ? Math.max(-i, Math.min(n - 1 - i, g.dJours)) : 0;
                  const court = fin - debut < 45;
                  return (
                    <div
                      key={b.id}
                      data-ev={b.id}
                      className={`sem-ev${b.source ? " sem-externe" : ""}${fait(b) ? " sem-fait" : ""}${choisi === b.id ? " sem-choisi" : ""}${g ? " sem-glisse" : ""}${court ? " sem-court" : ""}${b.lien ? " sem-lecture" : ""}`}
                      style={{
                        ...style(b),
                        top: debut * PX_MIN,
                        height: Math.max(14, (fin - debut) * PX_MIN - 2),
                        // Comme un agenda : chaque colonne d'un chevauchement déborde sur la suivante, la dernière par-dessus.
                        left: `calc(${(100 * p.colonne) / p.colonnes}% + 1px)`,
                        width: `calc(${p.colonne === p.colonnes - 1 ? 100 / p.colonnes : Math.min(100 - (100 * p.colonne) / p.colonnes, 170 / p.colonnes)}% - 3px)`,
                        zIndex: g ? 10 : 1 + p.colonne,
                        transform: dj && g ? `translateX(${dj * g.colW}px)` : undefined,
                      }}
                      title={`${b.titre}\n${heure(debut)} – ${heure(fin)}`}
                    >
                      <strong style={{ WebkitLineClamp: court ? 1 : Math.max(1, Math.floor(((fin - debut) * PX_MIN - 16) / 15)) }}>{b.titre}</strong>
                      <span>
                        {heure(debut)} – {heure(fin)}
                      </span>
                      {element(b.id) ? <i data-poignee className="sem-poignee" /> : null}
                    </div>
                  );
                })}
                {glisse?.mode === "creer" && glisse.date === d ? (
                  <div className="sem-ev sem-fantome" style={{ top: Math.min(glisse.m0, glisse.m1) * PX_MIN, height: Math.max(PAS_MINUTES, Math.abs(glisse.m1 - glisse.m0)) * PX_MIN }}>
                    <span>
                      {heure(Math.min(glisse.m0, glisse.m1))} – {heure(Math.max(glisse.m0, glisse.m1) || Math.min(glisse.m0, glisse.m1) + 60)}
                    </span>
                  </div>
                ) : null}
                {brouillon && !brouillon.journee && brouillon.date === d ? (
                  <div className="sem-ev sem-fantome" style={{ top: brouillon.debut * PX_MIN, height: (brouillon.fin - brouillon.debut) * PX_MIN }}>
                    <strong>(sans titre)</strong>
                    <span>
                      {heure(brouillon.debut)} – {heure(brouillon.fin)}
                    </span>
                  </div>
                ) : null}
                {survol && survol.date === d ? (
                  <div className="sem-ev sem-fantome" style={{ top: survol.debut * PX_MIN, height: survol.duree * PX_MIN }}>
                    <span>Lecture à {heure(survol.debut)}</span>
                  </div>
                ) : null}
                {i === colAujourdhui ? <div className="sem-maintenant" style={{ top: minuteMaintenant * PX_MIN }} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {brouillon && ancre ? (
        <Bulle ancre={ancre} racine={racine}>
          <CreationRapide
            key={`${brouillon.date}${brouillon.debut}${brouillon.journee}`}
            brouillon={brouillon}
            categories={categories}
            fermer={fermer}
            plus={(e) => {
              fermer();
              editer(null, e);
            }}
            creer={(e) => {
              fermer();
              void creer(e);
            }}
          />
        </Bulle>
      ) : null}
      {barreChoisie && ancre ? (
        <Bulle ancre={ancre} racine={racine}>
          <Detail
            b={barreChoisie}
            couleur={couleur(barreChoisie)}
            categorie={categories.find((c) => c.id === barreChoisie.categorie)?.nom ?? ""}
            e={element(barreChoisie.id)}
            fermer={fermer}
            editer={(e) => {
              fermer();
              editer(barreChoisie.id, e);
            }}
            supprimer={() => {
              fermer();
              supprimer(barreChoisie.id);
            }}
            enregistrer={(e) => enregistrer(barreChoisie.id, e)}
            ouvrirFiche={ouvrirFiche}
            marquerLu={marquerLu ? (refId) => marquerLu(barreChoisie.id, refId) : undefined}
            allerA={allerA}
          />
        </Bulle>
      ) : null}
    </div>
  );
}

/** Bulle posée à côté de son ancre, à droite s'il y a la place, sinon à gauche. */
function Bulle({ ancre, racine, children }: { ancre: Ancre; racine: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  const moi = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const W = racine.current?.clientWidth ?? 1000;
    const H = racine.current?.clientHeight ?? 600;
    const h = moi.current?.offsetHeight ?? 240;
    const left = ancre.droite + 10 + L_BULLE < W ? ancre.droite + 10 : Math.max(8, ancre.gauche - L_BULLE - 10);
    setPos({ left, top: Math.max(8, Math.min(H - h - 8, ancre.haut)) });
  }, [ancre, racine]);
  return (
    <div ref={moi} className="sem-bulle carte" style={{ width: L_BULLE, left: pos?.left ?? -9999, top: pos?.top ?? 0 }} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

function CreationRapide({
  brouillon,
  categories,
  fermer,
  plus,
  creer,
}: {
  brouillon: Brouillon;
  categories: Categorie[];
  fermer(): void;
  plus(e: Element): void;
  creer(e: Element): void;
}) {
  const [titre, setTitre] = useState("");
  const [categorie, setCategorie] = useState(() => {
    try {
      return localStorage.getItem("planning.derniere-categorie") ?? "";
    } catch {
      return "";
    }
  });
  const [journee, setJournee] = useState(brouillon.journee);
  const [hd, setHd] = useState(heure(brouillon.debut));
  const [hf, setHf] = useState(heure(brouillon.fin));
  const element = (): Element => {
    const base = elementVide(brouillon.date, { titre: titre.trim(), categorie, fin: brouillon.dateFin });
    return journee || brouillon.dateFin !== brouillon.date || hf <= hd ? base : { ...base, heureDebut: hd, heureFin: hf };
  };
  const valider = () => {
    if (!titre.trim()) return;
    try {
      localStorage.setItem("planning.derniere-categorie", categorie);
    } catch {
      /* préférence de confort seulement */
    }
    creer(element());
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        valider();
      }}
    >
      <div className="rangee sem-bulle-haut">
        <button type="button" className="sem-fermer" onClick={fermer} aria-label="Fermer">
          ×
        </button>
      </div>
      <input className="sem-titre" autoFocus placeholder="Ajouter un titre" value={titre} onChange={(e) => setTitre(e.target.value)} />
      <div className="sem-quand">
        <span>{brouillon.dateFin !== brouillon.date ? `${dateLongue(brouillon.date)} → ${dateLongue(brouillon.dateFin)}` : dateLongue(brouillon.date)}</span>
        {!journee && brouillon.dateFin === brouillon.date ? (
          <>
            <input type="time" className="champ" step={900} value={hd} onChange={(e) => e.target.value && setHd(e.target.value)} aria-label="Début" />
            <span>–</span>
            <input type="time" className="champ" step={900} value={hf} onChange={(e) => e.target.value && setHf(e.target.value)} aria-label="Fin" />
          </>
        ) : null}
      </div>
      {brouillon.dateFin === brouillon.date ? (
        <label className="petit">
          <input type="checkbox" checked={journee} onChange={(e) => setJournee(e.target.checked)} /> Toute la journée
        </label>
      ) : null}
      <div className="sem-cats">
        {categories.map((c) => (
          <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} className={`sem-cat${categorie === c.id ? " actif" : ""}`} style={{ ["--couleur" as string]: c.couleur }} onClick={() => setCategorie(categorie === c.id ? "" : c.id)} title={c.nom}>
            <i />
            {c.nom}
          </button>
        ))}
      </div>
      <div className="rangee sem-bulle-actions">
        <button type="button" className="lien" onClick={() => plus(element())}>
          Plus d'options
        </button>
        <button type="submit" className="principal a-droite" disabled={!titre.trim()}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function Detail({
  b,
  couleur,
  categorie,
  e,
  fermer,
  editer,
  supprimer,
  enregistrer,
  ouvrirFiche,
  marquerLu,
  allerA,
}: {
  b: Barre;
  couleur: string;
  categorie: string;
  e: Element | undefined;
  fermer(): void;
  editer(e: Element): void;
  supprimer(): void;
  enregistrer(e: Element): void;
  ouvrirFiche?(refId: string): void;
  marquerLu?(refId: string): void;
  allerA(source: string): void;
}) {
  const ref = b.lien?.module === "bibliotheque" ? b.lien.id : null;
  return (
    <div>
      <div className="rangee sem-bulle-haut">
        {e ? (
          <>
            <button type="button" className="sem-icone" onClick={() => editer(e)} title="Modifier">
              ✎
            </button>
            <button type="button" className="sem-icone" onClick={supprimer} title="Supprimer (rangé dans planning/.supprimes)">
              🗑
            </button>
          </>
        ) : null}
        <button type="button" className="sem-fermer" onClick={fermer} aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="sem-detail-titre">
        <i style={{ background: couleur }} />
        <div>
          <h3 className={b.avancement >= 100 ? "barre" : undefined}>{b.titre}</h3>
          <p className="discret">{horaire(b)}</p>
        </div>
      </div>
      {categorie ? <p className="petit">{categorie}</p> : null}
      {b.detail ? <p className="petit discret">{b.detail}</p> : null}
      {e?.notes ? <p className="petit sem-notes">{e.notes}</p> : null}
      {e && e.avancement > 0 && e.avancement < 100 ? <p className="petit discret">Avancement : {e.avancement} %</p> : null}
      <div className="rangee sem-bulle-actions">
        {ref && ouvrirFiche ? (
          <button type="button" onClick={() => ouvrirFiche(ref)}>
            Ouvrir la fiche
          </button>
        ) : null}
        {ref && marquerLu && b.avancement < 100 ? (
          <button type="button" className="principal" onClick={() => marquerLu(ref)} title="La référence passe à « Lu » dans la Bibliothèque">
            Marquer comme lu
          </button>
        ) : null}
        {e && !ref ? (
          <button type="button" onClick={() => enregistrer({ ...e, avancement: e.avancement >= 100 ? 0 : 100 })}>
            {e.avancement >= 100 ? "Pas encore fait" : "✓ Fait"}
          </button>
        ) : null}
        {b.source ? (
          <button type="button" onClick={() => allerA(b.source!)}>
            Modifier à la source ({b.source === "campagnes" ? "Campagnes" : "Bibliothèque"})
          </button>
        ) : null}
      </div>
    </div>
  );
}
