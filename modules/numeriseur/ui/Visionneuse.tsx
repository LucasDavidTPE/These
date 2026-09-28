/**
 * L'image et ce qu'on y place : zoom (molette), déplacement (glisser le fond, ou clic droit),
 * loupe pour placer les points au pixel près, points déplaçables à la souris, Suppr pour
 * effacer le point choisi. Les tracés (axes, séries, légende, coupes, maillage) sont dessinés
 * par-dessus, en épaisseur constante à l'écran.
 */
import { useEffect, useRef, useState } from "react";
import { valeurAuPixel } from "../core/carte";
import { versDonnees, versPixel, type Etalonnage } from "../core/etalonnage";
import { hex, pixel, type Pt } from "../core/image";
import { etalonnageDe, type Projet } from "../core/projet";
import { CONSIGNE, useNumeriseur, type Outil } from "./etat";
import { fmt, fmtAxe } from "./format";

interface Vue {
  k: number;
  ox: number;
  oy: number;
}

type Prise =
  | { type: "fond"; depart: Pt; vue: Vue }
  | { type: "axe"; cle: "x1" | "x2" | "y1" | "y2" }
  | { type: "legende"; cle: "p1" | "p2" }
  | { type: "coupe"; i: number; bout: "a" | "b" }
  | { type: "point"; serie: number; i: number }
  | { type: "zone"; depart: Pt };

const COULEUR_X = "#d62728",
  COULEUR_Y = "#2ca02c",
  COULEUR_OUTIL = "#ff7f0e";

