/**
 * Diagnostic du poste (SPEC §5) : le premier réflexe sur un PC neuf, ou quand quelque chose
 * ne s'ouvre plus.
 */
import { useEffect, useState } from "react";
import { diagnostiquer, niveauGlobal, type Controle } from "@noyau/diagnostic";
import { examinerEspace } from "@noyau/espace/espace";
import { Page, Pastille } from "@interface/composants";
import { useContexte } from "@interface/contexte";

export function DiagnosticPage() {
  const ctx = useContexte();
  const { plateforme, reglages, produit, poste, version, problemes } = ctx;
  const [controles, setControles] = useState<Controle[] | null>(null);

  const [essai, setEssai] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      let etat = null;
      if (reglages.espace && (await plateforme.dossierExiste(reglages.espace))) {
        etat = await examinerEspace(plateforme.fichiers(reglages.espace)).catch(() => null);
      }
      const racines = await Promise.all(
        Object.entries(reglages.racines).map(async ([nom, chemin]) => ({ nom, chemin, existe: await plateforme.dossierExiste(chemin) })),
      );
      const out = diagnostiquer({
        produit: produit.nom,
        version,
        poste,
        espace: produit.espace ? { chemin: reglages.espace, etat } : null,
        racines,
        aRegler: problemes.length,
      });
      if (!annule) setControles(out);
    })();
    return () => {
      annule = true;
    };
  }, [plateforme, reglages, produit, poste, version, problemes.length, essai]);

  return (
    <Page
      titre="Diagnostic"
      sousTitre="Ce qui est en place sur ce poste, et ce qui manque."
      actions={
        <button type="button" onClick={() => setEssai((n) => n + 1)}>
          Relancer
        </button>
      }
    >
      {controles ? (
        <>
          <p>
            Bilan : <Pastille niveau={niveauGlobal(controles)} />
          </p>
          <ul className="liste">
            {controles.map((c) => (
              <li key={c.titre} className="ligne-controle">
                <strong>{c.titre}</strong>
                <span className={c.niveau === "info" ? "discret" : undefined}>{c.detail}</span>
                <Pastille niveau={c.niveau} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="discret">Vérification…</p>
      )}
    </Page>
  );
}
