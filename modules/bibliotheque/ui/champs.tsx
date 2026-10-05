/** Champs éditables : le texte est enregistré en quittant le champ, les listes aussitôt. */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { clesCitees } from "@noyau/citations";
import { completionCitation, insererCitation, resoudre } from "../core/citations";
import type { Reference } from "../core/modele";

export interface Citable {
  /** Références proposées quand on tape « [@ ». */
  refs: readonly { id: string; valeur: Reference }[];
  /** Référence de la fiche elle-même : on ne se cite pas. */
  exclure?: string;
  /** Ouvre la fiche d'une référence citée. */
  ouvrir?(id: string): void;
}

export function ChampTexte({
  valeur,
  onValider,
  multiligne,
  type = "text",
  placeholder,
  citer,
}: {
  valeur: string;
  onValider(v: string): void;
  multiligne?: boolean;
  type?: "text" | "date" | "number";
  placeholder?: string;
  /** Saisie assistée des citations `[@BIB-020]` et lien vers les fiches citées. */
  citer?: Citable;
}) {
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const [curseur, setCurseur] = useState(0);
  const [actif, setActif] = useState(0);
  const [masque, setMasque] = useState<number | null>(null);
  const [dedans, setDedans] = useState(false);
  const zone = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const curseurVoulu = useRef<number | null>(null);
  const courant = brouillon ?? valeur;

  const completion = useMemo(() => {
    if (!citer || !dedans) return null;
    const c = completionCitation(courant, curseur, citer.refs, citer.exclure);
    return c && c.debut !== masque ? c : null;
  }, [citer, dedans, courant, curseur, masque]);
  const cites = useMemo(() => (citer ? Object.values(resoudre(citer.refs, clesCitees(courant))) : []), [citer, courant]);

  // le curseur se place après la citation insérée, une fois le texte affiché
  useLayoutEffect(() => {
    if (curseurVoulu.current !== null && zone.current) {
      zone.current.setSelectionRange(curseurVoulu.current, curseurVoulu.current);
      curseurVoulu.current = null;
    }
  });

  const valider = () => {
    setDedans(false);
    if (brouillon !== null && brouillon !== valeur) onValider(brouillon);
    setBrouillon(null);
  };
  const choisir = (id: string) => {
    if (!completion) return;
    const r = insererCitation(courant, curseur, completion, id);
    curseurVoulu.current = r.curseur;
    setBrouillon(r.texte);
    setCurseur(r.curseur);
    setActif(0);
  };
  const touche = (e: React.KeyboardEvent) => {
    if (completion) {
      const n = completion.suggestions.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActif((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choisir(completion.suggestions[Math.min(actif, n - 1)]!.id);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMasque(completion.debut);
        return;
      }
    }
    if (!multiligne && e.key === "Enter") (e.target as HTMLInputElement).blur();
  };
  const commun = {
    ref: zone,
    className: "champ",
    value: courant,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      setBrouillon(e.target.value);
      setCurseur(e.target.selectionStart ?? e.target.value.length);
      setActif(0);
    },
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => setCurseur(e.currentTarget.selectionStart ?? 0),
    onFocus: () => setDedans(true),
    onBlur: valider,
    onKeyDown: touche,
  };
  const champ = multiligne ? <textarea {...commun} rows={3} /> : <input {...commun} type={type} />;
  if (!citer) return champ;
  return (
    <span className="champ-citable">
      {champ}
      {completion ? (
        <ul className="suggestions-citation" role="listbox" aria-label="Références à citer">
          {completion.suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === actif} className={i === actif ? "actif" : undefined} onMouseDown={(e) => (e.preventDefault(), choisir(s.id))}>
              <strong>{s.id}</strong> {s.court} <span className="discret">{s.titre}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {cites.length ? (
        <span className="citations-lues petit discret">
          Cite :{" "}
          {cites.map((c, i) => (
            <span key={c.id}>
              {i ? " · " : ""}
              {citer.ouvrir ? (
                <button type="button" className="lien" title={c.complete} onClick={() => citer.ouvrir!(c.id)}>
                  {c.auteurs}, {c.annee || "s. d."}
                </button>
              ) : (
                c.auteurs
              )}
            </span>
          ))}
        </span>
      ) : null}
    </span>
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
