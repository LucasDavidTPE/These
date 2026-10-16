/**
 * « Animer les instants » (carte d'un export à plusieurs instants) : une image par instant à la même échelle de
 * couleurs, assemblées en GIF animé (PowerPoint, Word) ou livrées en images PNG avec le code `\animategraphics`
 * (Beamer), dans une archive .zip.
 */
import { useState } from "react";
import { strToU8, zipSync } from "fflate";
import { useContexte } from "@interface/contexte";
import { gifAnime } from "@noyau/formats/gif";
import {
  animationBeamer,
  exportGraphSvg,
  imagesInstants,
  parametresVariables,
  type ExportComsol,
  type TraceCarte,
} from "../../core/graph";
import { svgToPng, svgToRgba } from "../editor/raster";
import { useContexteTrace } from "./hooks";

const nomFichier = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "animation";

export function AnimationInstants({
  t,
  plan,
}: {
  t: TraceCarte;
  plan: ExportComsol;
}) {
  const c = useContexteTrace();
  const ctx = useContexte();
  const p = parametresVariables(plan)[0]!;
  const valeurs = p.valeurs.map((v) => v.texte);
  const [pas, setPas] = useState(Math.max(1, Math.ceil(valeurs.length / 40)));
  const [delai, setDelai] = useState(400);
  const [dpi, setDpi] = useState(110);
  const [etat, setEtat] = useState("");
  const choisis = valeurs.filter((_, i) => i % pas === 0);
  const base = nomFichier(
    `${plan.nom.replace(/\.(txt|csv|dat)$/i, "")}-${t.expression ?? ""}`,
  );

  const images = () => {
    const im = imagesInstants(t, c, p, choisis);
    if (!im.length)
      throw new Error("Rien à animer : choisissez un plan et une grandeur.");
    return im;
  };
  async function gif() {
    try {
      const im = images();
      const frames = [];
      for (const [i, x] of im.entries()) {
        setEtat(`Image ${i + 1} / ${im.length}…`);
        frames.push(
          await svgToRgba(
            exportGraphSvg(x.doc),
            x.doc.width,
            x.doc.height,
            dpi,
          ),
        );
      }
      setEtat("Assemblage du GIF…");
      const octets = gifAnime(frames, { delai: delai / 10 });
      const ok = await ctx.plateforme.enregistrerSous(`${base}.gif`, octets);
      setEtat(
        ok
          ? `GIF enregistré (${im.length} images, ${(octets.length / 1024).toFixed(0)} ko).`
          : "",
      );
    } catch (e) {
      setEtat(`Échec : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function beamer() {
    try {
      const im = images();
      const fichiers: Record<string, Uint8Array> = {};
      for (const [i, x] of im.entries()) {
        setEtat(`Image ${i + 1} / ${im.length}…`);
        fichiers[`${base}-${i}.png`] = await svgToPng(
          exportGraphSvg(x.doc),
          x.doc.width,
          x.doc.height,
          200,
          "white",
        );
      }
      fichiers[`${base}.tex`] = strToU8(
        animationBeamer({
          n: im.length,
          parSeconde: 1000 / delai,
          prefixe: `${base}-`,
        }),
      );
      const ok = await ctx.plateforme.enregistrerSous(
        `${base}-beamer.zip`,
        zipSync(fichiers, { level: 0 }),
      );
      setEtat(
        ok
          ? `Archive enregistrée : ${im.length} images PNG et ${base}.tex (\\input après \\usepackage{animate}).`
          : "",
      );
    } catch (e) {
      setEtat(`Échec : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const occupe = etat.endsWith("…");
  return (
    <details className="atelier-champ atelier-declinaison">
      <summary>
        <strong>Animer les instants</strong>{" "}
        <span className="muted small">
          (GIF animé, ou images + \animategraphics pour Beamer)
        </span>
      </summary>
      <p className="muted small">
        {choisis.length} image(s) : la carte ci-contre à chaque instant, même
        échelle de couleurs, l'instant écrit sous l'axe.
      </p>
      <div className="grid2">
        <label className="field">
          <span>Un instant sur</span>
          <input
            type="number"
            min={1}
            max={valeurs.length}
            value={pas}
            onChange={(e) => setPas(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="field">
          <span>Durée d'une image (ms)</span>
          <input
            type="number"
            min={20}
            step={50}
            value={delai}
            onChange={(e) =>
              setDelai(Math.max(20, Number(e.target.value) || 400))
            }
          />
        </label>
      </div>
      <label className="field">
        <span>Résolution du GIF</span>
        <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
          <option value={80}>écran (80 dpi)</option>
          <option value={110}>présentation (110 dpi)</option>
          <option value={160}>grande (160 dpi)</option>
        </select>
      </label>
      <div className="rangee-boutons">
        <button
          type="button"
          className="primary"
          disabled={occupe || !choisis.length}
          onClick={() => void gif()}
        >
          GIF animé…
        </button>
        <button
          type="button"
          disabled={occupe || !choisis.length}
          onClick={() => void beamer()}
        >
          Images + LaTeX (Beamer, .zip)…
        </button>
      </div>
      {etat ? <p className="small">{etat}</p> : null}
    </details>
  );
}
