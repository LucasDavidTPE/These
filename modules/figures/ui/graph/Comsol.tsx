/** Rappel, dans la page Graphes, que les exports COMSOL se traitent dans l'atelier dédié (onglet COMSOL). */
import { useNavigation } from "../navigation";
import { useAtelier } from "../comsol/useAtelier";

export function Comsol() {
  const n = useAtelier((s) => s.exports.length);
  return (
    <section className="comsol-panneau">
      <h3>Exports COMSOL</h3>
      <p className="muted small">Profils, cartes de coupes, signaux dans le temps, comparaisons de cas, tableau de synthèse : dans l'atelier COMSOL, pas à pas et avec un aperçu.</p>
      <button type="button" className="primary" onClick={() => useNavigation.getState().goTo("comsol")}>
        Ouvrir l'atelier COMSOL{n ? ` (${n} fichier${n > 1 ? "s" : ""})` : ""}
      </button>
    </section>
  );
}
