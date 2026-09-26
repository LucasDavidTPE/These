/**
 * Accueil (SPEC §5) : une carte par module, la liste « À régler », le bilan du poste.
 * Remplace le panneau Java du hub. « Cette semaine » arrivera avec le Planning (P4).
 */
import { useEffect, useState } from "react";
import { Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { ARegler } from "./ARegler";

function CarteModule({ m }: { m: Manifeste }) {
  const ctx = useContexte();
  const [etat, setEtat] = useState<string | null>(null);
  const { revision } = ctx;

  useEffect(() => {
    if (!m.etat) return;
    let annule = false;
    m.etat(ctx)
      .then((e) => !annule && setEtat(e))
      .catch(() => !annule && setEtat(null));
    return () => {
      annule = true;
    };
    // Recalculé quand les fichiers changent, pas à chaque rendu du contexte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, revision]);

  return (
    <button type="button" className="carte-module" onClick={() => ctx.naviguer(m.id)}>
      <span className="carte-module-titre">
        <m.Icone />
        {m.titre}
        {m.aVenir ? (
          <span className="a-venir">
            <Pastille niveau="info">{m.aVenir}</Pastille>
          </span>
        ) : null}
      </span>
      <span className="discret">{m.resume}</span>
      {etat ? <span className="etat">{etat}</span> : null}
    </button>
  );
}

export function AccueilPage() {
  const ctx = useContexte();
  const autres = ctx.registre.manifestes.filter((m) => m.id !== "accueil");

  return (
    <Page
      titre="Accueil"
      sousTitre={
        <>
          Poste {ctx.poste}
          {ctx.espace ? (
            <>
              {" · espace "}
              <span className="chemin">{ctx.espace.racine}</span>
            </>
          ) : null}
        </>
      }
    >
      <Section titre="Modules">
        <div className="grille-cartes">
          {autres.map((m) => (
            <CarteModule key={m.id} m={m} />
          ))}
        </div>
      </Section>
      <ARegler />
    </Page>
  );
}
