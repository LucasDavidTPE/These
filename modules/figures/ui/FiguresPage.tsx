/**
 * Le module Figures : Figurine 1.0, ses cinq pages en onglets. Le dossier de la
 * bibliothèque est celui des réglages du poste (champ `figures`), partagé avec la coquille.
 */
import { useEffect, useLayoutEffect } from "react";
import { useContexte } from "@interface/contexte";
import { parseSettings, serializeSettings } from "../core/settings";
import { AboutPage } from "./AboutPage";
import { CropPage } from "./crop/CropPage";
import { CutoutPage } from "./cutout/CutoutPage";
import { EditorPage } from "./editor/EditorPage";
import { GraphPage } from "./graph/GraphPage";
import { LibraryPage } from "./library/LibraryPage";
import { useLibrary } from "./library/useLibrary";
import { PAGES, useNavigation } from "./navigation";
import { brancherReglages } from "./platform/backend";
import "./styles.css";

export function FiguresPage() {
  const ctx = useContexte();
  const page = useNavigation((s) => s.page);
  const goTo = useNavigation((s) => s.goTo);

  // Les effets « layout » passent avant tous les effets ordinaires : le pont est donc
  // branché avant que la page Bibliothèque n'ouvre la bibliothèque (useLibrary.init).
  useLayoutEffect(() => {
    brancherReglages({
      lire: async () => serializeSettings({ version: 1, libraryRoot: ctx.reglages.figures }),
      ecrire: async (contenu) => ctx.enregistrerReglages({ ...ctx.reglages, figures: parseSettings(contenu).libraryRoot }),
    });
  }, [ctx]);

  // Dossier changé depuis les réglages du poste : la bibliothèque suit.
  const figures = ctx.reglages.figures;
  useEffect(() => {
    const s = useLibrary.getState();
    if (s.ready && figures && figures !== s.root) void s.setRoot(figures, false);
  }, [figures]);

  return (
    <div className="figures">
      <nav className="figures-onglets" aria-label="Figures">
        {[...PAGES, { id: "about" as const, label: "À propos" }].map((p) => (
          <button key={p.id} type="button" className={p.id === page ? "actif" : undefined} aria-current={p.id === page ? "page" : undefined} onClick={() => goTo(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>
      <div className="figures-contenu">
        {page === "library" ? (
          <LibraryPage />
        ) : page === "cutout" ? (
          <CutoutPage />
        ) : page === "schema" ? (
          <EditorPage />
        ) : page === "crop" ? (
          <CropPage />
        ) : page === "graphs" ? (
          <GraphPage />
        ) : (
          <AboutPage />
        )}
      </div>
    </div>
  );
}
