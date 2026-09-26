/**
 * Premier lancement sur un poste (SPEC §4.1) : choisir le dossier OneDrive de l'espace.
 * Sur le premier PC on le crée ; sur le second, on rouvre le même dossier, déjà synchronisé.
 */
import { useEffect, useState } from "react";
import { isoAvecDecalage } from "@noyau/dates";
import { examinerEspace, initialiserEspace, type EtatEspace } from "@noyau/espace/espace";
import { espacePropose } from "@noyau/poste/reglages";
import { Message } from "@interface/composants";
import type { Plateforme } from "@interface/plateforme";

interface Props {
  plateforme: Plateforme;
  poste: string;
  nomProduit: string;
  /** Pourquoi on revient sur cet écran (espace introuvable…) ; null au tout premier lancement. */
  raison: string | null;
  onChoisi(espace: string): Promise<void>;
}

type Examen = { chemin: string; existe: boolean; etat: EtatEspace };

function dateLisible(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : ` le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
}

export function PremierLancement({ plateforme, poste, nomProduit, raison, onChoisi }: Props) {
  const [propositions, setPropositions] = useState<string[]>([]);
  const [examen, setExamen] = useState<Examen | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function examiner(chemin: string) {
    setErreur(null);
    try {
      const existe = await plateforme.dossierExiste(chemin);
      const etat: EtatEspace = existe ? await examinerEspace(plateforme.fichiers(chemin)) : { etat: "vide" };
      setExamen({ chemin, existe, etat });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    plateforme
      .dossiersOneDrive()
      .then((d) => {
        const p = d.map(espacePropose);
        setPropositions(p);
        if (p[0]) return examiner(p[0]);
      })
      .catch(() => setPropositions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, au montage
  }, [plateforme]);

  async function autre() {
    const choisi = await plateforme.choisirDossier("Dossier de l'espace Thèse", examen?.chemin);
    if (choisi) await examiner(choisi);
  }

  async function valider(creer: boolean) {
    if (!examen) return;
    setOccupe(true);
    setErreur(null);
    try {
      if (creer) {
        if (!examen.existe) await plateforme.creerDossier(examen.chemin);
        await initialiserEspace(plateforme.fichiers(examen.chemin), poste, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()));
      }
      await onChoisi(examen.chemin);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setOccupe(false);
    }
  }

  const choix = [...new Set([...propositions, ...(examen ? [examen.chemin] : [])])];

  return (
    <main className="accueil-installation">
      <h1>{nomProduit}</h1>
      <p className="discret">Premier lancement sur le poste {poste}.</p>
      {raison ? <Message niveau="attention">{raison}</Message> : null}
      <p>
        Tout ce que vous saisissez dans l'application (références, planning, fiches de campagne, notes) vit dans un dossier <strong>OneDrive</strong>,
        l'<strong>espace</strong>, partagé entre vos deux PC. Sur le second PC, choisissez le même dossier une fois OneDrive synchronisé.
      </p>

      <div className="choix-dossier" role="radiogroup" aria-label="Dossier de l'espace">
        {choix.map((c) => (
          <label key={c} className="option">
            <input type="radio" name="espace" checked={examen?.chemin === c} onChange={() => void examiner(c)} />
            <span className="chemin">{c}</span>
          </label>
        ))}
        <div>
          <button type="button" onClick={() => void autre()}>
            Choisir un autre dossier…
          </button>
        </div>
      </div>

      {examen ? <Verdict examen={examen} occupe={occupe} onValider={(creer) => void valider(creer)} /> : null}
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
    </main>
  );
}

function Verdict({ examen, occupe, onValider }: { examen: Examen; occupe: boolean; onValider(creer: boolean): void }) {
  const { etat } = examen;
  switch (etat.etat) {
    case "ok":
      return (
        <>
          <Message niveau="info">
            Un espace existe déjà ici{etat.info.creePar ? `, créé sur ${etat.info.creePar}` : ""}
            {dateLisible(etat.info.cree)}. C'est le bon choix pour votre second PC.
          </Message>
          <button type="button" className="principal" disabled={occupe} onClick={() => onValider(false)}>
            Ouvrir cet espace
          </button>
        </>
      );
    case "vide":
      return (
        <>
          <p className="discret">{examen.existe ? "Dossier vide." : "Ce dossier n'existe pas encore : il sera créé."}</p>
          <button type="button" className="principal" disabled={occupe} onClick={() => onValider(true)}>
            Créer l'espace ici
          </button>
        </>
      );
    case "autre-contenu":
      return (
        <>
          <Message niveau="attention">
            Ce dossier contient déjà d'autres fichiers ({etat.exemples.join(", ")}…) mais pas d'espace. Mieux vaut un dossier dédié ; vous pouvez
            toutefois y créer l'espace, rien d'existant ne sera modifié.
          </Message>
          <button type="button" disabled={occupe} onClick={() => onValider(true)}>
            Créer l'espace quand même
          </button>
        </>
      );
    case "trop-recent":
      return (
        <Message niveau="erreur">
          Cet espace a été créé par une version plus récente de l'application (format {etat.format}). Installez la dernière version sur ce poste.
        </Message>
      );
    case "illisible":
      return <Message niveau="erreur">Le fichier espace.json de ce dossier est illisible : {etat.detail}</Message>;
  }
}
