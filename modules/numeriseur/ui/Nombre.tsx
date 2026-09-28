/** Champ numérique : saisie libre (virgule acceptée), validée en quittant le champ ou par Entrée. */
import { useState } from "react";
import { fmt, lireNombre } from "./format";

export function Nombre({ v, onChange, aria, largeur = 7, vide = false }: { v: number | null; onChange(v: number | null): void; aria: string; largeur?: number; vide?: boolean }) {
  const [texte, setTexte] = useState<string | null>(null);
  const affiche = texte ?? (v === null ? "" : fmt(v).replace("—", ""));
  const valider = () => {
    if (texte === null) return;
    const n = lireNombre(texte);
    if (n !== null || vide) onChange(n);
    setTexte(null);
  };
  return (
    <input
      className="champ nm-nombre"
      style={{ width: `${largeur + 1}ch` }}
      aria-label={aria}
      value={affiche}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => e.key === "Enter" && valider()}
    />
  );
}