export function Visionneuse() {
  const s = useNumeriseur();
  const cadre = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [taille, setTaille] = useState<[number, number]>([800, 600]);
  const [vue, setVue] = useState<Vue>({ k: 1, ox: 0, oy: 0 });
  const [curseur, setCurseur] = useState<Pt | null>(null);
  const [zoneEnCours, setZoneEnCours] = useState<[Pt, Pt] | null>(null);
  const prise = useRef<Prise | null>(null);
  const e = etalonnageDe(s.projet);

  // taille du cadre
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTaille([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // nouvelle image : ajustée au cadre
  const img = s.image;
  useEffect(() => {
    if (!img) return;
    const [W, H] = [cadre.current?.clientWidth ?? 800, cadre.current?.clientHeight ?? 600];
    const k = Math.min(W / img.rgba.width, H / img.rgba.height) * 0.95;
    setVue({ k, ox: (W - img.rgba.width * k) / 2, oy: (H - img.rgba.height * k) / 2 });
  }, [img]);

  const ecran = (p: Pt): Pt => [p[0] * vue.k + vue.ox, p[1] * vue.k + vue.oy];
  const versImage = (x: number, y: number): Pt => [(x - vue.ox) / vue.k, (y - vue.oy) / vue.k];

  // dessin
  useEffect(() => {
    const c = toile.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = taille[0] * dpr;
    c.height = taille[1] * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, taille[0], taille[1]);
    if (!img) return;
    g.save();
    g.translate(vue.ox, vue.oy);
    g.scale(vue.k, vue.k);
    g.imageSmoothingEnabled = vue.k < 2;
    g.drawImage(img.source, 0, 0);
    g.restore();
    dessinerSurcouches(g, s.projet, e, ecran, s.serie, s.selection, zoneEnCours, s.coupeA, curseur, s.outil);
  });

  // loupe
  useEffect(() => {
    const c = loupe.current;
    if (!c || !img || !curseur) return;
    const g = c.getContext("2d")!;
    const n = 25,
      k = c.width / n;
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img.source, curseur[0] - n / 2, curseur[1] - n / 2, n, n, 0, 0, c.width, c.height);
    g.strokeStyle = COULEUR_OUTIL;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(c.width / 2, 0);
    g.lineTo(c.width / 2, c.height);
    g.moveTo(0, c.height / 2);
    g.lineTo(c.width, c.height / 2);
    g.stroke();
    g.strokeRect(c.width / 2 - k / 2, c.height / 2 - k / 2, k, k);
  });

  // clavier : Échap, Suppr
  useEffect(() => {
    const touche = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).closest("input, textarea, select")) return;
      const st = useNumeriseur.getState();
      if (ev.key === "Escape") st.choisirOutil(null);
      if ((ev.key === "Delete" || ev.key === "Backspace") && st.selection) {
        const { serie, point } = st.selection;
        st.maj((p) => p.series[serie]!.points.splice(point, 1));
        useNumeriseur.setState({ selection: null });
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);

  /** Élément déplaçable sous le pointeur (écran), à 7 pixels près. */
  function saisir(sx: number, sy: number): Prise | null {
    const pres = (p: Pt | null) => p && Math.hypot(ecran(p)[0] - sx, ecran(p)[1] - sy) < 7;
    const p = s.projet;
    for (const cle of ["x1", "x2", "y1", "y2"] as const) if (pres(p.axes[cle[0] as "x" | "y"][cle[1] === "1" ? "p1" : "p2"])) return { type: "axe", cle };
    if (p.mode === "carte") {
      for (const cle of ["p1", "p2"] as const) if (pres(p.legende[cle])) return { type: "legende", cle };
      if (e)
        for (const [i, c] of p.coupes.entries()) {
          if (pres(versPixel(e, c.a))) return { type: "coupe", i, bout: "a" };
          if (pres(versPixel(e, c.b))) return { type: "coupe", i, bout: "b" };
        }
    }
    if (e && p.mode === "courbe")
      for (const [k, serie] of p.series.entries()) {
        const i = serie.points.findIndex((q) => pres(versPixel(e, q)));
        if (i >= 0) return { type: "point", serie: k, i };
      }
    return null;
  }

  function cliquer(outil: Outil, q: Pt) {
    const st = useNumeriseur.getState();
    const suite: Partial<Record<Outil, Outil | null>> = { x1: "x2", x2: "y1", y1: "y2", y2: null, leg1: "leg2", leg2: null, centre: null, pipette: null };
    if (outil === "x1" || outil === "x2" || outil === "y1" || outil === "y2") {
      st.maj((p) => (p.axes[outil[0] as "x" | "y"][outil[1] === "1" ? "p1" : "p2"] = q));
    } else if (outil === "leg1" || outil === "leg2") {
      st.maj((p) => (p.legende[outil === "leg1" ? "p1" : "p2"] = q));
    } else if (outil === "pipette") {
      const [x, y] = [Math.floor(q[0]), Math.floor(q[1])];
      if (!img || x < 0 || y < 0 || x >= img.rgba.width || y >= img.rgba.height) return;
      st.maj((p) => (p.series[st.serie]!.couleur = hex(pixel(img.rgba, x, y))));
    } else if (outil === "ajouter" && e) {
      const d = versDonnees(e, q);
      st.maj((p) => {
        const pts = p.series[st.serie]!.points;
        const i = pts.findIndex((r) => r[0] > d[0]);
        pts.splice(i < 0 ? pts.length : i, 0, d);
      });
    } else if (outil === "coupe" && e) {
      const d = versDonnees(e, q);
      if (!st.coupeA) return useNumeriseur.setState({ coupeA: d });
      st.maj((p) => p.coupes.push({ a: st.coupeA!, b: d }));
      useNumeriseur.setState({ coupeA: null });
      return;
    } else if (outil === "centre" && e) {
      const d = versDonnees(e, q);
      st.maj((p) => {
        if (p.maillage.type === "polaire") {
          p.maillage.xc = d[0];
          p.maillage.yc = d[1];
        }
      });
    }
    if (outil in suite) st.choisirOutil(suite[outil] ?? null);
  }

  function appui(ev: React.PointerEvent) {
    const r = toile.current!.getBoundingClientRect();
    const [sx, sy] = [ev.clientX - r.left, ev.clientY - r.top];
    const q = versImage(sx, sy);
    (ev.target as Element).setPointerCapture(ev.pointerId);
    if (ev.button === 2 || ev.button === 1) {
      prise.current = { type: "fond", depart: [ev.clientX, ev.clientY], vue };
      return;
    }
    const outil = s.outil;
    if (outil === "zone") {
      prise.current = { type: "zone", depart: q };
      setZoneEnCours([q, q]);
      return;
    }
    const p = outil ? null : saisir(sx, sy);
    if (p) {
      prise.current = p;
      if (p.type === "point") useNumeriseur.setState({ selection: { serie: p.serie, point: p.i }, serie: p.serie });
      return;
    }
    if (outil) return cliquer(outil, q);
    useNumeriseur.setState({ selection: null });
    prise.current = { type: "fond", depart: [ev.clientX, ev.clientY], vue };
  }

  function mouvement(ev: React.PointerEvent) {
    const r = toile.current!.getBoundingClientRect();
    const q = versImage(ev.clientX - r.left, ev.clientY - r.top);
    setCurseur(q);
    const p = prise.current;
    if (!p) return;
    const st = useNumeriseur.getState();
    if (p.type === "fond") setVue({ ...p.vue, ox: p.vue.ox + ev.clientX - p.depart[0], oy: p.vue.oy + ev.clientY - p.depart[1] });
    else if (p.type === "zone") setZoneEnCours([p.depart, q]);
    else if (p.type === "axe") st.maj((pr) => (pr.axes[p.cle[0] as "x" | "y"][p.cle[1] === "1" ? "p1" : "p2"] = q));
    else if (p.type === "legende") st.maj((pr) => (pr.legende[p.cle] = q));
    else if (e && p.type === "coupe") st.maj((pr) => (pr.coupes[p.i]![p.bout] = versDonnees(e, q)));
    else if (e && p.type === "point") st.maj((pr) => (pr.series[p.serie]!.points[p.i] = versDonnees(e, q)));
  }

  function relache() {
    const p = prise.current;
    prise.current = null;
    if (p?.type === "zone" && zoneEnCours) {
      const [[a, b], [c, d]] = zoneEnCours;
      if (Math.abs(c - a) > 3 && Math.abs(d - b) > 3) {
        useNumeriseur.getState().maj((pr) => (pr.zone = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]));
        useNumeriseur.getState().choisirOutil(null);
      }
      setZoneEnCours(null);
    }
  }

  function molette(ev: React.WheelEvent) {
    const r = toile.current!.getBoundingClientRect();
    const [sx, sy] = [ev.clientX - r.left, ev.clientY - r.top];
    const f = Math.exp(-ev.deltaY * 0.0015);
    const k = Math.min(40, Math.max(0.05, vue.k * f));
    setVue({ k, ox: sx - ((sx - vue.ox) * k) / vue.k, oy: sy - ((sy - vue.oy) * k) / vue.k });
  }

  function ajuster() {
    if (!img) return;
    const k = Math.min(taille[0] / img.rgba.width, taille[1] / img.rgba.height) * 0.95;
    setVue({ k, ox: (taille[0] - img.rgba.width * k) / 2, oy: (taille[1] - img.rgba.height * k) / 2 });
  }

  // lecture sous le curseur
  const echelleX = e ? Math.max(Math.abs(e.x.v1), Math.abs(e.x.v2)) : 1;
  const echelleY = e ? Math.max(Math.abs(e.y.v1), Math.abs(e.y.v2)) : 1;
  let lecture = "";
  if (curseur && img) {
    lecture = `pixel (${Math.floor(curseur[0])} ; ${Math.floor(curseur[1])})`;
    if (e) {
      const d = versDonnees(e, curseur);
      lecture += ` · x = ${fmtAxe(d[0], echelleX)}, y = ${fmtAxe(d[1], echelleY)}`;
    }
    if (s.champ) {
      const v = valeurAuPixel(s.champ, curseur);
      lecture += ` · valeur ${Number.isNaN(v) ? "—" : `${fmt(v)} ${s.projet.legende.unite}`}`;
    }
  }

  return (
    <div className="nm-visionneuse">
      <div
        ref={cadre}
        className={`nm-cadre${s.outil ? " nm-viser" : ""}`}
        onContextMenu={(ev) => ev.preventDefault()}
        onDragOver={(ev) => ev.preventDefault()}
      >
        <canvas ref={toile} style={{ width: taille[0], height: taille[1] }} onPointerDown={appui} onPointerMove={mouvement} onPointerUp={relache} onPointerLeave={() => setCurseur(null)} onWheel={molette} />
        {!img ? <div className="nm-vide">Ouvrir une image, la coller (Ctrl+V) ou la déposer ici, ou partir d'un exemple.</div> : null}
        {img && curseur && s.outil ? <canvas ref={loupe} className="nm-loupe" width={150} height={150} /> : null}
      </div>
      <div className="nm-barre-etat">
        <span className={s.outil ? "nm-consigne" : "discret"}>{s.outil ? `${CONSIGNE[s.outil]}${s.outil === "coupe" && s.coupeA ? " (début placé)" : ""}` : "Molette : zoom · glisser : déplacer · points déplaçables · Suppr : effacer le point choisi"}</span>
        <span className="grow" />
        <span className="discret nm-lecture">{lecture}</span>
        <button type="button" className="petit" onClick={ajuster} disabled={!img}>
          Ajuster
        </button>
      </div>
    </div>
  );
}

