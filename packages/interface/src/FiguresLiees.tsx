/**
 * Les figures d'une campagne ou d'une étude, dans sa page : celles qui en sont issues
 * (courbes d'un essai, traitement 2S2P1D) et celles rattachées à la main. Passe par les
 * actions du module Figures ; rien ne s'affiche s'il n'est pas dans l'installeur.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { correspond } from "@noyau/texte";
import { useContexte } from "./contexte";

export interface CibleFigures {
  type: "campagne" | "etude";
  id: string;
  titre: string;
}

interface Liee {
  dossier: string;
  id: string;
  titre: string;
  lien: "origine" | "manuel";
  image: Uint8Array | null;
  type: string;
}

/** Vignette en URL « data: » : rien à révoquer (une URL blob le serait trop tôt au démontage). */
function enDataUrl(octets: Uint8Array, type: string): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binaire)}`;
}

function Vignette({ f }: { f: Liee }) {
  const url = useMemo(() => (f.image ? enDataUrl(f.image, f.type) : null), [f.image, f.type]);
  return url ? <img src={url} alt="" /> : <span className="discret petit">pas d'aperçu</span>;
}

export function FiguresLiees({ cible }: { cible: CibleFigures }) {
  const ctx = useContexte();
  const [liste, setListe] = useState<Liee[] | null>(null);
  const [choix, setChoix] = useState<{ dossier: string; id: string; titre: string }[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [tour, setTour] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const disponible = ctx.registre.aAction("figures.liste");

  useEffect(() => {
    if (!disponible) return;
    let annule = false;
    ctx.registre
      .executer("figures.liste", { ctx, cible })
      .then((l) => !annule && setListe(l as Liee[]))
      .catch((e: unknown) => !annule && setErreur(e instanceof Error ? e.message : String(e)));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disponible, cible.type, cible.id, tour, ctx.revision]);

  const agir = useCallback(
    async (action: string, dossier: string) => {
      try {
        await ctx.registre.executer(action, { ctx, dossier, cible });
        setTour((t) => t + 1);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    },
    [ctx, cible],
  );

  if (!disponible) return null;
  const deja = new Set((liste ?? []).map((f) => f.dossier));
  return (
    <div className="figures-liees">
      {erreur ? <p className="erreur-texte">{erreur}</p> : null}
      {!ctx.reglages.figures ? (
        <p className="discret">Choisissez le dossier de la bibliothèque de figures dans les réglages du poste.</p>
      ) : liste === null ? (
        <p className="discret">Lecture de la bibliothèque…</p>
      ) : (
        <>
          {liste.length === 0 ? <p className="discret">Aucune figure : « Enregistrer dans Figures » depuis les courbes ou le traitement, ou rattachez-en une.</p> : null}
          <ul className="figures-liees-grille">
            {liste.map((f) => (
              <li key={f.dossier}>
                <button type="button" title="Ouvrir dans Figures" onClick={() => void ctx.registre.executer("figures.ouvrir", { ctx, dossier: f.dossier })}>
                  <Vignette f={f} />
                  <span className="figures-liees-titre">
                    {f.id} — {f.titre}
                  </span>
                </button>
                {f.lien === "manuel" ? (
                  <button type="button" className="lien petit" onClick={() => void agir("figures.detacher", f.dossier)}>
                    détacher
                  </button>
                ) : (
                  <span className="discret petit">issue de {cible.type === "campagne" ? "la campagne" : "l'étude"}</span>
                )}
              </li>
            ))}
          </ul>
          {choix === null ? (
            <button type="button" onClick={() => void ctx.registre.executer("figures.catalogue", ctx).then((c) => setChoix(c as typeof choix))}>
              Rattacher une figure…
            </button>
          ) : (
            <div className="carte figures-liees-choix">
              <div className="rangee">
                <input type="text" placeholder="Rechercher une figure (titre, identifiant)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus />
                <button type="button" onClick={() => setChoix(null)}>
                  Fermer
                </button>
              </div>
              <ul>
                {choix
                  .filter((c) => !deja.has(c.dossier) && correspond(`${c.id} ${c.titre}`, recherche))
                  .slice(0, 30)
                  .map((c) => (
                    <li key={c.dossier}>
                      <button type="button" className="lien" onClick={() => void agir("figures.rattacher", c.dossier)}>
                        {c.id} — {c.titre}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
