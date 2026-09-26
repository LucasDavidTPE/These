/** Dessin du Gantt en SVG : lignes groupées par catégorie, ligne « aujourd'hui ». */
import { useLayoutEffect, useRef, useState } from "react";
import { echelle, graduations, largeur, x, type Barre, type Groupe, type Zoom } from "../core/gantt";

const H_LIGNE = 26;
const H_GROUPE = 24;
const H_ENTETE = 30;
const L_LIBELLES = 260;

export function Gantt({ groupes, aujourdhui, zoom, onChoisir }: { groupes: Groupe[]; aujourdhui: string; zoom: Zoom; onChoisir(b: Barre): void }) {
  const boite = useRef<HTMLDivElement>(null);
  const defilement = useRef<HTMLDivElement>(null);
  const [dispo, setDispo] = useState(900);
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return;
    const o = new ResizeObserver(() => setDispo(Math.max(300, el.clientWidth - L_LIBELLES - 20)));
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const toutes = groupes.flatMap((g) => g.barres);
  const e = echelle(toutes, aujourdhui, zoom, dispo);
  const W = largeur(e);
  const lignes: ({ type: "groupe"; g: Groupe } | { type: "barre"; b: Barre; couleur: string })[] = groupes.flatMap((g) => [
    { type: "groupe" as const, g },
    ...g.barres.map((b) => ({ type: "barre" as const, b, couleur: g.categorie.couleur })),
  ]);
  const hauteurs = lignes.map((l) => (l.type === "groupe" ? H_GROUPE : H_LIGNE));
  const positions = hauteurs.map((_, i) => H_ENTETE + hauteurs.slice(0, i).reduce((a, h) => a + h, 0));
  const H = H_ENTETE + hauteurs.reduce((a, h) => a + h, 0) + 8;
  const xAuj = x(e, aujourdhui);

  // Au changement de zoom, « aujourd'hui » vient près du bord gauche.
  useLayoutEffect(() => {
    if (defilement.current) defilement.current.scrollLeft = Math.max(0, xAuj - 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <div className="gantt" ref={boite}>
      <div className="gantt-libelles" style={{ width: L_LIBELLES }}>
        <svg width={L_LIBELLES} height={H}>
          {lignes.map((l, i) =>
            l.type === "groupe" ? (
              <text key={i} x={6} y={positions[i]! + 16} className="gantt-groupe">
                {l.g.categorie.nom}
              </text>
            ) : (
              <text key={i} x={16} y={positions[i]! + 17} className={`gantt-libelle${l.b.source ? " externe" : ""}`} onClick={() => onChoisir(l.b)}>
                {l.b.titre.length > 38 ? l.b.titre.slice(0, 37) + "…" : l.b.titre}
                <title>{l.b.titre}</title>
              </text>
            ),
          )}
        </svg>
      </div>
      <div className="gantt-defilement" ref={defilement}>
        <svg width={W} height={H}>
          {graduations(e, zoom).map((t, i) => (
            <g key={i}>
              <line x1={t.x} x2={t.x} y1={H_ENTETE - 6} y2={H} className={t.majeure ? "gantt-trait majeur" : "gantt-trait"} />
              <text x={t.x + 3} y={16} className={t.majeure ? "gantt-mois majeur" : "gantt-mois"}>
                {t.libelle}
              </text>
            </g>
          ))}
          {lignes.map((l, i) => {
            const y0 = positions[i]!;
            if (l.type === "groupe") return <rect key={i} x={0} y={y0} width={W} height={H_GROUPE} className="gantt-bande" />;
            const b = l.b;
            const x0 = x(e, b.debut);
            const titre = `${b.titre}\n${b.debut}${b.fin ? ` → ${b.fin}` : ""}${b.detail ? `\n${b.detail}` : ""}`;
            if (!b.fin) {
              const c = 7;
              return (
                <g key={i} className="gantt-cliquable" onClick={() => onChoisir(b)}>
                  <path d={`M${x0} ${y0 + 13 - c} L${x0 + c} ${y0 + 13} L${x0} ${y0 + 13 + c} L${x0 - c} ${y0 + 13} Z`} fill={l.couleur} />
                  <title>{titre}</title>
                </g>
              );
            }
            const w = Math.max(3, x(e, b.fin) - x0 + e.pxParJour);
            return (
              <g key={i} className="gantt-cliquable" onClick={() => onChoisir(b)}>
                <rect x={x0} y={y0 + 5} width={w} height={H_LIGNE - 10} rx={4} fill={l.couleur} opacity={b.source ? 0.55 : 0.9} />
                {b.avancement > 0 ? <rect x={x0} y={y0 + H_LIGNE - 8} width={(w * b.avancement) / 100} height={3} rx={1.5} className="gantt-avancement" /> : null}
                <title>{titre}</title>
              </g>
            );
          })}
          <line x1={xAuj} x2={xAuj} y1={H_ENTETE - 6} y2={H} className="gantt-aujourdhui" />
        </svg>
      </div>
    </div>
  );
}
