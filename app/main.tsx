// Le thème commun d'abord : les feuilles de style des modules, chargées ensuite, priment.
import "@interface/theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const racine = document.getElementById("root");
if (!racine) throw new Error("Élément #root introuvable dans index.html");

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
