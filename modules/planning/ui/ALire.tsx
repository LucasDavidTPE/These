/**
 * Colonne « À lire » de la vue Semaine : les références que la Bibliothèque conseille de lire
 * (meilleur score d'abord). On les glisse sur un créneau, ou « Placer » les met au premier
 * créneau libre ; une lecture déjà planifiée affiche sa date.
 */
import { useState } from "react";
import type { Barre } from "../core/gantt";
import { libelleJour } from "../core/semaine";
import { TYPE_LECTURE, type Lecture } from "./Semaine";

const PRESSANT = new Set(["EN RETARD", "Ce mois-ci"]);

function heures(h: number): string {
  return h ? `≈ ${String(Math.round(h * 10) / 10).replace(".", ",")} h` : "";
}

export function ALire({
  lectures,
  prevues,
  placer,
  repartir,
  voir,
  fermer,
}: {
  lectures: Lecture[];
  /** Référence → prochaine séance prévue (non faite). */
  prevues: Map<string, Barre>;
  placer(l: Lecture): void;
  /** Place d'un coup les lectures non prévues de la liste affichée. */
  repartir(ls: Lecture[]): void;
  voir(b: Barre): void;
  fermer(): void;
}) {
  const [tout, setTout] = useState(false);
  const pressantes = lectures.filter((l) => PRESSANT.has(l.etat));
  const liste = tout || !pressantes.length ? lectures : pressantes;
  const nonPrevues = liste.filter((l) => !prevues.has(l.id));
  return (
    <aside className="alire">
      <div className="rangee alire-tete">
        <strong>À lire</strong>
        <span className="discret petit">{liste.length}</span>
        <button type="button" className="sem-fermer a-droite" onClick={fermer} aria-label="Masquer la colonne À lire" title="Masquer">
          ×
        </button>
      </div>
      <span className="segmente petit">
        <button type="button" className={!tout ? "actif" : undefined} onClick={() => setTout(false)} disabled={!pressantes.length} title="En retard et prévues ce mois-ci dans le plan de lecture">
          Ce mois-ci
        </button>
        <button type="button" className={tout ? "actif" : undefined} onClick={() => setTout(true)}>
          Toutes
        </button>
      </span>
      <p className="discret petit">Glissez une lecture sur un créneau de la semaine, ou « Placer » au premier créneau libre (9 h – 18 h, en semaine).</p>
      <ul>
        {liste.slice(0, 60).map((l) => {
          const p = prevues.get(l.id);
          return (
            <li
              key={l.id}
              className={`alire-item${p ? " alire-prevue" : ""}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TYPE_LECTURE, JSON.stringify(l));
                e.dataTransfer.effectAllowed = "copy";
              }}
              title={`${l.titre}\nPriorité : ${l.priorite || "—"} · mois ${l.mois ?? "—"} · score ${l.score}`}
            >
              <div className="rangee">
                <strong>{l.citation || l.id}</strong>
                {l.etat === "EN RETARD" ? <span className="alire-etat retard">en retard</span> : l.etat === "Ce mois-ci" ? <span className="alire-etat">ce mois</span> : null}
              </div>
              <span className="alire-titre">{l.titre}</span>
              <div className="rangee petit">
                <span className="discret">
                  {l.priorite ? `${l.priorite} · ` : ""}
                  {heures(l.heures)}
                </span>
                {p ? (
                  <button type="button" className="lien a-droite" onClick={() => voir(p)} title="Afficher cette séance">
                    prévu {libelleJour(p.debut).court} {libelleJour(p.debut).numero}
                    {p.heureDebut ? `, ${p.heureDebut}` : ""}
                  </button>
                ) : (
                  <button type="button" className="a-droite alire-placer" onClick={() => placer(l)}>
                    Placer
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!lectures.length ? <p className="discret petit">Rien à lire : tout est lu ou écarté (ou la bibliothèque est vide).</p> : null}
      {nonPrevues.length > 1 ? (
        <button type="button" onClick={() => repartir(nonPrevues)} title="Chaque lecture non prévue de la liste va au premier créneau libre, l'une après l'autre">
          Répartir les {Math.min(nonPrevues.length, 10)} premières
        </button>
      ) : null}
    </aside>
  );
}
