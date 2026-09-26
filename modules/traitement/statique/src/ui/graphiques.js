/**
 * Tracés sur canvas.
 *
 * Écrits à la main plutôt que confiés à une bibliothèque : les échelles
 * logarithmiques sur dix décades, les isothermes colorées par température et
 * la superposition d'une courbe modèle continue à des points de mesure sont
 * exactement ce que les bibliothèques généralistes font mal, et cela évite
 * une dépendance de plusieurs centaines de kilo-octets sur une page qui doit
 * rester ouvrable hors ligne.
 *
 * Chaque graphique lit ses couleurs dans les variables CSS, donc suit le
 * thème clair ou sombre sans code supplémentaire, et publie la valeur du
 * point survolé — à la souris comme au clavier.
 */
import { nb, puissance } from './format.js';

/** Rampe froide → chaude : elle porte la température, pas la décoration. */
const RAMPE = ['#27408f', '#2f7fb5', '#3f9e8e', '#79a53f', '#c09a1f', '#c96a25', '#b03a2b'];

function versRVB(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function melange(a, b, t) {
  const A = versRVB(a), B = versRVB(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
export function couleurTemperature(i, n) {
  if (n < 2) return RAMPE[3];
  const t = i / (n - 1) * (RAMPE.length - 1);
  const a = Math.min(RAMPE.length - 2, Math.floor(t));
  return melange(RAMPE[a], RAMPE[a + 1], t - a);
}

const jeton = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function graduationsLineaires(lo, hi, n) {
  if (!(hi > lo)) return [lo];
  const brut = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(brut));
  const norm = brut / mag;
  const pas = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / pas) * pas; v <= hi + pas * 1e-9; v += pas) {
    out.push(Math.abs(v) < pas * 1e-9 ? 0 : v);
  }
  return out;
}

function graduationsLog(lo, hi, place) {
  const d0 = Math.ceil(lo - 1e-9), d1 = Math.floor(hi + 1e-9);
  const pas = Math.max(1, Math.ceil((d1 - d0 + 1) / (place || 7)));
  const out = [];
  for (let d = d0; d <= d1; d++) if ((d - d0) % pas === 0) out.push(d);
  return out;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} spec  series[{points,mode,couleur,libelle,taille,epaisseur,tirets}],
 *                       xLog, yLog, xTitre, yTitre, zeroY, format
 */
export function tracer(canvas, spec) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320, h = canvas.clientHeight || 240;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const encre = jeton('--encre-2'), pale = jeton('--encre-3');
  const grille = jeton('--grille'), trait = jeton('--trait-2');
  // La marge de gauche est fixée d'après la largeur réelle des étiquettes :
  // « 5,00·10⁻⁵ » ne tient pas dans la même place que « 40 ».
  const marge = { g: 56, d: 28, h: 12, b: 32 };
  let X0, Y0, L, H;
  const poser = () => {
    X0 = marge.g; Y0 = h - marge.b;
    L = w - marge.g - marge.d; H = h - marge.h - marge.b;
  };
  poser();

  const valide = p => Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    (!spec.xLog || p[0] > 0) && (!spec.yLog || p[1] > 0);
  const tous = [];
  for (const s of spec.series) for (const p of s.points) if (valide(p)) tous.push(p);

  canvas._etat = null;
  if (!tous.length) {
    g.fillStyle = pale;
    g.font = `12px ${jeton('--police-ui')}`;
    g.textAlign = 'center';
    g.fillText('aucune donnée', w / 2, h / 2);
    return;
  }

  const tx = v => spec.xLog ? Math.log10(v) : v;
  const ty = v => spec.yLog ? Math.log10(v) : v;
  let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
  for (const p of tous) {
    const a = tx(p[0]), b = ty(p[1]);
    if (a < x1) x1 = a; if (a > x2) x2 = a;
    if (b < y1) y1 = b; if (b > y2) y2 = b;
  }
  if (spec.zeroY) { y1 = Math.min(y1, 0); y2 = Math.max(y2, 0); }
  const mx = (x2 - x1) * 0.05 || 0.5, my = (y2 - y1) * 0.08 || 0.5;
  x1 -= mx; x2 += mx; y1 -= my; y2 += my;

  const px = v => X0 + (tx(v) - x1) / (x2 - x1) * L;
  const py = v => Y0 - (ty(v) - y1) / (y2 - y1) * H;

  g.font = `10.5px ${jeton('--police-mo')}`;
  const etiquetteY = t => spec.yLog ? puissance(t) : nb(t, Math.abs(t) < 1 && t !== 0 ? 2 : 0);
  const gy = spec.yLog ? graduationsLog(y1, y2, Math.max(3, Math.floor(H / 26)))
    : graduationsLineaires(y1, y2, 5);
  let largeurMax = 0;
  for (const t of gy) largeurMax = Math.max(largeurMax, g.measureText(etiquetteY(t)).width);
  marge.g = Math.min(w * 0.4, Math.max(38, Math.ceil(largeurMax) + 24));
  poser();

  const gx = spec.xLog ? graduationsLog(x1, x2, Math.max(3, Math.floor(L / 46)))
    : graduationsLineaires(x1, x2, 5);
  g.strokeStyle = grille; g.lineWidth = 1;
  for (const t of gx) {
    const X = Math.round(X0 + (t - x1) / (x2 - x1) * L) + 0.5;
    g.beginPath(); g.moveTo(X, marge.h); g.lineTo(X, Y0); g.stroke();
    g.fillStyle = pale; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(spec.xLog ? puissance(t) : nb(t, Math.abs(t) < 1 && t !== 0 ? 2 : 0), X, Y0 + 6);
  }
  for (const t of gy) {
    const Y = Math.round(Y0 - (t - y1) / (y2 - y1) * H) + 0.5;
    g.beginPath(); g.moveTo(X0, Y); g.lineTo(X0 + L, Y); g.stroke();
    g.fillStyle = pale; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(etiquetteY(t), X0 - 6, Y);
  }
  g.strokeStyle = trait;
  g.beginPath(); g.moveTo(X0 + 0.5, marge.h); g.lineTo(X0 + 0.5, Y0 + 0.5);
  g.lineTo(X0 + L, Y0 + 0.5); g.stroke();

  g.fillStyle = encre; g.font = `11px ${jeton('--police-ui')}`;
  if (spec.xTitre) { g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(spec.xTitre, X0 + L, Y0 - 5); }
  if (spec.yTitre) {
    g.save(); g.translate(12, marge.h + 2); g.rotate(-Math.PI / 2);
    g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText(spec.yTitre, 0, 0); g.restore();
  }

  g.save();
  g.beginPath(); g.rect(X0, marge.h - 2, L, H + 4); g.clip();
  for (const s of spec.series) {
    const pts = s.points.filter(valide);
    if (!pts.length) continue;
    if (s.mode === 'ligne') {
      g.strokeStyle = s.couleur; g.lineWidth = s.epaisseur || 1.8;
      g.setLineDash(s.tirets || []);
      g.beginPath();
      pts.forEach((p, i) => i ? g.lineTo(px(p[0]), py(p[1])) : g.moveTo(px(p[0]), py(p[1])));
      g.stroke(); g.setLineDash([]);
    } else {
      g.fillStyle = s.couleur;
      const r = s.taille || 2.6;
      for (const p of pts) { g.beginPath(); g.arc(px(p[0]), py(p[1]), r, 0, 6.284); g.fill(); }
    }
  }
  g.restore();

  // état conservé pour le survol
  canvas._etat = { spec, px, py, X0, Y0, L, H, marge, w, h, valide };
}

