/**
 * Constellation : un article (ou une étiquette) au centre, ce qui le caractérise autour, puis ce qui lui
 * ressemble. Disposition radiale fixe (pas de forces) : toujours lisible, quel que soit le nombre d'articles.
 *  - Article au centre : ses étiquettes (anneau intérieur, couleur du critère), puis les articles qui en partagent
 *    le plus (anneau extérieur, placés près des étiquettes partagées, reliés à elles) et ceux qui lui sont liés.
 *  - Étiquette au centre : les articles qui la portent, puis les étiquettes qui les accompagnent le plus souvent.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { citation } from "../../core/calculs";
import { compagnes, filtrer, voisins } from "../../core/explorer";
import { cleEtiquette, vocabulaire, type ObjetRef, type ReglagesLecture } from "../../core/lecture";

/** Géométrie : en pixels réels du cadre (les textes gardent leur taille quelle que soit la place). */
interface Geo {
  L: number;
  H: number;
  CX: number;
  CY: number;
  R1: number;
  R2: number;
}
const geometrie = (L: number, H: number): Geo => {
  const R2 = Math.max(110, Math.min(L / 2 - 120, H / 2 - 34));
  return { L, H, CX: L / 2, CY: H / 2, R1: Math.max(80, R2 * 0.55), R2 };
};

export type Centre = { genre: "article"; id: string } | { genre: "etiquette"; critere: string; cle: string };

const polaire = (g: Geo, angle: number, r: number) => ({ x: g.CX + r * Math.cos(angle), y: g.CY + r * Math.sin(angle) });

