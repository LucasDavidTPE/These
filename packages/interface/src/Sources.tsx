/** Ligne « Sources : … » vers la Bibliothèque (rien si les citations sont coupées ou introuvables). */
import { useEffect, useState } from "react";
import type { ReferenceCitee } from "@noyau/citations";
import { resoudreCitations } from "./citations";
import { useContexte } from "./contexte";

/** « Sources : Burmister (1945) · Chupin et al. (2010) », chaque nom ouvrant sa fiche. */
export function Sources({ cles }: { cles: readonly string[] }) {
  const ctx = useContexte();
  const [refs, setRefs] = useState<ReferenceCitee[]>([]);
  const cle = cles.join(",");
  useEffect(() => {
    let annule = false;
    void resoudreCitations(ctx, cle.split(","))
      .then((r) => !annule && setRefs(r.actives ? [...new Map([...r.refs.values()].map((x) => [x.id, x])).values()] : []))
      .catch(() => !annule && setRefs([]));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, ctx.revision]);
  if (!refs.length) return null;
  return (
    <p className="discret petit sources">
      Sources :{" "}
      {refs.map((r, i) => (
        <span key={r.id}>
          {i ? " · " : ""}
          <button type="button" className="lien" title={r.complete} onClick={() => void ctx.registre.executer("bibliotheque.ouvrir", { ctx, id: r.id })}>
            {r.auteurs} ({r.annee || "s. d."})
          </button>
        </span>
      ))}
    </p>
  );
}
