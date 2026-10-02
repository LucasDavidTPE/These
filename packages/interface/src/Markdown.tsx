/** Rendu du petit Markdown des cartes (noyau/markdown) en éléments React ; jamais de HTML injecté. */
import { Fragment, useEffect, useMemo, useState } from "react";
import { citationAuteurAnnee, clesCitees, remplacerCitations, type ReferenceCitee } from "@noyau/citations";
import { analyserMarkdown, type EnLigne } from "@noyau/markdown";
import { resoudreCitations } from "./citations";
import { useContexte } from "./contexte";

function Ligne({ contenu, refs }: { contenu: EnLigne[]; refs: ReadonlyMap<string, ReferenceCitee> | null }) {
  const ctx = useContexte();
  return (
    <>
      {contenu.map((e, i) => {
        if (e.type === "code") return <code key={i}>{e.texte}</code>;
        if (e.type === "lien")
          return (
            <button key={i} type="button" className="lien" title={e.url} onClick={() => void ctx.plateforme.ouvrirLien(e.url)}>
              {e.texte}
            </button>
          );
        if (e.type === "cite") {
          const rendu = refs ? remplacerCitations(e.brut, (c) => citationAuteurAnnee(c, refs)) : e.brut;
          return (
            <span key={i} className={rendu === e.brut ? undefined : "citation"} title={rendu === e.brut ? undefined : clesCitees(e.brut).map((k) => refs?.get(k)?.complete ?? k).join("\n")}>
              {rendu}
            </span>
          );
        }
        const t = e.gras ? <strong>{e.texte}</strong> : e.italique ? <em>{e.texte}</em> : e.texte;
        return <Fragment key={i}>{t}</Fragment>;
      })}
    </>
  );
}

/** `basculer` : rend les cases `- [ ]` cliquables (numéro de ligne dans le texte) ; sans lui, elles sont en lecture seule. */
export function Markdown({ texte, basculer }: { texte: string; basculer?: (ligne: number) => void }) {
  const ctx = useContexte();
  const blocs = useMemo(() => analyserMarkdown(texte), [texte]);
  const cles = clesCitees(texte).join(",");
  const [refs, setRefs] = useState<ReadonlyMap<string, ReferenceCitee> | null>(null);
  useEffect(() => {
    if (!cles) return;
    let annule = false;
    void resoudreCitations(ctx, cles.split(","))
      .then((r) => !annule && setRefs(r.actives ? r.refs : null))
      .catch(() => !annule && setRefs(null));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cles, ctx.revision]);
  return (
    <div className="markdown">
      {blocs.map((b, i) =>
        b.type === "titre" ? (
          b.niveau === 2 ? (
            <h4 key={i}>
              <Ligne contenu={b.contenu} refs={refs} />
            </h4>
          ) : (
            <h5 key={i}>
              <Ligne contenu={b.contenu} refs={refs} />
            </h5>
          )
        ) : b.type === "paragraphe" ? (
          <p key={i}>
            <Ligne contenu={b.contenu} refs={refs} />
          </p>
        ) : b.ordonnee ? (
          <ol key={i}>
            {b.elements.map((l, j) => (
              <li key={j}>
                <Ligne contenu={l} refs={refs} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className={b.taches.some((t) => t !== null) ? "taches" : undefined}>
            {b.elements.map((l, j) => (
              <li key={j} className={b.taches[j] ? "fait" : undefined}>
                {b.taches[j] !== null ? (
                  <label>
                    <input type="checkbox" checked={!!b.taches[j]} disabled={!basculer} onChange={() => basculer?.(b.lignes[j]!)} /> <Ligne contenu={l} refs={refs} />
                  </label>
                ) : (
                  <Ligne contenu={l} refs={refs} />
                )}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
