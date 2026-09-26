/** Champs éditables : le texte est enregistré en quittant le champ, les listes aussitôt. */
import { useState } from "react";

export function ChampTexte({ valeur, onValider, multiligne, type = "text", placeholder }: { valeur: string; onValider(v: string): void; multiligne?: boolean; type?: "text" | "date" | "number"; placeholder?: string }) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const courant = brouillon ?? valeur;
  const valider = () => {
    if (brouillon !== null && brouillon !== valeur) onValider(brouillon);
    setBrouillon(null);
  };
  return multiligne ? (
    <textarea className="champ" rows={3} value={courant} placeholder={placeholder} onChange={(e) => setBrouillon(e.target.value)} onBlur={valider} />
  ) : (
    <input className="champ" type={type} value={courant} placeholder={placeholder} onChange={(e) => setBrouillon(e.target.value)} onBlur={valider} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
  );
}

export function ChampChoix({ valeur, options, onValider, vide }: { valeur: string; options: readonly (string | [string, string])[]; onValider(v: string): void; vide?: string }) {
  return (
    <select className="champ" value={valeur} onChange={(e) => onValider(e.target.value)}>
      {vide !== undefined ? <option value="">{vide}</option> : null}
      {options.map((o) => {
        const [v, l] = typeof o === "string" ? [o, o] : o;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function Libelle({ titre, children, large }: { titre: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label className={large ? "libelle large" : "libelle"}>
      <span>{titre}</span>
      {children}
    </label>
  );
}
