/**
 * Images d'exemple, dessinées à la volée : un graphique à deux séries (ligne et symboles) et une
 * carte de pression de pneu avec sa légende. Pour essayer le module sans image sous la main.
 */
import { enPng } from "./image";

function toile(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  return [c, g];
}

/** Axes, graduations et titres d'un cadre [x0, y0, x1, y1] (pixels). */
function axes(g: CanvasRenderingContext2D, [x0, y0, x1, y1]: number[], gx: [number, number, number], gy: [number, number, number], tx: string, ty: string, grille = true) {
  const X = (v: number) => x0! + ((v - gx[0]) / (gx[1] - gx[0])) * (x1! - x0!);
  const Y = (v: number) => y1! - ((v - gy[0]) / (gy[1] - gy[0])) * (y1! - y0!);
  g.font = "15px Arial, sans-serif";
  g.fillStyle = "#222";
  g.strokeStyle = "#222";
  g.lineWidth = 1;
  for (let v = gx[0]; v <= gx[1] + 1e-9; v += gx[2]) {
    if (grille) {
      g.strokeStyle = "#e4e4e4";
      g.beginPath();
      g.moveTo(X(v), y0!);
      g.lineTo(X(v), y1!);
      g.stroke();
      g.strokeStyle = "#222";
    }
    g.beginPath();
    g.moveTo(X(v), y1!);
    g.lineTo(X(v), y1! + 6);
    g.stroke();
    g.textAlign = "center";
    g.fillText(String(Math.round(v * 100) / 100).replace(".", ","), X(v), y1! + 22);
  }
  for (let v = gy[0]; v <= gy[1] + 1e-9; v += gy[2]) {
    if (grille) {
      g.strokeStyle = "#e4e4e4";
      g.beginPath();
      g.moveTo(x0!, Y(v));
      g.lineTo(x1!, Y(v));
      g.stroke();
      g.strokeStyle = "#222";
    }
    g.beginPath();
    g.moveTo(x0! - 6, Y(v));
    g.lineTo(x0!, Y(v));
    g.stroke();
    g.textAlign = "right";
    g.fillText(String(Math.round(v * 100) / 100).replace(".", ","), x0! - 10, Y(v) + 5);
  }
  g.strokeRect(x0!, y0!, x1! - x0!, y1! - y0!);
  g.textAlign = "center";
  g.fillText(tx, (x0! + x1!) / 2, y1! + 48);
  g.save();
  g.translate(x0! - 58, (y0! + y1!) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText(ty, 0, 0);
  g.restore();
  return { X, Y };
}

export async function exempleCourbes(): Promise<Uint8Array> {
  const [c, g] = toile(820, 560);
  const { X, Y } = axes(g, [100, 40, 780, 470], [0, 10, 2], [0, 50, 10], "Temps (s)", "Déformation (µdef)");
  g.strokeStyle = "#d62728";
  g.lineWidth = 2.5;
  g.beginPath();
  for (let i = 0; i <= 200; i++) {
    const x = (10 * i) / 200;
    const y = 45 * (1 - Math.exp(-x / 2.5)) + 2 * Math.sin(2 * x);
    if (i === 0) g.moveTo(X(x), Y(y));
    else g.lineTo(X(x), Y(y));
  }
  g.stroke();
  g.fillStyle = "#1f77b4";
  for (let x = 0.5; x < 10; x += 1) {
    const y = 38 - 2.6 * x + 1.5 * Math.cos(3 * x);
    g.fillRect(X(x) - 5, Y(y) - 5, 10, 10);
  }
  g.font = "bold 16px Arial, sans-serif";
  g.fillStyle = "#222";
  g.textAlign = "left";
  g.fillText("Exemple : deux séries à numériser", 100, 26);
  return enPng(c);
}

/** Gamme bleu → cyan → vert → jaune → rouge. */
function gamme(t: number): [number, number, number] {
  const n: [number, number, number][] = [
    [48, 18, 140],
    [30, 120, 230],
    [30, 200, 190],
    [120, 220, 60],
    [250, 200, 30],
    [240, 90, 20],
    [150, 10, 10],
  ];
  const u = Math.min(1, Math.max(0, t)) * (n.length - 1);
  const i = Math.min(n.length - 2, Math.floor(u)),
    f = u - i;
  return [0, 1, 2].map((k) => Math.round(n[i]![k]! + (n[i + 1]![k]! - n[i]![k]!) * f)) as [number, number, number];
}

export async function exempleCarte(): Promise<Uint8Array> {
  const [c, g] = toile(860, 620);
  const cadre = [100, 50, 700, 530];
  const gx: [number, number, number] = [-200, 200, 50];
  const gy: [number, number, number] = [-160, 160, 40];
  // pression d'un pneu (MPa) : empreinte elliptique, quatre sculptures, bords plus chargés
  const p = (x: number, y: number) => {
    const r = (x / 160) ** 2 + (y / 115) ** 2;
    if (r > 1) return 0;
    const rainure = [-58, 0, 58].some((yc) => Math.abs(y - yc) < 7) ? 0.15 : 1;
    return rainure * (0.55 + 0.45 * Math.sqrt(r)) * (1.25 - 0.25 * (x / 160) ** 2) * (1 + 0.12 * Math.sin(x / 18));
  };
  const img = g.createImageData(cadre[2]! - cadre[0]!, cadre[3]! - cadre[1]!);
  for (let j = 0; j < img.height; j++)
    for (let i = 0; i < img.width; i++) {
      const x = gx[0] + ((i + 0.5) / img.width) * (gx[1] - gx[0]);
      const y = gy[1] - ((j + 0.5) / img.height) * (gy[1] - gy[0]);
      const [r, v, b] = gamme(p(x, y) / 1.4);
      const o = 4 * (j * img.width + i);
      img.data[o] = r;
      img.data[o + 1] = v;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  g.putImageData(img, cadre[0]!, cadre[1]!);
  axes(g, cadre, gx, gy, "x (mm) — sens de roulement", "y (mm)", false);
  // légende
  const [lx, ly0, ly1] = [740, 60, 520];
  for (let j = ly0; j <= ly1; j++) {
    g.fillStyle = `rgb(${gamme((ly1 - j) / (ly1 - ly0)).join(",")})`;
    g.fillRect(lx, j, 26, 1);
  }
  g.strokeStyle = "#222";
  g.strokeRect(lx, ly0, 26, ly1 - ly0);
  g.fillStyle = "#222";
  g.font = "15px Arial, sans-serif";
  g.textAlign = "left";
  for (const v of [0, 0.35, 0.7, 1.05, 1.4]) {
    const y = ly1 - (v / 1.4) * (ly1 - ly0);
    g.beginPath();
    g.moveTo(lx + 26, y);
    g.lineTo(lx + 32, y);
    g.stroke();
    g.fillText(String(v).replace(".", ","), lx + 36, y + 5);
  }
  g.fillText("MPa", lx - 2, ly0 - 12);
  g.font = "bold 16px Arial, sans-serif";
  g.fillText("Exemple : pression de contact d'un pneu", 100, 32);
  return enPng(c);
}
