/**
 * Visite guidée de l'atelier COMSOL, sur le jeu d'exemple intégré : une étape par fonction, chacune avec ce qu'il
 * faut regarder et un bouton qui ouvre la bonne tuile, réglée sur les bons fichiers. Une bande compacte (une étape
 * à la fois, pastilles pour sauter) : la tuile ouverte reste visible en dessous.
 */
import { useState } from "react";
import {
  bassinExemple,
  mesureExemple,
  traceVide,
  type Trace,
} from "../../core/graph";
import { getBackend } from "../platform/backend";
import { chargerExemple } from "./exemple";
import { useAtelier } from "./useAtelier";

interface Etape {
  titre: string;
  quoi: string;
  faire: () => void;
  copier?: { libelle: string; texte: () => string };
}

const ouvrir = (
  t: Trace,
  autres: Partial<{
    ensemble: boolean;
    verifier: boolean;
    rapport: boolean;
  }> = {},
) => {
  const a = useAtelier.getState();
  a.majTrace(t.mode, t);
  // le rapport prend la place des tracés : on le referme pour montrer la tuile
  a.set({ mode: t.mode, ensemble: false, rapport: false, ...autres });
};

const ETAPES: Etape[] = [
  {
    titre: "Vue d'ensemble",
    quoi: "Toutes les coupes d'un coup, EL / VE × het / rect / circ, à la même échelle ; le pic sous chaque carte. Cliquez une carte pour l'ouvrir en grand.",
    faire: () => useAtelier.getState().set({ ensemble: true, rapport: false }),
  },
  {
    titre: "Carte et instants",
    quoi: "La charge roulante (9 instants) : glissez le curseur, ▶ pour l'animation, « Enveloppe » pour le pire cas. Survolez la carte (sonde EL / VE), cliquez pour épingler une valeur, « ∿ signal » sur l'épingle.",
    faire: () =>
      ouvrir({
        ...(traceVide("carte") as Extract<Trace, { mode: "carte" }>),
        plan: "coupeXZ_R1_VE-roulant_het.txt",
        expression: "1e6*solid.eZZ",
        isolignes: [-300, -200, -100],
      }),
  },
  {
    titre: "Profils sur un segment",
    quoi: "Cliquez deux points sur la petite carte (A puis B) : le profil le long du segment, en fonction de la distance depuis A.",
    faire: () =>
      ouvrir({
        ...(traceVide("coupe-profils") as Extract<
          Trace,
          { mode: "coupe-profils" }
        >),
        plan: "coupeXZ_R1_VE_het.txt",
        expression: "1e6*solid.eXX",
        sens: "segments",
      }),
  },
  {
    titre: "Critères de dimensionnement",
    quoi: "εt à la base de la BB et de la GB, εz au sommet du sol, cycles admissibles ; saisissez un trafic (2e6) pour le dommage. Le critère dimensionnant est surligné.",
    faire: () =>
      ouvrir({
        ...(traceVide("criteres") as Extract<Trace, { mode: "criteres" }>),
        trafic: 2e6,
      }),
  },
  {
    titre: "Bassin de déflexion",
    quoi: "D0, SCI, BDI, BCI, AREA, rayon de courbure. Copiez le bassin HWD d'exemple, collez-le dans « Bassin mesuré », « Utiliser » : écart RMS au calcul.",
    faire: () =>
      ouvrir({
        ...(traceVide("bassin") as Extract<Trace, { mode: "bassin" }>),
        fichiers: ["surface_EL_het.txt", "surface_VE_het.txt"],
      }),
    copier: { libelle: "Copier le bassin HWD d'exemple", texte: bassinExemple },
  },
  {
    titre: "Signal et jauge",
    quoi: "εxx à la base de la GB au passage de la roue. Copiez la mesure de jauge d'exemple, collez-la dans « Mesures superposées », « Ajouter », puis « Recaler les pics ».",
    faire: () => ouvrir(traceVide("temps")),
    copier: {
      libelle: "Copier la mesure de jauge d'exemple",
      texte: mesureExemple,
    },
  },
  {
    titre: "Convergence du maillage",
    quoi: "La paire EL / EL-fin est trouvée d'après les noms : écart sur le pic, pire point, norme L2, verdict.",
    faire: () => ouvrir(traceVide("maillage")),
  },
  {
    titre: "Sensibilité",
    quoi: "Le module de la GB varie d'un fichier à l'autre (E_GB = 9 000, 11 000, 13 000 MPa) : le pic de εxx en fonction de E_GB.",
    faire: () =>
      ouvrir({
        ...(traceVide("sensibilite") as Extract<
          Trace,
          { mode: "sensibilite" }
        >),
        source: "fichiers",
        parametre: "E_GB",
        expression: "1e6*solid.eXX",
        statistique: "max",
      }),
  },
  {
    titre: "Vérifier, Excel, rapport",
    quoi: "« Vérifier » (liste des fichiers), « Excel… » sous chaque aperçu, et le premier jet de la partie résultats, en LaTeX ou en Word (.docx).",
    faire: () => useAtelier.getState().set({ verifier: true, rapport: true }),
  },
];

