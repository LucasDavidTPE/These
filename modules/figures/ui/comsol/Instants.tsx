/**
 * Exports à plusieurs instants (une colonne par grandeur et par instant) : choix de l'instant tracé — curseur,
 * lecture en boucle pour voir la carte évoluer — ou de l'enveloppe (maximum, minimum, plus grande valeur
 * absolue sur tous les instants). Le choix fait partie de la recette : la figure se régénère au même instant.
 */
import { useEffect, useRef, useState } from "react";
import {
  LIBELLES_ENVELOPPE,
  parametresDesExports,
  type Enveloppe,
  type ModeTrace,
  type Parametre,
  type Trace,
} from "../../core/graph";
import { useContexteTrace, useTrace } from "./hooks";

export function ChoixEtape({ mode }: { mode: Exclude<ModeTrace, "temps"> }) {
  const c = useContexteTrace();
  const [t, maj] = useTrace<Trace>(mode);
  const params = parametresDesExports(c.exports);
  if (!params.length) return null;
  return (
    <fieldset className="atelier-champ atelier-instants">
      <legend>Instant tracé (fichiers à plusieurs instants)</legend>
      {params.map((p) => (
        <Curseur
          key={p.nom}
          p={p}
          choix={t.etape?.[p.nom]}
          set={(ch) => maj({ etape: { ...(t.etape ?? {}), [p.nom]: ch } })}
        />
      ))}
    </fieldset>
  );
}

function Curseur({
  p,
  choix,
  set,
}: {
  p: Parametre;
  choix: { valeur: string } | { enveloppe: Enveloppe } | undefined;
  set: (ch: { valeur: string } | { enveloppe: Enveloppe }) => void;
}) {
  const [lecture, setLecture] = useState(false);
  const enveloppe = choix && "enveloppe" in choix ? choix.enveloppe : null;
  const k = Math.max(
    0,
    p.valeurs.findIndex(
      (v) => choix && "valeur" in choix && v.texte === choix.valeur,
    ),
  );
  // lecture en boucle : un instant toutes les 0,7 s (les autres rendus, sonde au survol…, ne relancent pas le minuteur)
  const suivant = p.valeurs[(k + 1) % p.valeurs.length]!.texte;
  const poser = useRef(set);
  useEffect(() => {
    poser.current = set;
  });
  useEffect(() => {
    if (!lecture || enveloppe) return;
    const id = window.setTimeout(() => poser.current({ valeur: suivant }), 700);
    return () => window.clearTimeout(id);
  }, [lecture, enveloppe, suivant]);
  const unite = p.unite ? ` ${p.unite}` : "";
  return (
    <div className="atelier-curseur">
      <select
        value={enveloppe ?? "instant"}
        onChange={(e) =>
          e.target.value === "instant"
            ? set({ valeur: p.valeurs[k]!.texte })
            : set({ enveloppe: e.target.value as Enveloppe })
        }
        aria-label={`Choix de ${p.nom}`}
      >
        <option value="instant">À un instant</option>
        {(["max", "min", "abs"] as const).map((x) => (
          <option key={x} value={x}>
            Enveloppe : {LIBELLES_ENVELOPPE[x]}
          </option>
        ))}
      </select>
      {enveloppe ? (
        <span className="muted small">
          sur les {p.valeurs.length} valeurs de {p.nom}, point par point
        </span>
      ) : (
        <>
          <button
            type="button"
            className="small-btn"
            onClick={() => setLecture(!lecture)}
            title={lecture ? "Arrêter" : "Faire défiler les instants"}
            aria-label={lecture ? "Arrêter" : "Lecture"}
          >
            {lecture ? "⏸" : "▶"}
          </button>
          <input
            type="range"
            min={0}
            max={p.valeurs.length - 1}
            step={1}
            value={k}
            onChange={(e) =>
              set({ valeur: p.valeurs[Number(e.target.value)]!.texte })
            }
            aria-label={p.nom}
          />
          <strong className="atelier-instant">
            {p.nom} = {p.valeurs[k]!.texte.replace(/\s.*$/, "")}
            {unite}
          </strong>
          <span className="muted small">
            ({k + 1} / {p.valeurs.length})
          </span>
        </>
      )}
    </div>
  );
}