/** Répartit des angles souhaités sur le cercle en gardant un écart minimal (ordre conservé). */
function etaler(souhaits: number[], ecart: number): number[] {
  const n = souhaits.length;
  if (!n) return [];
  const ordre = souhaits.map((a, i) => [((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), i] as const).sort((x, y) => x[0] - y[0]);
  const angles = ordre.map(([a]) => a);
  const e = Math.min(ecart, (2 * Math.PI) / n);
  for (let passe = 0; passe < 4; passe++)
    for (let i = 1; i < n; i++) if (angles[i]! - angles[i - 1]! < e) angles[i] = angles[i - 1]! + e;
  const out = new Array<number>(n);
  ordre.forEach(([, i], k) => (out[i] = angles[k]!));
  return out;
}

const ancre = (angle: number) => (Math.cos(angle) > 0.25 ? "start" : Math.cos(angle) < -0.25 ? "end" : "middle");
const court = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function Constellation({
  refs,
  reglages,
  centre,
  choisir,
  ouvrirFiche,
}: {
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  centre: Centre | null;
  choisir(c: Centre): void;
  ouvrirFiche(id: string): void;
}) {
  const [survol, setSurvol] = useState<string | null>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const [taille, setTaille] = useState({ l: 800, h: 560 });
  useEffect(() => {
    const el = cadre.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setTaille({ l: Math.max(360, Math.round(e.contentRect.width)), h: Math.max(380, Math.round(e.contentRect.height)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const g = geometrie(taille.l, taille.h);
  const { L, H, CX, CY, R1, R2 } = g;
  const indexCritere = new Map(reglages.criteres.map((c, i) => [c.id, i]));
  const couleur = (critere: string) => {
    const i = indexCritere.get(critere) ?? 99;
    return i < 8 ? `var(--lc-serie-${i + 1})` : "var(--discret)";
  };
  const parId = useMemo(() => new Map(refs.map((r) => [r.id, r.valeur])), [refs]);
  const nomArticle = (id: string) => citation(parId.get(id)!) || court(parId.get(id)?.titre ?? id, 22);

  const scene = useMemo(() => {
    if (!centre) return null;
    if (centre.genre === "article") {
      const r = parId.get(centre.id);
      if (!r) return null;
      const tags = reglages.criteres.flatMap((c) => (r.lecture[c.id]?.etiquettes ?? []).map((e) => ({ k: `${c.id}|${cleEtiquette(e)}`, critere: c.id, etiquette: e })));
      const angleTag = new Map(tags.map((t, i) => [t.k, -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, tags.length)]));
      const vs = voisins(refs, centre.id, 10);
      const types = new Map(reglages.typesLiens.map((t) => [t.id, t]));
      const lies = [
        ...r.liens.map((l) => ({ id: l.vers, libelle: types.get(l.type)?.nom ?? l.type, sortant: true })),
        ...refs.flatMap((x) => x.valeur.liens.filter((l) => l.vers === centre.id).map((l) => ({ id: x.id, libelle: types.get(l.type)?.inverse ?? l.type, sortant: false }))),
      ].filter((l) => parId.has(l.id));
      const autres = [...new Set([...vs.map((v) => v.id), ...lies.map((l) => l.id)])];
      const souhaits = autres.map((id) => {
        const v = vs.find((x) => x.id === id);
        if (!v || !v.communes.length) return Math.PI / 2;
        const a = v.communes.map((k) => angleTag.get(k) ?? 0);
        return Math.atan2(a.reduce((s, x) => s + Math.sin(x), 0), a.reduce((s, x) => s + Math.cos(x), 0));
      });
      const angles = etaler(souhaits, 0.32);
      return {
        genre: "article" as const,
        libelle: nomArticle(centre.id),
        interieur: tags.map((t) => ({ ...t, ...polaire(g, angleTag.get(t.k)!, R1), angle: angleTag.get(t.k)! })),
        exterieur: autres.map((id, i) => ({
          id,
          ...polaire(g, angles[i]!, R2),
          angle: angles[i]!,
          communes: vs.find((v) => v.id === id)?.communes ?? [],
          lien: lies.find((l) => l.id === id) ?? null,
        })),
      };
    }
    const porteurs = filtrer(refs, [centre]).filter((x) => x.valeur.statut !== "Écarté");
    const montres = porteurs.slice(0, 24);
    const angleArt = new Map(montres.map((x, i) => [x.id, -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, montres.length)]));
    const comp = compagnes(montres, centre.critere, centre.cle, 12);
    const souhaits = comp.map((c) => {
      const a = montres.filter((x) => x.valeur.lecture[c.critere]?.etiquettes.some((e) => cleEtiquette(e) === cleEtiquette(c.etiquette))).map((x) => angleArt.get(x.id)!);
      return a.length ? Math.atan2(a.reduce((s, x) => s + Math.sin(x), 0), a.reduce((s, x) => s + Math.cos(x), 0)) : 0;
    });
    const angles = etaler(souhaits, 0.34);
    const etiquette = vocabulaire(refs, centre.critere, reglages).find((e) => e.cle === centre.cle)?.etiquette ?? centre.cle;
    return {
      genre: "etiquette" as const,
      libelle: etiquette,
      critere: centre.critere,
      reste: porteurs.length - montres.length,
      interieur: montres.map((x) => ({ id: x.id, ...polaire(g, angleArt.get(x.id)!, R1), angle: angleArt.get(x.id)! })),
      exterieur: comp.map((c, i) => ({
        ...c,
        k: `${c.critere}|${cleEtiquette(c.etiquette)}`,
        ...polaire(g, angles[i]!, R2),
        angle: angles[i]!,
        articles: montres.filter((x) => x.valeur.lecture[c.critere]?.etiquettes.some((e) => cleEtiquette(e) === cleEtiquette(c.etiquette))).map((x) => x.id),
      })),
    };
  }, [centre, refs, reglages, parId, taille.l, taille.h]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!centre || !scene)
    return (
      <div className="lc-cadre-constellation lc-vide" ref={cadre}>
        <p>Choisissez un article dans la liste (ou une étiquette dans l'explorateur, clic droit) : sa constellation s'affiche ici.</p>
      </div>
    );

  const eteint = (ids: string[]) => survol !== null && !ids.includes(survol);

  return (
    <div className="lc-cadre-constellation" ref={cadre}>
    <svg className="lc-constellation" width={L} height={H} viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Constellation de ${scene.libelle}`}>
      <circle cx={CX} cy={CY} r={R1} className="lc-orbite" />
      <circle cx={CX} cy={CY} r={R2} className="lc-orbite" />
      {scene.genre === "article" ? (
        <>
          {scene.interieur.map((t) => (
            <line key={`c${t.k}`} x1={CX} y1={CY} x2={t.x} y2={t.y} stroke={couleur(t.critere)} className="lc-rayon" opacity={eteint([t.k]) ? 0.15 : 0.55} />
          ))}
          {scene.exterieur.flatMap((a) =>
            a.communes.map((k) => {
              const t = scene.interieur.find((x) => x.k === k);
              return t ? <line key={`${a.id}${k}`} x1={a.x} y1={a.y} x2={t.x} y2={t.y} stroke={couleur(t.critere)} className="lc-fil" opacity={eteint([a.id, k]) ? 0.06 : 0.5} /> : null;
            }),
          )}
          {scene.exterieur
            .filter((a) => a.lien)
            .map((a) => (
              <g key={`l${a.id}`} opacity={eteint([a.id]) ? 0.15 : 1}>
                <line x1={CX} y1={CY} x2={a.x} y2={a.y} className="lc-lien-type" />
                <text x={(CX + a.x) / 2} y={(CY + a.y) / 2 - 4} textAnchor="middle" className="lc-legende-lien">
                  {a.lien!.libelle}
                </text>
              </g>
            ))}
          {scene.interieur.map((t) => (
            <g
              key={t.k}
              transform={`translate(${t.x} ${t.y})`}
              className="lc-cliquable"
              onPointerEnter={() => setSurvol(t.k)}
              onPointerLeave={() => setSurvol(null)}
              onClick={() => choisir({ genre: "etiquette", critere: t.critere, cle: t.k.slice(t.k.indexOf("|") + 1) })}
            >
              <rect x={-8} y={-8} width={16} height={16} rx={4} fill={couleur(t.critere)} className="lc-etiquette" />
              <text x={Math.cos(t.angle) * 14} y={Math.sin(t.angle) * 14 + 4} textAnchor={ancre(t.angle)} className="lc-texte lc-texte-fort">
                {court(t.etiquette)}
              </text>
              <title>{`${reglages.criteres.find((c) => c.id === t.critere)?.nom} : ${t.etiquette} — cliquer pour centrer`}</title>
            </g>
          ))}
          {scene.exterieur.map((a) => (
            <g
              key={a.id}
              transform={`translate(${a.x} ${a.y})`}
              className="lc-cliquable"
              opacity={eteint([a.id, ...a.communes]) ? 0.25 : 1}
              onPointerEnter={() => setSurvol(a.id)}
              onPointerLeave={() => setSurvol(null)}
              onClick={() => choisir({ genre: "article", id: a.id })}
              onDoubleClick={() => ouvrirFiche(a.id)}
            >
              <circle r={5 + Math.min(6, a.communes.length * 1.5)} className={parId.get(a.id)?.statut === "Lu" ? "lc-article lc-lu" : "lc-article"} />
              <text x={Math.cos(a.angle) * 14} y={Math.sin(a.angle) * 14 + 4} textAnchor={ancre(a.angle)} className="lc-texte">
                {nomArticle(a.id)}
              </text>
              <title>{`${parId.get(a.id)?.titre ?? a.id}${a.communes.length ? ` — ${a.communes.length} étiquette(s) en commun` : ""} — clic : centrer ; double-clic : fiche`}</title>
            </g>
          ))}
          <g transform={`translate(${CX} ${CY})`} className="lc-cliquable" onDoubleClick={() => ouvrirFiche(centre.genre === "article" ? centre.id : "")}>
            <circle r={13} className="lc-centre-article" />
            <text y={32} textAnchor="middle" className="lc-texte lc-texte-centre">
              {scene.libelle}
            </text>
            <title>{`${parId.get(centre.genre === "article" ? centre.id : "")?.titre ?? ""} — double-clic : fiche`}</title>
          </g>
        </>
      ) : (
        <>
          {scene.interieur.map((a) => (
            <line key={`c${a.id}`} x1={CX} y1={CY} x2={a.x} y2={a.y} className="lc-rayon" stroke="var(--discret)" opacity={eteint([a.id]) ? 0.1 : 0.45} />
          ))}
          {scene.exterieur.flatMap((c) =>
            c.articles.map((id) => {
              const a = scene.interieur.find((x) => x.id === id)!;
              return <line key={`${c.k}${id}`} x1={c.x} y1={c.y} x2={a.x} y2={a.y} stroke={couleur(c.critere)} className="lc-fil" opacity={eteint([c.k, id]) ? 0.06 : 0.45} />;
            }),
          )}
          {scene.interieur.map((a) => (
            <g
              key={a.id}
              transform={`translate(${a.x} ${a.y})`}
              className="lc-cliquable"
              onPointerEnter={() => setSurvol(a.id)}
              onPointerLeave={() => setSurvol(null)}
              onClick={() => choisir({ genre: "article", id: a.id })}
              onDoubleClick={() => ouvrirFiche(a.id)}
            >
              <circle r={7} className={parId.get(a.id)?.statut === "Lu" ? "lc-article lc-lu" : "lc-article"} />
              <text x={Math.cos(a.angle) * 12} y={Math.sin(a.angle) * 12 + 4} textAnchor={ancre(a.angle)} className="lc-texte">
                {nomArticle(a.id)}
              </text>
              <title>{`${parId.get(a.id)?.titre ?? a.id} — clic : centrer ; double-clic : fiche`}</title>
            </g>
          ))}
          {scene.exterieur.map((c) => (
            <g
              key={c.k}
              transform={`translate(${c.x} ${c.y})`}
              className="lc-cliquable"
              opacity={eteint([c.k, ...c.articles]) ? 0.25 : 1}
              onPointerEnter={() => setSurvol(c.k)}
              onPointerLeave={() => setSurvol(null)}
              onClick={() => choisir({ genre: "etiquette", critere: c.critere, cle: cleEtiquette(c.etiquette) })}
            >
              <rect x={-7} y={-7} width={14} height={14} rx={3} fill={couleur(c.critere)} className="lc-etiquette" />
              <text x={Math.cos(c.angle) * 13} y={Math.sin(c.angle) * 13 + 4} textAnchor={ancre(c.angle)} className="lc-texte">
                {court(c.etiquette)} <tspan className="lc-compte-texte">{c.n}</tspan>
              </text>
              <title>{`${reglages.criteres.find((x) => x.id === c.critere)?.nom} : ${c.etiquette} — avec ${c.n} de ces articles`}</title>
            </g>
          ))}
          <g transform={`translate(${CX} ${CY})`}>
            <rect x={-14} y={-14} width={28} height={28} rx={6} fill={couleur(scene.critere)} className="lc-etiquette" />
            <text y={34} textAnchor="middle" className="lc-texte lc-texte-centre">
              {scene.libelle}
            </text>
          </g>
          {scene.reste > 0 ? (
            <text x={L - 12} y={H - 12} textAnchor="end" className="lc-texte">
              + {scene.reste} autre(s) article(s) non montré(s)
            </text>
          ) : null}
        </>
      )}
    </svg>
    </div>
  );
}
