/**
 * Carte d'un champ sur un plan horizontal : pixels colorés (palette divergente centrée sur 0,
 * comme les figures du code Python), axes, barre de couleur, valeur sous le curseur.
 */
import { useEffect, useRef, useState } from "react";
import { dessiner, fmt, RDBU, unite } from "./carte";

export function CarteChamp({ x, y, f, comp, z }: { x: Float64Array; y: Float64Array; f: Float64Array; comp: string; z: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [survol, setSurvol] = useState<string>("");
  const nx = x.length,
    ny = y.length;
  let vmax = 0;
  for (const v of f) vmax = Math.max(vmax, Math.abs(v));
  const { k, u } = unite(comp);
  useEffect(() => {
    if (ref.current) dessiner(ref.current, f, nx, ny, vmax);
  }, [f, nx, ny, vmax]);
  const x0 = x[0]!,
    x1 = x[nx - 1]!,
    y0 = y[0]!,
    y1 = y[ny - 1]!;
  const rapport = (y1 - y0) / (x1 - x0 || 1);
  return (
    <figure className="cs-carte">
      <div className="cs-carte-zone">
        <span className="cs-axe-y">
          <span>{fmt(y1)}</span>
          <span>y (m)</span>
          <span>{fmt(y0)}</span>
        </span>
        <div>
          <canvas
            ref={ref}
            style={{ aspectRatio: `${1 / (rapport || 1)}` }}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const i = Math.min(nx - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * nx)));
              const j = Math.min(ny - 1, Math.max(0, ny - 1 - Math.floor(((e.clientY - r.top) / r.height) * ny)));
              setSurvol(`x = ${fmt(x[i]!)} m, y = ${fmt(y[j]!)} m : ${fmt(f[j * nx + i]! * k)} ${u}`);
            }}
            onMouseLeave={() => setSurvol("")}
          />
          <div className="cs-axe-x">
            <span>{fmt(x0)}</span>
            <span>x (m), sens de roulement →</span>
            <span>{fmt(x1)}</span>
          </div>
        </div>
        <div className="cs-barre" aria-label="Échelle de couleur">
          <span>{fmt(vmax * k)}</span>
          <i style={{ background: `linear-gradient(to top, ${RDBU.join(", ")})` }} />
          <span>{fmt(-vmax * k)}</span>
          <span className="discret petit">{u}</span>
        </div>
      </div>
      <figcaption className="discret petit">
        {comp} à z = {z} m {survol ? `— ${survol}` : ""}
      </figcaption>
    </figure>
  );
}
