/** Petits champs de saisie de la page Traitement. */
import { useState } from "react";

/** Nombre saisi librement (virgule acceptée) ; la valeur n'est prise qu'une fois lisible. */
export function ChampNombre({ valeur, onChange, label, pas = "any", largeur, aria }: { valeur: number; onChange(v: number): void; label?: string; pas?: string; largeur?: number; aria?: string }) {
  const [texte, setTexte] = useState<string | null>(null);
  const affiche = texte ?? (Number.isFinite(valeur) ? String(+valeur.toPrecision(10)) : "");
  const champ = (
    <input
      type="text"
      inputMode="decimal"
      className="tr-champ"
      style={largeur ? { width: largeur } : undefined}
      aria-label={aria ?? label}
      value={affiche}
      data-pas={pas}
      onChange={(e) => {
        setTexte(e.target.value);
        const v = parseFloat(e.target.value.replace(",", "."));
        if (Number.isFinite(v)) onChange(v);
      }}
      onBlur={() => setTexte(null)}
    />
  );
  if (!label) return champ;
  return (
    <label className="tr-libelle">
      <span>{label}</span>
      {champ}
    </label>
  );
}

export function Indicateur({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <div className="tr-indicateur">
      <div className="cle">{cle}</div>
      <div className="val">{valeur}</div>
    </div>
  );
}

export function Bloc({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="tr-bloc">
      <header>
        <h2>{titre}</h2>
        {aide ? <span className="discret petit">{aide}</span> : null}
      </header>
      {children}
    </section>
  );
}
