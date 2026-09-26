/**
 * Mise à jour (docs/MISES_A_JOUR.md) : au démarrage, l'application demande à GitHub si une
 * version plus récente est publiée. Si oui, un bandeau propose de l'installer ; rien n'est
 * installé sans clic. Hors ligne, rien ne s'affiche.
 */
import { useEffect, useState } from "react";
import type { MiseAJour, Plateforme } from "@interface/plateforme";

export function BandeauMiseAJour({ plateforme, version }: { plateforme: Plateforme; version: string }) {
  const [maj, setMaj] = useState<MiseAJour | null>(null);
  const [masque, setMasque] = useState(false);
  const [etat, setEtat] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    plateforme
      .verifierMiseAJour()
      .then((m) => !annule && setMaj(m))
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [plateforme]);

  if (!maj || masque) return null;
  const installer = async () => {
    setEtat("Téléchargement…");
    try {
      await maj.installer((f) => setEtat(f === null ? "Téléchargement…" : `Téléchargement… ${Math.round(f * 100)} %`));
    } catch (e) {
      setEtat(`Échec de la mise à jour : ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return (
    <div className="bandeau-maj" role="status">
      <span>
        <strong>Thèse {maj.version}</strong> est disponible (vous avez {version}).{maj.notes ? ` ${maj.notes.split("\n")[0]}` : ""}
      </span>
      {etat ? (
        <span>{etat}</span>
      ) : (
        <>
          <button type="button" className="principal" onClick={() => void installer()}>
            Installer et redémarrer
          </button>
          <button type="button" onClick={() => setMasque(true)}>
            Plus tard
          </button>
        </>
      )}
    </div>
  );
}
