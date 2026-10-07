/**
 * Saisie des étiquettes d'une case : puces retirables, champ avec suggestions tirées du vocabulaire du
 * critère (les plus courantes d'abord), Entrée ou « ; » pour ajouter, note libre facultative.
 */
import { useMemo, useRef, useState } from "react";
import { cleEtiquette, nettoyerEtiquette, unirEtiquettes, type EntreeVocabulaire } from "../../core/lecture";
import type { CelluleLecture } from "../../core/modele";

export function Puces({ c, max }: { c: CelluleLecture | undefined; max?: number }) {
  if (!c) return null;
  const e = max ? c.etiquettes.slice(0, max) : c.etiquettes;
  return (
    <span className={`lc-puces${c.valide ? "" : " lc-a-valider"}`} title={c.valide ? undefined : "À valider : repris automatiquement, pas encore confirmé"}>
      {e.map((x) => (
        <span key={x} className="lc-puce">
          {x}
        </span>
      ))}
      {max && c.etiquettes.length > max ? <span className="discret petit">+{c.etiquettes.length - max}</span> : null}
      {c.note ? (
        <span className="lc-note" title={c.note}>
          {c.note}
        </span>
      ) : null}
    </span>
  );
}

export function EditeurEtiquettes({
  valeur,
  vocabulaire,
  onValider,
  onFermer,
  autoFocus,
  aide,
}: {
  valeur: CelluleLecture | undefined;
  vocabulaire: EntreeVocabulaire[];
  onValider(c: CelluleLecture): void;
  /** Fermeture (Échap, ou clic ailleurs dans la grille). */
  onFermer?(): void;
  autoFocus?: boolean;
  aide?: string;
}) {
  const [etiquettes, setEtiquettes] = useState<string[]>(valeur?.etiquettes ?? []);
  const [note, setNote] = useState(valeur?.note ?? "");
  const [saisie, setSaisie] = useState("");
  const [actif, setActif] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const bloc = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const deja = new Set(etiquettes.map(cleEtiquette));
    const q = cleEtiquette(saisie);
    return vocabulaire.filter((v) => !deja.has(v.cle) && (!q || v.cle.includes(q))).slice(0, 8);
  }, [vocabulaire, etiquettes, saisie]);

  // saisie à la main : la case est validée
  const valider = (e = etiquettes, n = note) => onValider({ etiquettes: e, note: n.trim(), valide: true });
  const ajouter = (texte: string) => {
    const t = nettoyerEtiquette(texte);
    if (!t) return;
    // si l'étiquette existe déjà sous une autre écriture, on reprend celle du vocabulaire
    const connue = vocabulaire.find((v) => v.cle === cleEtiquette(t))?.etiquette ?? t;
    const suite = unirEtiquettes(etiquettes, [connue]);
    setEtiquettes(suite);
    setSaisie("");
    setActif(0);
    valider(suite);
  };
  const retirer = (x: string) => {
    const suite = etiquettes.filter((e) => e !== x);
    setEtiquettes(suite);
    valider(suite);
  };

  return (
    <div
      className="lc-editeur"
      ref={bloc}
      onBlur={(e) => {
        if (!bloc.current?.contains(e.relatedTarget as Node | null)) {
          if (saisie.trim()) ajouter(saisie);
          setOuvert(false);
          onFermer?.();
        }
      }}
    >
      <div className="lc-saisie" onClick={() => champ.current?.focus()}>
        {etiquettes.map((x) => (
          <span key={x} className="lc-puce">
            {x}
            <button type="button" aria-label={`Retirer ${x}`} onClick={() => retirer(x)}>
              ×
            </button>
          </span>
        ))}
        <input
          ref={champ}
          className="lc-champ"
          value={saisie}
          autoFocus={autoFocus}
          placeholder={etiquettes.length ? "" : "étiquette, Entrée…"}
          aria-label="Ajouter une étiquette"
          title={aide}
          onFocus={() => setOuvert(true)}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(";")) {
              for (const p of v.split(";").slice(0, -1)) ajouter(p);
              setSaisie(v.split(";").at(-1) ?? "");
            } else setSaisie(v);
            setOuvert(true);
            setActif(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault();
              setActif((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault();
              setActif((a) => (a + suggestions.length - 1) % suggestions.length);
            } else if (e.key === "Enter" || e.key === "Tab") {
              const s = ouvert && suggestions[actif] && (saisie.trim() === "" || suggestions[actif]!.cle.includes(cleEtiquette(saisie))) ? suggestions[actif]!.etiquette : saisie;
              if (!s.trim()) return;
              e.preventDefault();
              ajouter(s);
            } else if (e.key === "Backspace" && !saisie && etiquettes.length) {
              retirer(etiquettes[etiquettes.length - 1]!);
            } else if (e.key === "Escape") {
              setOuvert(false);
              onFermer?.();
            }
          }}
        />
      </div>
      {ouvert && suggestions.length ? (
        <ul className="lc-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.cle}
              role="option"
              aria-selected={i === actif}
              className={i === actif ? "actif" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                ajouter(s.etiquette);
              }}
              title={s.definition || undefined}
            >
              {s.etiquette} <span className="discret petit">{s.ids.length}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        className="champ lc-note-champ"
        value={note}
        placeholder="note (facultative)"
        aria-label="Note"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note.trim() !== (valeur?.note ?? "") && valider()}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}
