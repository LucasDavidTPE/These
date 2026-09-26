/**
 * Module Traitement 2S2P1D. La page de dépouillement (lucasdavid47/2S2P1D-traitement) est
 * reprise telle quelle dans `statique/` : mêmes calculs, mêmes tests de conformité à la
 * chaîne Excel. L'application l'ouvre directement sur l'essai d'une campagne et enregistre
 * le dépouillement (tri des cycles, calages) avec l'essai, dans l'espace.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Introuvable, parent } from "@noyau/stockage";
import { useContexte } from "@interface/contexte";
import { prendre, surDemande, type DemandeEssai } from "./demande";

interface Pont {
  ouvrir(fichiers: File[], projet: string | null): Promise<void>;
  projet(): string;
}

declare global {
  interface Window {
    /** Appelé par la page intégrée (main.js, fonction `enregistrer`). */
    theseEnregistrer?: (nom: string, blob: Blob) => Promise<boolean>;
    /** Appelé par la page intégrée quand elle a fini de démarrer. */
    theseTraitementPret?: () => void;
  }
}

export function TraitementPage() {
  const ctx = useContexte();
  const { plateforme } = ctx;
  const cadre = useRef<HTMLIFrameElement>(null);
  const [pret, setPret] = useState(false);
  const [essai, setEssai] = useState<DemandeEssai | null>(null);
  const [etat, setEtat] = useState<{ niveau: "info" | "erreur"; texte: string } | null>(null);

  useEffect(() => {
    window.theseEnregistrer = async (nom, blob) => plateforme.enregistrerSous(nom, new Uint8Array(await blob.arrayBuffer()));
    window.theseTraitementPret = () => setPret(true);
    return () => {
      delete window.theseEnregistrer;
      delete window.theseTraitementPret;
    };
  }, [plateforme]);

  const pont = () => (cadre.current?.contentWindow as (Window & { theseTraitement?: Pont }) | null)?.theseTraitement;

  const ouvrir = useCallback(
    async (d: DemandeEssai) => {
      const p = pont();
      if (!p || !ctx.espace) return;
      setEssai(d);
      setEtat({ niveau: "info", texte: `Lecture de ${d.fichier}…` });
      try {
        const octets = await plateforme.fichiers(d.dossierDonnees).readBytes(d.fichier);
        let projet: string | null = null;
        try {
          projet = await ctx.espace.fichiers.readText(d.projet);
        } catch (e) {
          if (!(e instanceof Introuvable) && (e as { code?: string }).code !== "not-found") throw e;
        }
        await p.ouvrir([new File([octets as BlobPart], d.fichier)], projet);
        setEtat({ niveau: "info", texte: projet ? "Dépouillement enregistré rouvert." : "Nouveau dépouillement : enregistrez-le avec l'essai quand il vous convient." });
      } catch (e) {
        setEtat({ niveau: "erreur", texte: `Ouverture impossible : ${e instanceof Error ? e.message : String(e)}` });
      }
    },
    [ctx.espace, plateforme],
  );

  // Essai demandé avant l'ouverture du module, ou pendant qu'il est affiché.
  useEffect(() => {
    if (!pret) return;
    const d = prendre();
    // Hors du corps de l'effet : l'ouverture met à jour l'état de la page.
    if (d) void Promise.resolve().then(() => ouvrir(d));
    return surDemande((x) => void ouvrir(x));
  }, [pret, ouvrir]);

  async function enregistrerDansEssai() {
    const p = pont();
    if (!p || !essai || !ctx.espace) return;
    try {
      await ctx.espace.fichiers.ensureDir(parent(essai.projet));
      await ctx.espace.fichiers.writeTextAtomic(essai.projet, p.projet());
      setEtat({ niveau: "info", texte: `Dépouillement enregistré avec l'essai (${new Date().toLocaleTimeString("fr-FR")}).` });
    } catch (e) {
      setEtat({ niveau: "erreur", texte: `Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return (
    <div className="traitement">
      {essai ? (
        <div className={`traitement-barre ${etat?.niveau === "erreur" ? "erreur" : ""}`}>
          <strong>{essai.titre}</strong>
          <span className="discret">{etat?.texte}</span>
          <button type="button" className="principal" onClick={() => void enregistrerDansEssai()}>
            Enregistrer avec l'essai
          </button>
          {ctx.registre.aModule("campagnes") ? (
            <button type="button" onClick={() => ctx.naviguer("campagnes")}>
              ← Campagne
            </button>
          ) : null}
        </div>
      ) : null}
      <iframe ref={cadre} className="traitement-page" title="Traitement 2S2P1D" src="/statique/traitement/index.html" />
    </div>
  );
}
