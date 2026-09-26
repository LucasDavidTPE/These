/**
 * Module Planning (SPEC §10) : le Gantt de la thèse, partagé entre les deux PC par OneDrive.
 * Chaque élément et chaque catégorie s'active ou se désactive d'un clic.
 */
import { useMemo, useState } from "react";
import { Message, Page, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { barresDepuis, grouper, iso, jour, type Barre, type Zoom } from "../core/gantt";
import type { Element } from "../core/modele";
import { versPgfgantt } from "../core/pgfgantt";
import { usePlanning } from "./donnees";
import { Gantt } from "./Gantt";
import "./planning.css";

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ZOOMS: [Zoom, string][] = [
  ["semaine", "Semaines"],
  ["mois", "Mois"],
  ["trimestre", "Trimestres"],
  ["these", "Toute la thèse"],
];

function Editeur({
  id,
  element,
  elements,
  categories,
  onEnregistrer,
  onSupprimer,
  onFermer,
}: {
  id: string | null;
  element: Element;
  elements: { id: string; valeur: Element }[];
  categories: { id: string; nom: string }[];
  onEnregistrer(e: Element): void;
  onSupprimer(): void;
  onFermer(): void;
}) {
  const [e, setE] = useState(element);
  const jalon = e.fin === "";
  const maj = (m: Partial<Element>) => setE({ ...e, ...m });
  return (
    <div className="carte editeur">
      <div className="editeur-grille">
        <label className="libelle large">
          <span>Titre</span>
          <input className="champ" value={e.titre} onChange={(v) => maj({ titre: v.target.value })} autoFocus />
        </label>
        <label className="libelle">
          <span>Catégorie</span>
          <select className="champ" value={e.categorie} onChange={(v) => maj({ categorie: v.target.value })}>
            <option value="">{e.parent ? "(celle de la phase)" : "—"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="libelle">
          <span>Dans la phase</span>
          <select className="champ" value={e.parent} onChange={(v) => maj({ parent: v.target.value })}>
            <option value="">—</option>
            {elements
              .filter((x) => x.id !== id && !x.valeur.parent)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.valeur.titre}
                </option>
              ))}
          </select>
        </label>
        <label className="libelle">
          <span>Début</span>
          <input className="champ" type="date" value={e.debut} onChange={(v) => v.target.value && maj({ debut: v.target.value, fin: e.fin && e.fin < v.target.value ? v.target.value : e.fin })} />
        </label>
        <label className="libelle">
          <span>
            <input type="checkbox" checked={jalon} onChange={(v) => maj({ fin: v.target.checked ? "" : iso(jour(e.debut) + 30) })} /> Jalon (une seule date)
          </span>
          {jalon ? null : <input className="champ" type="date" value={e.fin} min={e.debut} onChange={(v) => v.target.value && maj({ fin: v.target.value })} />}
        </label>
        <label className="libelle">
          <span>Avancement : {e.avancement} %</span>
          <input type="range" min={0} max={100} step={5} value={e.avancement} onChange={(v) => maj({ avancement: Number(v.target.value) })} />
        </label>
        <label className="libelle">
          <span>Affiché</span>
          <span>
            <input type="checkbox" checked={e.actif} onChange={(v) => maj({ actif: v.target.checked })} /> actif (décoché : masqué, pas supprimé)
          </span>
        </label>
        <label className="libelle large">
          <span>Notes</span>
          <textarea className="champ" rows={2} value={e.notes} onChange={(v) => maj({ notes: v.target.value })} />
        </label>
      </div>
      <div className="rangee">
        <button type="button" className="principal" disabled={!e.titre.trim()} onClick={() => onEnregistrer(e)}>
          Enregistrer
        </button>
        <button type="button" onClick={onFermer}>
          Annuler
        </button>
        {id ? (
          <button type="button" className="a-droite" onClick={onSupprimer} title="Rangé dans planning/.supprimes, jamais effacé">
            Supprimer
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PlanningPage() {
  const ctx = useContexte();
  const d = usePlanning(ctx);
  const p = d.planning;
  const [zoom, setZoom] = useState<Zoom>("mois");
  const [edition, setEdition] = useState<{ id: string | null; element: Element } | null>(null);
  const [info, setInfo] = useState<Barre | null>(null);
  const [vue, setVue] = useState<"gantt" | "liste">("gantt");
  const jourJ = aujourdhui();

  const groupes = useMemo(() => (p ? grouper([...barresDepuis(p.elements), ...p.externes], p.categories) : []), [p]);

  if (!ctx.espace) return <Page titre="Planning"><Message niveau="erreur">Le planning vit dans l'espace Thèse : ouvrez-en un d'abord.</Message></Page>;
  if (!p) return <Page titre="Planning"><p className="discret">Chargement…</p></Page>;

  const nouveau = () => setEdition({ id: null, element: { titre: "", categorie: "", debut: jourJ, fin: iso(jour(jourJ) + 30), actif: true, avancement: 0, notes: "", parent: "" } });
  const choisir = (b: Barre) => {
    if (b.source) {
      setInfo(b);
      setEdition(null);
      return;
    }
    const el = p.elements.find((e) => e.id === b.id);
    if (el) setEdition({ id: el.id, element: el.valeur });
    setInfo(null);
  };
  const inactifs = p.elements.filter((e) => !e.valeur.actif);

  async function exporter() {
    const toutes = groupes.flatMap((g) => g.barres);
    if (!toutes.length) return;
    const debut = toutes.map((b) => b.debut).sort()[0]!;
    const fin = toutes.map((b) => b.fin || b.debut).sort().at(-1)!;
    await ctx.plateforme.enregistrerSous("planning-these.tex", new TextEncoder().encode(versPgfgantt(groupes, debut, fin)));
  }

  return (
    <Page
      titre="Planning"
      sousTitre="Phases, tâches et jalons de la thèse, partagés entre vos deux PC"
      actions={
        <>
          <button type="button" className="principal" onClick={nouveau}>
            Nouvel élément
          </button>
          <button type="button" onClick={() => void exporter()}>
            Exporter (pgfgantt)
          </button>
        </>
      }
    >
      {d.erreur ? <Message niveau="erreur">{d.erreur}</Message> : null}
      <div className="rangee barre-outils">
        <span className="segmente">
          {(["gantt", "liste"] as const).map((v) => (
            <button key={v} type="button" className={vue === v ? "actif" : undefined} onClick={() => setVue(v)}>
              {v === "gantt" ? "Gantt" : "Liste"}
            </button>
          ))}
        </span>
        {vue === "gantt" ? (
          <span className="segmente">
            {ZOOMS.map(([z, l]) => (
              <button key={z} type="button" className={zoom === z ? "actif" : undefined} onClick={() => setZoom(z)}>
                {l}
              </button>
            ))}
          </span>
        ) : null}
        <span className="categories">
          {p.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.active ? "puce active" : "puce"}
              style={{ ["--couleur" as string]: c.couleur }}
              title={c.active ? "Masquer cette catégorie (sur les deux PC)" : "Afficher cette catégorie"}
              onClick={() => void d.enregistrerCategories(p.categories.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)))}
            >
              {c.nom}
            </button>
          ))}
        </span>
      </div>

      {edition ? (
        <Editeur
          key={edition.id ?? "nouveau"}
          id={edition.id}
          element={edition.element}
          elements={p.elements}
          categories={p.categories}
          onFermer={() => setEdition(null)}
          onSupprimer={() => void d.supprimer(edition.id!).then(() => setEdition(null))}
          onEnregistrer={(e) => void (edition.id ? d.enregistrer(edition.id, e) : d.creer(e)).then(() => setEdition(null))}
        />
      ) : null}
      {info ? (
        <Message niveau="info">
          <strong>{info.titre}</strong> — {info.detail}. Élément fourni par {info.source === "campagnes" ? "les Campagnes" : "la Bibliothèque"} : modifiez-le à sa source.{" "}
          <button type="button" className="lien" onClick={() => ctx.naviguer(info.source === "campagnes" ? "campagnes" : "bibliotheque")}>
            Y aller
          </button>
        </Message>
      ) : null}

      {groupes.length === 0 ? (
        <div className="carte">
          <p>Le planning est vide.</p>
          <p className="discret">Ajoutez vos phases (bibliographie, campagnes d'essais, rédaction…) et vos jalons (comités de suivi, congrès). Les mois du plan de lecture apparaissent seuls dès que la bibliothèque est importée.</p>
        </div>
      ) : vue === "gantt" ? (
        <Gantt
          groupes={groupes}
          aujourdhui={jourJ}
          zoom={zoom}
          onChoisir={choisir}
          onDeplacer={(b, dDebut, dFin) => {
            const el = p.elements.find((e) => e.id === b.id);
            if (!el) return;
            const v = el.valeur;
            const debut = iso(jour(v.debut) + dDebut);
            const fin = v.fin ? iso(Math.max(jour(debut), jour(v.fin) + dFin)) : "";
            void d.enregistrer(el.id, { ...v, debut, fin });
          }}
        />
      ) : (
        <table className="tableau cliquable">
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Élément</th>
              <th>Début</th>
              <th>Fin</th>
              <th>Avancement</th>
            </tr>
          </thead>
          <tbody>
            {groupes.flatMap((g) =>
              g.barres.map((b) => (
                <tr key={b.id} onClick={() => choisir(b)}>
                  <td>
                    <span className="pastille-couleur" style={{ background: g.categorie.couleur }} /> {g.categorie.nom}
                  </td>
                  <td>{b.titre}</td>
                  <td>{b.debut}</td>
                  <td>{b.fin || "jalon"}</td>
                  <td>{b.avancement ? `${b.avancement} %` : ""}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      )}

      {inactifs.length ? (
        <Section titre={`Désactivés (${inactifs.length})`}>
          <div className="rangee">
            {inactifs.map((e) => (
              <button key={e.id} type="button" onClick={() => void d.enregistrer(e.id, { ...e.valeur, actif: true })} title="Réactiver">
                ↺ {e.valeur.titre}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </Page>
  );
}