function dessinerSurcouches(
  g: CanvasRenderingContext2D,
  p: Projet,
  e: Etalonnage | null,
  ecran: (p: Pt) => Pt,
  serieActive: number,
  selection: { serie: number; point: number } | null,
  zoneEnCours: [Pt, Pt] | null,
  coupeA: Pt | null,
  curseur: Pt | null,
  outil: Outil | null,
) {
  const ligne = (pts: Pt[], couleur: string, largeur = 1.5, tirets: number[] = []) => {
    if (pts.length < 2) return;
    g.strokeStyle = couleur;
    g.lineWidth = largeur;
    g.setLineDash(tirets);
    g.beginPath();
    pts.forEach((q, i) => {
      const [x, y] = ecran(q);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    g.setLineDash([]);
  };
  const repere = (q: Pt, couleur: string, texte: string) => {
    const [x, y] = ecran(q);
    g.strokeStyle = couleur;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, 6, 0, 2 * Math.PI);
    g.moveTo(x - 10, y);
    g.lineTo(x + 10, y);
    g.moveTo(x, y - 10);
    g.lineTo(x, y + 10);
    g.stroke();
    g.font = "bold 12px system-ui, sans-serif";
    g.lineWidth = 3;
    g.strokeStyle = "#fff";
    g.strokeText(texte, x + 8, y - 8);
    g.fillStyle = couleur;
    g.fillText(texte, x + 8, y - 8);
  };
  // zone
  const z = zoneEnCours ? ([...zoneEnCours[0], ...zoneEnCours[1]] as [number, number, number, number]) : p.zone;
  if (z) ligne([[z[0], z[1]], [z[2], z[1]], [z[2], z[3]], [z[0], z[3]], [z[0], z[1]]], COULEUR_OUTIL, 1.5, [6, 4]);
  // axes
  for (const [a, couleur, nom] of [
    [p.axes.x, COULEUR_X, "X"],
    [p.axes.y, COULEUR_Y, "Y"],
  ] as const) {
    if (a.p1 && a.p2) ligne([a.p1, a.p2], couleur, 1, [4, 4]);
    if (a.p1) repere(a.p1, couleur, `${nom}1${a.v1 !== null ? ` = ${fmt(a.v1)}` : ""}`);
    if (a.p2) repere(a.p2, couleur, `${nom}2${a.v2 !== null ? ` = ${fmt(a.v2)}` : ""}`);
  }
  if (p.mode === "courbe" && e) {
    p.series.forEach((sr, k) => {
      const pts = sr.points.map((d) => versPixel(e, d));
      if (sr.mode === "ligne") ligne(pts, sr.couleur, k === serieActive ? 1.5 : 1);
      pts.forEach((q, i) => {
        const [x, y] = ecran(q);
        const choisi = selection?.serie === k && selection.point === i;
        g.fillStyle = choisi ? "#000" : "#fff";
        g.strokeStyle = sr.couleur;
        g.lineWidth = k === serieActive ? 2 : 1.2;
        g.beginPath();
        g.arc(x, y, choisi ? 5 : 3.5, 0, 2 * Math.PI);
        g.fill();
        g.stroke();
      });
    });
  }
  if (p.mode === "carte") {
    const l = p.legende;
    if (l.p1 && l.p2) ligne([l.p1, l.p2], COULEUR_OUTIL, 2);
    if (l.p1) repere(l.p1, COULEUR_OUTIL, `début${l.v1 !== null ? ` = ${fmt(l.v1)}` : ""}`);
    if (l.p2) repere(l.p2, COULEUR_OUTIL, `fin${l.v2 !== null ? ` = ${fmt(l.v2)}` : ""}`);
    if (e) {
      dessinerMaillage(p, e, ligne);
      p.coupes.forEach((c, i) => {
        ligne([versPixel(e, c.a), versPixel(e, c.b)], "#111", 2.5);
        ligne([versPixel(e, c.a), versPixel(e, c.b)], "#fff", 1);
        repere(versPixel(e, c.a), "#111", `C${i + 1}`);
      });
      if (coupeA) {
        repere(versPixel(e, coupeA), "#111", "début");
        if (curseur && outil === "coupe") ligne([versPixel(e, coupeA), curseur], "#111", 1.5, [5, 3]);
      }
    }
  }
}

function dessinerMaillage(p: Projet, e: Etalonnage, ligne: (pts: Pt[], couleur: string, largeur?: number, tirets?: number[]) => void) {
  const m = p.maillage;
  const couleur = "rgba(20, 20, 20, 0.75)";
  const P = (x: number, y: number) => versPixel(e, [x, y]);
  if (m.type === "rectangle") {
    for (let i = 0; i <= m.nx; i++) {
      const x = m.x0 + ((m.x1 - m.x0) * i) / m.nx;
      ligne([P(x, m.y0), P(x, m.y1)], couleur, 1);
    }
    for (let j = 0; j <= m.ny; j++) {
      const y = m.y0 + ((m.y1 - m.y0) * j) / m.ny;
      ligne([P(m.x0, y), P(m.x1, y)], couleur, 1);
    }
  } else if (m.type === "disques") {
    const dy = m.trame === "hexagonale" ? (m.pas * Math.sqrt(3)) / 2 : m.pas;
    if (!(m.pas > 0) || !(m.R > 0)) return;
    const [xa, xb, ya, yb] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1), Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
    let n = 0;
    for (let j = 0, y = ya; y <= yb + 1e-9 * (yb - ya + 1) && n < 5000; j++, y = ya + j * dy) {
      const dec = m.trame === "hexagonale" && j % 2 === 1 ? m.pas / 2 : 0;
      for (let x = xa + dec; x <= xb + 1e-9 * (xb - xa + 1) && n < 5000; x += m.pas, n++) {
        ligne(
          Array.from({ length: 33 }, (_, k) => P(x + m.R * Math.cos((k * Math.PI) / 16), y + m.R * Math.sin((k * Math.PI) / 16))),
          couleur,
          1,
        );
      }
    }
  } else {
    for (const r of m.rayons) if (r > 0) ligne(Array.from({ length: 65 }, (_, k) => P(m.xc + r * Math.cos((k * Math.PI) / 32), m.yc + r * Math.sin((k * Math.PI) / 32))), couleur, 1);
    const rmax = Math.max(...m.rayons);
    if (m.secteurs > 1) for (let s = 0; s < m.secteurs; s++) ligne([P(m.xc, m.yc), P(m.xc + rmax * Math.cos((2 * Math.PI * s) / m.secteurs), m.yc + rmax * Math.sin((2 * Math.PI * s) / m.secteurs))], couleur, 1);
    ligne([P(m.xc - rmax * 0.05, m.yc), P(m.xc + rmax * 0.05, m.yc)], COULEUR_OUTIL, 2);
    ligne([P(m.xc, m.yc - rmax * 0.05), P(m.xc, m.yc + rmax * 0.05)], COULEUR_OUTIL, 2);
  }
}
