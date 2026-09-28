/** Étalonnage des axes : quatre points à placer sur l'image et leurs valeurs. */
import { defauts } from "../core/etalonnage";
import { etalonnageDe } from "../core/projet";
import { useNumeriseur, type Outil } from "./etat";
import { Nombre } from "./Nombre";

export function PanneauAxes() {
  const s = useNumeriseur();
  const p = s.projet;
  const e = etalonnageDe(p);
  const pb = e ? defauts(e) : [];
  const manque = (["x1", "x2", "y1", "y2"] as const).filter((k) => !p.axes[k[0] as "x" | "y"][k[1] === "1" ? "p1" : "p2"]);
  return (
    <section className="nm-section">
      <h3>1. Étalonnage des axes</h3>
      {(["x", "y"] as const).map((a) => {
        const ax = p.axes[a];
        const bouton = (n: 1 | 2) => {
          const outil = `${a}${n}` as Outil;
          const place = ax[n === 1 ? "p1" : "p2"] !== null;
          return (
            <button type="button" className={`petit${s.outil === outil ? " actif" : ""}`} onClick={() => s.choisirOutil(s.outil === outil ? null : outil)} title={place ? "Replacer ce point (ou le faire glisser sur l'image)" : "Placer ce point sur l'image"}>
              {place ? "✓ " : ""}
              {a.toUpperCase()}
              {n}
            </button>
          );
        };
        return (
          <div key={a} className="nm-axe">
            <div className="rangee">
              {bouton(1)}
              <Nombre v={ax.v1} aria={`Valeur de ${a.toUpperCase()}1`} vide onChange={(v) => s.maj((q) => (q.axes[a].v1 = v))} />
              {bouton(2)}
              <Nombre v={ax.v2} aria={`Valeur de ${a.toUpperCase()}2`} vide onChange={(v) => s.maj((q) => (q.axes[a].v2 = v))} />
              <label className="nm-case">
                <input type="checkbox" checked={ax.log} onChange={(ev) => s.maj((q) => (q.axes[a].log = ev.target.checked))} /> log
              </label>
            </div>
            <input className="champ nm-titre-axe" value={ax.titre} aria-label={`Titre de l'axe des ${a}`} placeholder={`Titre de l'axe des ${a} (unité)`} onChange={(ev) => s.maj((q) => (q.axes[a].titre = ev.target.value))} />
          </div>
        );
      })}
      <p className={`petit ${pb.length ? "nm-alerte" : e ? "nm-ok" : "discret"}`}>
        {pb.length
          ? pb.join(" ")
          : e
            ? "Étalonnage prêt. Les points restent déplaçables sur l'image."
            : manque.length
              ? `À placer : ${manque.map((k) => k.toUpperCase()).join(", ")}. Choisir des points éloignés, sur des graduations lisibles.`
              : "Saisir les valeurs des quatre points."}
      </p>
    </section>
  );
}
