/**
 * Diagnostic du poste (SPEC §5) : le premier réflexe sur un PC neuf, ou quand quelque chose
 * ne s'ouvre plus.
 */
import { useEffect, useState } from "react";
import type { MiseAJour } from "@interface/plateforme";
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
      {produit.id === "these" ? <VerifierMiseAJour /> : null}
    </Page>
  );
}

const PAGE_VERSIONS = "https://github.com/LucasDavidTPE/These-versions/releases/latest";

/**
 * Vérification de mise à jour à la demande. Au démarrage, une erreur (hors ligne, proxy, pare-feu) est tue ;
 * ici elle s'affiche telle quelle, avec le lien pour installer à la main.
 */
function VerifierMiseAJour() {
  const { plateforme, version } = useContexte();
  const [etat, setEtat] = useState<{ quoi: "attente" } | { quoi: "a-jour" } | { quoi: "dispo"; maj: MiseAJour } | { quoi: "erreur"; message: string } | { quoi: "installe"; texte: string } | null>(null);
  async function verifier() {
    setEtat({ quoi: "attente" });
    try {
      const maj = await plateforme.verifierMiseAJour();
      setEtat(maj ? { quoi: "dispo", maj } : { quoi: "a-jour" });
    } catch (e) {
      setEtat({ quoi: "erreur", message: e instanceof Error ? e.message : String(e) });
    }
  }
  async function installer(maj: MiseAJour) {
    try {
      await maj.installer((f) => setEtat({ quoi: "installe", texte: f === null ? "Téléchargement…" : `Téléchargement… ${Math.round(f * 100)} %` }));
    } catch (e) {
      setEtat({ quoi: "erreur", message: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <section className="carte">
      <h3>Mises à jour</h3>
      <p>
        Version installée : <strong>{version}</strong>. L'application consulte GitHub au démarrage ; si rien n'est proposé alors qu'une version est
        publiée, la vérification ci-dessous dit pourquoi (réseau, proxy, pare-feu…).
      </p>
      <div className="rangee">
        <button type="button" onClick={() => void verifier()} disabled={etat?.quoi === "attente" || etat?.quoi === "installe"}>
          Vérifier maintenant
        </button>
        <button type="button" onClick={() => void plateforme.ouvrirLien(PAGE_VERSIONS)} title="Ouvre la page des versions dans le navigateur">
          Télécharger l'installeur à la main…
        </button>
      </div>
      {etat?.quoi === "attente" ? <p className="discret">Interrogation de GitHub…</p> : null}
      {etat?.quoi === "a-jour" ? <p>Aucune version plus récente que {version} n'est publiée.</p> : null}
      {etat?.quoi === "dispo" ? (
        <p>
          <strong>Thèse {etat.maj.version}</strong> est disponible.{" "}
          <button type="button" className="principal" onClick={() => void installer(etat.maj)}>
            Installer et redémarrer
          </button>
        </p>
      ) : null}
      {etat?.quoi === "installe" ? <p>{etat.texte}</p> : null}
      {etat?.quoi === "erreur" ? (
        <p>
          <Pastille niveau="erreur" /> La vérification a échoué : <code>{etat.message}</code>. Le navigateur passe souvent là où l'application est
          bloquée (proxy de l'établissement) : « Télécharger l'installeur à la main », puis lancer le fichier <code>Thèse_x.y.z_x64-setup.exe</code>
          (les données ne sont pas touchées).
        </p>
      ) : null}
    </section>
  );
}