export function VisiteGuidee() {
  const exports = useAtelier((s) => s.exports);
  const [courante, setCourante] = useState(0);
  const [faites, setFaites] = useState<number[]>([]);
  const [copie, setCopie] = useState<string | null>(null);
  const exemple = exports.some(
    (e) => e.nom === "coupeXZ_R1_VE-roulant_het.txt",
  );
  const e = ETAPES[courante]!;
  // aller à une étape l'ouvre aussitôt (une fois l'exemple chargé)
  const aller = (i: number) => {
    setCourante(i);
    if (!exemple) return;
    ETAPES[i]!.faire();
    setFaites((f) => [...new Set([...f, i])]);
  };
  return (
    <div className="atelier-visite" role="region" aria-label="Visite guidée">
      <div className="atelier-visite-tete">
        <strong>Visite guidée</strong>
        <ol className="atelier-visite-pastilles">
          {ETAPES.map((x, i) => (
            <li key={x.titre}>
              <button
                type="button"
                className={`${i === courante ? "actif" : ""}${faites.includes(i) ? " faite" : ""}`}
                aria-current={i === courante ? "step" : undefined}
                title={x.titre}
                onClick={() => aller(i)}
              >
                {faites.includes(i) && i !== courante ? "✓" : i + 1}
              </button>
            </li>
          ))}
        </ol>
        <span className="muted small">
          jeu d'exemple : fichiers synthétiques au format COMSOL
        </span>
        <span className="grow" />
        <button
          type="button"
          className="small-btn"
          onClick={() => useAtelier.getState().set({ visite: false })}
        >
          Fermer
        </button>
      </div>
      <div className="atelier-visite-etape">
        <div className="atelier-visite-texte">
          <strong>
            {courante + 1}. {e.titre}
          </strong>{" "}
          <span className="small">{e.quoi}</span>
        </div>
        <div className="rangee-boutons">
          {!exemple ? (
            <button type="button" className="primary" onClick={chargerExemple}>
              Charger le jeu d'exemple
            </button>
          ) : (
            <>
              <button
                type="button"
                className="small-btn"
                disabled={courante === 0}
                onClick={() => aller(courante - 1)}
                title="Étape précédente"
              >
                ◀
              </button>
              <button
                type="button"
                className="small-btn primary"
                onClick={() => aller(courante)}
              >
                Essayer →
              </button>
              <button
                type="button"
                className="small-btn"
                disabled={courante === ETAPES.length - 1}
                onClick={() => aller(courante + 1)}
                title="Étape suivante (l'ouvre aussitôt)"
              >
                Suivante ▶
              </button>
            </>
          )}
          {e.copier ? (
            <button
              type="button"
              className="small-btn"
              onClick={() =>
                void getBackend()
                  .then((b) => b.copyText(e.copier!.texte()))
                  .then(() => setCopie(e.titre))
              }
            >
              {copie === e.titre ? "Copié ✓" : e.copier.libelle}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
