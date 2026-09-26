/**
 * Démarrage : lit les réglages du poste, vérifie l'espace, puis affiche soit l'écran de
 * premier lancement, soit la coquille.
 */
import { useCallback, useEffect, useState } from "react";
import { produit, manifestes } from "virtual:these-produit";
import { examinerEspace } from "@noyau/espace/espace";
import { ecrireReglages, lireReglages, type ReglagesPoste } from "@noyau/poste/reglages";
import { Message } from "@interface/composants";
import type { Plateforme } from "@interface/plateforme";
import { Coquille } from "./Coquille";
import { PremierLancement } from "./PremierLancement";
import { plateforme as choisirPlateforme } from "./platform/choisir";

type Etat =
  | { phase: "chargement" }
  | { phase: "erreur"; message: string }
  | { phase: "installation"; plateforme: Plateforme; poste: string; reglages: ReglagesPoste; raison: string | null }
  | { phase: "pret"; plateforme: Plateforme; poste: string; reglages: ReglagesPoste };

/** L'espace des réglages est-il utilisable ? Sinon, pourquoi (affiché sur l'écran d'installation). */
async function verifierEspace(p: Plateforme, r: ReglagesPoste): Promise<string | null> {
  if (!produit.espace) return null;
  if (!r.espace) return "";
  if (!(await p.dossierExiste(r.espace))) {
    return `L'espace ${r.espace} est introuvable sur ce poste (OneDrive pas encore synchronisé, ou dossier déplacé). Choisissez-le de nouveau.`;
  }
  const etat = await examinerEspace(p.fichiers(r.espace));
  switch (etat.etat) {
    case "ok":
      return null;
    case "trop-recent":
      return `L'espace a été créé par une version plus récente de l'application (format ${etat.format}). Mettez l'application à jour sur ce poste.`;
    case "illisible":
      return `Le fichier espace.json est illisible : ${etat.detail}`;
    default:
      return `Le dossier ${r.espace} ne contient plus d'espace (espace.json absent).`;
  }
}

export function App() {
  const [etat, setEtat] = useState<Etat>({ phase: "chargement" });

  const evaluer = useCallback(async (p: Plateforme, poste: string, reglages: ReglagesPoste) => {
    const raison = await verifierEspace(p, reglages);
    setEtat(raison === null ? { phase: "pret", plateforme: p, poste, reglages } : { phase: "installation", plateforme: p, poste, reglages, raison: raison || null });
  }, []);

  useEffect(() => {
    let annule = false;
    (async () => {
      const p = await choisirPlateforme();
      const [poste, texte] = await Promise.all([p.nomDuPoste(), p.lireReglages()]);
      if (!annule) await evaluer(p, poste, lireReglages(texte));
    })().catch((e: unknown) => setEtat({ phase: "erreur", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      annule = true;
    };
  }, [evaluer]);

  const enregistrer = useCallback(
    async (p: Plateforme, poste: string, r: ReglagesPoste) => {
      await p.ecrireReglages(ecrireReglages(r));
      await evaluer(p, poste, r);
    },
    [evaluer],
  );

  switch (etat.phase) {
    case "chargement":
      return <div className="accueil-installation discret">Chargement…</div>;
    case "erreur":
      return (
        <div className="accueil-installation">
          <Message niveau="erreur">Démarrage impossible : {etat.message}</Message>
        </div>
      );
    case "installation":
      return (
        <PremierLancement
          plateforme={etat.plateforme}
          poste={etat.poste}
          raison={etat.raison}
          nomProduit={produit.nom}
          onChoisi={(espace) => enregistrer(etat.plateforme, etat.poste, { ...etat.reglages, espace })}
        />
      );
    case "pret":
      return (
        <Coquille
          produit={produit}
          manifestes={manifestes}
          plateforme={etat.plateforme}
          poste={etat.poste}
          reglages={etat.reglages}
          enregistrerReglages={(r) => enregistrer(etat.plateforme, etat.poste, r)}
        />
      );
  }
}
