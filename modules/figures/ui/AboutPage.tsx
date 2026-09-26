import { useState } from "react";
import { THEME_THESE, generateSty } from "../core/schema";
import { getBackend } from "./platform/backend";

/** Composants tiers embarqués et leurs licences (détail : docs/LICENCES.md). */
const THIRD_PARTY: { name: string; license: string; note: string }[] = [
  { name: "Modèle IS-Net (DIS, Qin et al., 2022)", license: "Apache-2.0", note: "détourage ; conversion ONNX par rembg (MIT)" },
  { name: "ONNX Runtime 1.28 (Microsoft)", license: "MIT", note: "exécution locale du modèle de détourage" },
  { name: "MathJax 3", license: "Apache-2.0", note: "maths $…$ converties en tracés SVG" },
  { name: "Tauri 2", license: "Apache-2.0 / MIT", note: "application de bureau" },
  { name: "React, Zustand, fflate", license: "MIT", note: "interface, état, lecture des .xlsx" },
  { name: "image, chrono, serde, ort (Rust)", license: "MIT / Apache-2.0", note: "images, dates, JSON, ONNX Runtime" },
  { name: "clipboard-win", license: "BSL-1.0", note: "presse-papier Windows" },
];

/** « À propos » : version, figurine.sty, licences. */
export function AboutPage() {
  const [message, setMessage] = useState("");
  const sty = generateSty(THEME_THESE);

  const copySty = async () => {
    await (await getBackend()).copyText(sty);
    setMessage("figurine.sty copié dans le presse-papier.");
  };
  const saveSty = async () => {
    if (await (await getBackend()).saveTextAs(sty, "figurine.sty", "sty")) setMessage("figurine.sty enregistré.");
  };

  return (
    <section className="page about">
      <h1>Figurine {__APP_VERSION__}</h1>
      <p>Atelier de figures scientifiques pour la mécanique des chaussées : schémas TikZ/SVG, détourage local, recadrage, graphes pgfplots, bibliothèque synchronisée par OneDrive.</p>

      <h2>Utiliser les exports dans LaTeX</h2>
      <p>
        Les exports TikZ et pgfplots s'appuient sur le paquet <code>figurine.sty</code> : placez-le à côté du document
        principal (ou dans votre arbre TeX) et ajoutez <code>\usepackage{"{figurine}"}</code> au préambule. Il charge TikZ
        (bibliothèques <code>patterns.meta</code>, <code>decorations.pathmorphing</code>, <code>arrows.meta</code>) et pgfplots.
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={copySty}>
          Copier figurine.sty
        </button>
        <button type="button" onClick={saveSty}>
          Enregistrer figurine.sty…
        </button>
      </div>
      {message && <p className="banner">{message}</p>}
      <p className="muted small">
        Dans le document : <code>\input{"{…/FIG-0007_structure/export.tex}"}</code> ; l'export est réécrit à chaque
        enregistrement de la figure.
      </p>

      <h2>Composants tiers</h2>
      <table className="data-preview about-table">
        <thead>
          <tr>
            <th>Composant</th>
            <th>Licence</th>
            <th>Rôle</th>
          </tr>
        </thead>
        <tbody>
          {THIRD_PARTY.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td>{t.license}</td>
              <td>{t.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Les textes complets des licences Apache-2.0 et MIT s'appliquent à ces composants ; la liste détaillée et
        vérifiée est dans <code>docs/LICENCES.md</code> du dépôt. Aucune donnée n'est envoyée sur Internet : le
        détourage, les maths et les exports sont calculés sur ce PC.
      </p>

      <h2>Raccourcis de l'éditeur</h2>
      <ul className="muted">
        <li>Ctrl+Z / Ctrl+Y : annuler / rétablir ; Ctrl+S : enregistrer</li>
        <li>Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D : copier, couper, coller, dupliquer ; Suppr : supprimer</li>
        <li>Flèches : déplacer (Maj : pas de 10) ; Ctrl+A : tout sélectionner ; Échap : désélectionner</li>
        <li>Molette : zoom ; Alt + glisser : déplacer la vue</li>
      </ul>
    </section>
  );
}