/**
 * Rend un graphique interrogeable : survol à la souris, parcours au clavier,
 * et libellé lisible par un lecteur d'écran.
 */
export function rendreInterrogeable(canvas, sortie) {
  if (canvas._interrogeable) return;
  canvas._interrogeable = true;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');

  let index = -1;

  const plusProche = (mx, my) => {
    const e = canvas._etat;
    if (!e) return null;
    let best = null;
    for (const s of e.spec.series) {
      if (s.mode === 'ligne') continue;
      for (const p of s.points) {
        if (!e.valide(p)) continue;
        const d = (e.px(p[0]) - mx) ** 2 + (e.py(p[1]) - my) ** 2;
        if (!best || d < best.d) best = { d, p, s };
      }
    }
    return best && best.d < 40 * 40 ? best : null;
  };

  const afficher = (choix) => {
    const e = canvas._etat;
    if (!e) return;
    tracer(canvas, e.spec);
    if (!choix) { if (sortie) sortie.textContent = ''; return; }
    const g = canvas.getContext('2d');
    const X = e.px(choix.p[0]), Y = e.py(choix.p[1]);
    g.strokeStyle = jeton('--trait-2'); g.lineWidth = 1; g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(e.X0, Y + 0.5); g.lineTo(e.X0 + e.L, Y + 0.5);
    g.moveTo(X + 0.5, e.marge.h); g.lineTo(X + 0.5, e.Y0);
    g.stroke(); g.setLineDash([]);
    g.fillStyle = choix.s.couleur;
    g.beginPath(); g.arc(X, Y, 4.5, 0, 6.284); g.fill();
    g.strokeStyle = jeton('--fond-2'); g.lineWidth = 1.5; g.stroke();
    if (sortie) {
      const f = e.spec.format || ((x, y) => `${nb(x)} · ${nb(y)}`);
      sortie.textContent = (choix.s.libelle ? choix.s.libelle + ' — ' : '') + f(choix.p[0], choix.p[1], choix.p[2]);
    }
  };

  canvas.addEventListener('mousemove', ev => {
    const r = canvas.getBoundingClientRect();
    afficher(plusProche(ev.clientX - r.left, ev.clientY - r.top));
  });
  canvas.addEventListener('mouseleave', () => { index = -1; afficher(null); });

  canvas.addEventListener('keydown', ev => {
    const e = canvas._etat;
    if (!e) return;
    const pts = [];
    for (const s of e.spec.series) {
      if (s.mode === 'ligne') continue;
      for (const p of s.points) if (e.valide(p)) pts.push({ p, s });
    }
    if (!pts.length) return;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { index = (index + 1) % pts.length; }
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { index = (index - 1 + pts.length) % pts.length; }
    else if (ev.key === 'Escape') { index = -1; afficher(null); return; }
    else return;
    ev.preventDefault();
    const c = pts[index];
    afficher({ p: c.p, s: c.s });
  });
  canvas.addEventListener('blur', () => { index = -1; afficher(null); });
}
