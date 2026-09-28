/**
 * Retouche des données d'une série dans la page Graphes : unités, signe, origine, plage de x,
 * lissage, allègement, tri, échange des axes, et le tableau x ↹ y lui-même (modifiable,
 * copiable vers Excel). Tout passe par l'historique (Ctrl+Z).
 */
import { useState } from "react";
import { decimate, parseXY, smooth, sortByX, swapXY, toTsv, transform, xRange, type Series } from "../../core/graph";
import { NumberInput } from "../editor/fields";
import { getBackend } from "../platform/backend";
import { useGraph } from "./useGraph";

export function DonneesSerie({ i, sr }: { i: number; sr: Series }) {
  const s = useGraph();
  const [axe, setAxe] = useState<"x" | "y">("y");
  const [facteur, setFacteur] = useState(1);
  const [decalage, setDecalage] = useState(0);
  const [de, setDe] = useState(Math.min(...sr.x));
  const [a, setA] = useState(Math.max(...sr.x));
  const [fenetre, setFenetre] = useState(5);
  const [pas, setPas] = useState(2);
  const [tableau, setTableau] = useState<string | null>(null);

  const affine = (scale: number, offset: number) => (axe === "x" ? transform(sr, { scale, offset }, null) : transform(sr, null, { scale, offset }));
  const texte = tableau ?? toTsv(sr);

  function appliquerTableau() {
    const r = parseXY(texte);
    if (!r.x.length) return s.editSeries(i, (x) => ({ ...x, x: [], y: [] })); // vide : refusée, avec un message
    s.editSeries(i, (x) => ({ ...x, x: r.x, y: r.y }), `Tableau appliqué${r.skipped ? ` (${r.skipped} ligne(s) non numérique(s) ignorée(s))` : ""}`);
    setTableau(null);
  }

  return (
    <div className="donnees-serie">
      <div className="donnees-ligne">
        <select value={axe} onChange={(e) => setAxe(e.target.value as "x" | "y")} aria-label="Axe à transformer">
          <option value="y">y</option>
          <option value="x">x</option>
        </select>
        <span>×</span>
        <NumberInput value={facteur} onChange={setFacteur} />
        <span>+</span>
        <NumberInput value={decalage} onChange={setDecalage} />
        <button type="button" className="small-btn" disabled={facteur === 1 && decalage === 0} onClick={() => s.editSeries(i, () => affine(facteur, decalage), `${axe} × ${facteur} + ${decalage}`)}>
          Appliquer
        </button>
      </div>
      <div className="donnees-ligne">
        <button type="button" className="small-btn" title={`Inverser le signe de ${axe}`} onClick={() => s.editSeries(i, () => affine(-1, 0), `Signe de ${axe} inversé`)}>
          −{axe}
        </button>
        <button type="button" className="small-btn" title="Ex. : MPa → kPa, mm/mm → ‰" onClick={() => s.editSeries(i, () => affine(1000, 0), `${axe} × 1000`)}>
          ×1000
        </button>
        <button type="button" className="small-btn" title="Ex. : MPa → GPa" onClick={() => s.editSeries(i, () => affine(0.001, 0), `${axe} ÷ 1000`)}>
          ÷1000
        </button>
        <button type="button" className="small-btn" title={`Recaler le premier point à 0 sur ${axe}`} onClick={() => s.editSeries(i, () => affine(1, -(axe === "x" ? sr.x[0]! : sr.y[0]!)), `Zéro de ${axe} recalé sur le premier point`)}>
          zéro
        </button>
        <button type="button" className="small-btn" onClick={() => s.editSeries(i, swapXY, "x et y échangés")}>
          x ↔ y
        </button>
        <button type="button" className="small-btn" onClick={() => s.editSeries(i, sortByX, "Points triés par x")}>
          trier
        </button>
        <button type="button" className="small-btn" onClick={() => s.duplicateSeries(i)}>
          dupliquer
        </button>
      </div>
      <div className="donnees-ligne">
        <span>x de</span>
        <NumberInput value={de} onChange={setDe} />
        <span>à</span>
        <NumberInput value={a} onChange={setA} />
        <button type="button" className="small-btn" onClick={() => s.editSeries(i, (x) => xRange(x, de, a, true), "Plage gardée")}>
          garder
        </button>
        <button type="button" className="small-btn" onClick={() => s.editSeries(i, (x) => xRange(x, de, a, false), "Plage retirée")}>
          retirer
        </button>
      </div>
      <div className="donnees-ligne">
        <span>lisser sur</span>
        <NumberInput value={fenetre} onChange={setFenetre} />
        <span>pts</span>
        <button type="button" className="small-btn" onClick={() => s.editSeries(i, (x) => smooth(x, fenetre), `Lissé (moyenne glissante sur ${Math.round(fenetre)} points)`)}>
          lisser
        </button>
        <span>1 point sur</span>
        <NumberInput value={pas} onChange={setPas} />
        <button type="button" className="small-btn" onClick={() => s.editSeries(i, (x) => decimate(x, pas), `Allégé (1 point sur ${Math.round(pas)})`)}>
          alléger
        </button>
      </div>
      <label className="field">
        <span>
          Tableau x ↹ y ({sr.x.length} points) — modifiable, ou coller depuis Excel
        </span>
        <textarea rows={6} value={texte} spellCheck={false} onChange={(e) => setTableau(e.target.value)} />
      </label>
      <div className="donnees-ligne">
        <button type="button" className="small-btn" disabled={tableau === null} onClick={appliquerTableau}>
          Appliquer le tableau
        </button>
        <button type="button" className="small-btn" disabled={tableau === null} onClick={() => setTableau(null)}>
          Annuler la saisie
        </button>
        <button type="button" className="small-btn" onClick={() => void getBackend().then((b) => b.copyText(toTsv(sr)))}>
          Copier
        </button>
      </div>
    </div>
  );
}
