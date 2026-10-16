/**
 * Repères (lignes horizontales / verticales étiquetées) et annotations (points commentés) d'un graphe : valeur de
 * référence, instant, interfaces de couches réglées pour toute la bibliothèque, pic d'un signal…
 */
import { useEffect, useState } from "react";
import { TRAITS, type Annotation, type Coin, type Repere, type Trait } from "../../core/graph";
import { NumberInput, TextInput } from "../editor/fields";
import { useGraph } from "./useGraph";
import { useReglagesComsol } from "./useReglagesComsol";

const TRAIT_LIBELLE: Record<Trait, string> = { solid: "continu", dashed: "tirets", dotted: "pointillé" };
const COINS: [Coin, string][] = [
  ["north east", "en haut à droite"],
  ["north west", "en haut à gauche"],
  ["south east", "en bas à droite"],
  ["south west", "en bas à gauche"],
];
const FACTEURS: Record<string, number> = { mm: 1000, cm: 100, m: 1 };

export function ReperesReglages() {
  const s = useGraph();
  const reg = useReglagesComsol();
  useEffect(() => {
    void useReglagesComsol.getState().charger();
  }, []);
  const [couches, setCouches] = useState({ axe: "y" as "x" | "y", unite: "mm", profondeur: false });
  const reperes = s.doc.reperes ?? [];
  const annotations = s.doc.annotations ?? [];
  const majR = (r: Repere[]) => s.update({ reperes: r.length ? r : undefined });
  const majA = (a: Annotation[]) => s.update({ annotations: a.length ? a : undefined });
  const milieu = (axe: "x" | "y") => {
    const vals = axe === "x" ? s.doc.series.flatMap((x) => x.x) : s.doc.series.flatMap((x) => x.y);
    const c = s.doc.carte;
    const tous = [...vals, ...(c ? (axe === "x" ? c.x : c.y) : [])].filter(Number.isFinite);
    return tous.length ? Number(((Math.min(...tous) + Math.max(...tous)) / 2).toPrecision(3)) : 0;
  };
  return (
    <fieldset className="list-field">
      <legend>Repères et annotations</legend>
      {reperes.map((r, i) => (
        <div key={`r${i}`} className="repere-ligne">
          <select value={r.axe} onChange={(e) => majR(reperes.map((x, j) => (j === i ? { ...x, axe: e.target.value as "x" | "y" } : x)))} aria-label="Sens">
            <option value="y">— y =</option>
            <option value="x">| x =</option>
          </select>
          <NumberInput value={r.valeur} onChange={(v) => majR(reperes.map((x, j) => (j === i ? { ...x, valeur: v } : x)))} />
          <TextInput value={r.texte} onChange={(v) => majR(reperes.map((x, j) => (j === i ? { ...x, texte: v } : x)))} placeholder="Texte" />
          <select value={r.trait} onChange={(e) => majR(reperes.map((x, j) => (j === i ? { ...x, trait: e.target.value as Trait } : x)))} aria-label="Trait">
            {TRAITS.map((t) => (
              <option key={t} value={t}>
                {TRAIT_LIBELLE[t]}
              </option>
            ))}
          </select>
          <button type="button" className="small-btn" aria-label="Retirer" onClick={() => majR(reperes.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="small-btn" onClick={() => majR([...reperes, { axe: "y", valeur: milieu("y"), texte: "", trait: "dashed" }])}>
          + Ligne horizontale
        </button>
        <button type="button" className="small-btn" onClick={() => majR([...reperes, { axe: "x", valeur: milieu("x"), texte: "", trait: "dashed" }])}>
          + Ligne verticale
        </button>
      </div>
      <details>
        <summary>Interfaces de couches ({reg.reglages.interfaces.map((i) => i.texte).join(", ") || "aucune réglée"})</summary>
        <div className="grid2">
          <label className="field">
            <span>Axe de la cote</span>
            <select value={couches.axe} onChange={(e) => setCouches({ ...couches, axe: e.target.value as "x" | "y" })}>
              <option value="y">vertical (y)</option>
              <option value="x">horizontal (x)</option>
            </select>
          </label>
          <label className="field">
            <span>Unité de l'axe</span>
            <select value={couches.unite} onChange={(e) => setCouches({ ...couches, unite: e.target.value })}>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </label>
        </div>
        <label className="chip">
          <input type="checkbox" checked={couches.profondeur} onChange={(e) => setCouches({ ...couches, profondeur: e.target.checked })} />
          axe en profondeur positive
        </label>
        <button
          type="button"
          className="small-btn"
          disabled={!reg.reglages.interfaces.length}
          onClick={() =>
            majR([
              ...reperes,
              ...reg.reglages.interfaces.map((i) => ({ axe: couches.axe, valeur: Number((i.z * FACTEURS[couches.unite]! * (couches.profondeur ? -1 : 1)).toPrecision(10)), texte: i.texte, trait: "dashed" as const })),
            ])
          }
        >
          Ajouter les interfaces
        </button>
        <p className="muted small">Cotes réglées une fois pour toute la bibliothèque (panneau « Exports COMSOL », Correspondances et couches).</p>
      </details>
      {annotations.map((a, i) => (
        <div key={`a${i}`} className="repere-ligne">
          <span className="muted small">•</span>
          <NumberInput value={a.x} onChange={(v) => majA(annotations.map((x, j) => (j === i ? { ...x, x: v } : x)))} title="x" />
          <NumberInput value={a.y} onChange={(v) => majA(annotations.map((x, j) => (j === i ? { ...x, y: v } : x)))} title="y" />
          <TextInput value={a.texte} onChange={(v) => majA(annotations.map((x, j) => (j === i ? { ...x, texte: v } : x)))} placeholder="Texte" />
          <select value={a.position} onChange={(e) => majA(annotations.map((x, j) => (j === i ? { ...x, position: e.target.value as Coin } : x)))} aria-label="Position du texte">
            {COINS.map(([c, l]) => (
              <option key={c} value={c}>
                {l}
              </option>
            ))}
          </select>
          <button type="button" className="small-btn" aria-label="Retirer" onClick={() => majA(annotations.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="small-btn" onClick={() => majA([...annotations, { x: milieu("x"), y: milieu("y"), texte: "", position: "north east" }])}>
        + Annotation (point commenté)
      </button>
    </fieldset>
  );
}
