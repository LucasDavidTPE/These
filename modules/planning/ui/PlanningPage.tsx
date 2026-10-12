/**
 * Module Planning (SPEC §10) : la semaine en agenda (création rapide, glisser, lectures à
 * planifier) et la vue d'ensemble en Gantt, partagées entre les deux PC par OneDrive.
 * Chaque élément et chaque catégorie s'active ou se désactive d'un clic.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Message, Page, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { iso, jour, type Barre, type Zoom } from "../core/gantt";
import { elementVide, type Element } from "../core/modele";
import { creneauLibre, dureeLecture, heure, lundiDe, minutes, placer, titreSemaine } from "../core/semaine";
import { ALire } from "./ALire";
import { aujourdhui, groupesDe, renduGantt, TITRE_FIGURE, usePlanning } from "./donnees";
import { Gantt } from "./Gantt";
import { Semaine, type Lecture } from "./Semaine";
import "./planning.css";

type Vue = "semaine" | "gantt" | "liste";

const VUES: [Vue, string][] = [
  ["semaine", "Semaine"],
  ["gantt", "Vue d'ensemble"],
  ["liste", "Liste"],
];

function lirePref(cle: string, defaut: string): string {
  try {
    return localStorage.getItem(cle) ?? defaut;
  } catch {
    return defaut;
  }
}

function ecrirePref(cle: string, v: string) {
  try {
    localStorage.setItem(cle, v);
  } catch {
    /* préférence de confort seulement */
  }
}

const ZOOMS: [Zoom, string][] = [
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
  const horaire = !!e.heureDebut;
  const maj = (m: Partial<Element>) => setE({ ...e, ...m });
  return (
    <div className="pl-modale" onPointerDown={(v) => v.target === v.currentTarget && onFermer()}>
    <div className="carte editeur" role="dialog" aria-label={id ? "Modifier l'élément" : "Nouvel élément"}>
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
          <input
            className="champ"
            type="date"
            value={e.debut}
            onChange={(v) => v.target.value && maj({ debut: v.target.value, fin: horaire ? v.target.value : e.fin && e.fin < v.target.value ? v.target.value : e.fin })}
          />
        </label>
        <label className="libelle">
          <span>
            <input type="checkbox" checked={horaire} disabled={jalon} onChange={(v) => maj(v.target.checked ? { fin: e.debut, heureDebut: "09:00", heureFin: "10:00" } : { heureDebut: "", heureFin: "" })} /> À une heure précise
          </span>
          {horaire ? (
            <span className="rangee">
              <input className="champ" type="time" step={900} value={e.heureDebut} onChange={(v) => v.target.value && maj({ heureDebut: v.target.value, heureFin: e.heureFin > v.target.value ? e.heureFin : heure(minutes(v.target.value) + 60) })} />
              –
              <input className="champ" type="time" step={900} value={e.heureFin} min={e.heureDebut} onChange={(v) => v.target.value && maj({ heureFin: v.target.value })} />
            </span>
          ) : null}
        </label>
        {horaire ? null : (
          <label className="libelle">
            <span>
              <input type="checkbox" checked={jalon} onChange={(v) => maj({ fin: v.target.checked ? "" : e.debut })} /> Jalon (une seule date)
            </span>
            {jalon ? null : <input className="champ" type="date" value={e.fin} min={e.debut} onChange={(v) => v.target.value && maj({ fin: v.target.value })} />}
          </label>
        )}
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
        <button type="button" className="principal" disabled={!e.titre.trim() || (horaire && e.heureFin <= e.heureDebut)} onClick={() => onEnregistrer(e)}>
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
    </div>
  );
}

export function PlanningPage() {
  const ctx = useContexte();
  const d = usePlanning(ctx);
  const p = d.planning;
  const jourJ = aujourdhui();
  const [vue, setVueBrute] = useState<Vue>(() => (lirePref("planning.vue", "semaine") as Vue) || "semaine");
  const setVue = (v: Vue) => (setVueBrute(v), ecrirePref("planning.vue", v));
  const [zoom, setZoom] = useState<Zoom>("mois");
  const [lundi, setLundi] = useState(() => lundiDe(jourJ));
  const [weekend, setWeekendBrut] = useState(() => lirePref("planning.weekend", "1") === "1");
  const setWeekend = (w: boolean) => (setWeekendBrut(w), ecrirePref("planning.weekend", w ? "1" : "0"));
  const [colonneLire, setColonneLireBrute] = useState(() => lirePref("planning.a-lire", "1") === "1");
  const setColonneLire = (v: boolean) => (setColonneLireBrute(v), ecrirePref("planning.a-lire", v ? "1" : "0"));
  const [edition, setEdition] = useState<{ id: string | null; element: Element } | null>(null);
  const [info, setInfo] = useState<Barre | null>(null);
  const [ouvrirId, setOuvrirId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ niveau: "info" | "erreur"; texte: string } | null>(null);
  const [lectures, setLectures] = useState<Lecture[] | null>(null);
  const groupes = useMemo(() => (p ? groupesDe(p) : []), [p]);
  const tousGroupes = useMemo(() => (p ? groupesDe(p, true) : []), [p]);

  // Les références à lire, si la Bibliothèque est dans l'installeur.
  const aLire = ctx.registre.aAction("bibliotheque.a-lire");
  const chargerLectures = useCallback(() => {
    if (!aLire) return;
    void (ctx.registre.executer("bibliotheque.a-lire", ctx) as Promise<Lecture[]>).then(setLectures).catch(() => setLectures([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aLire, ctx.espace, ctx.revision]);
  useEffect(chargerLectures, [chargerLectures]);

  const toutes = useMemo(() => tousGroupes.flatMap((g) => g.barres.map((b) => ({ ...b, couleur: g.categorie.couleur }))), [tousGroupes]);
  const couleurs = useMemo(() => new Map(toutes.map((b) => [b.id, b.couleur])), [toutes]);
  /** Prochaine séance (non faite) de chaque référence planifiée. */
  const prevues = useMemo(() => {
    const m = new Map<string, Barre>();
    for (const b of toutes)
      if (b.lien?.module === "bibliotheque" && b.avancement < 100 && b.debut >= jourJ) {
        const x = m.get(b.lien.id);
        if (!x || b.debut + (b.heureDebut ?? "") < x.debut + (x.heureDebut ?? "")) m.set(b.lien.id, b);
      }
    return m;
  }, [toutes, jourJ]);

  const n = weekend ? 7 : 5;
  // Raccourcis de la vue Semaine : ← / → semaine précédente / suivante, T aujourd'hui.
  useEffect(() => {
    if (vue !== "semaine" || edition) return;
    const t = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (e.ctrlKey || e.altKey || e.metaKey || cible.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") setLundi((l) => iso(jour(l) - 7));
      else if (e.key === "ArrowRight") setLundi((l) => iso(jour(l) + 7));
      else if (e.key === "t" || e.key === "T") setLundi(lundiDe(aujourdhui()));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [vue, edition]);

  if (!ctx.espace) return <Page titre="Planning"><Message niveau="erreur">Le planning vit dans l'espace Thèse : ouvrez-en un d'abord.</Message></Page>;
  if (!p) return <Page titre="Planning"><p className="discret">Chargement…</p></Page>;

  const nouveau = () => setEdition({ id: null, element: elementVide(jourJ, { heureDebut: "09:00", heureFin: "10:00" }) });
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
  const element = (id: string) => p.elements.find((e) => e.id === id)?.valeur;
  const categorieLecture = p.categories.some((c) => c.id === "biblio") ? "biblio" : "";

  const seanceLecture = (l: Lecture, date: string, debut: number | null): Element => {
    const base = elementVide(date, { titre: `Lire ${l.citation || l.id}`, categorie: categorieLecture, notes: l.titre, lien: { module: "bibliotheque", id: l.id } });
    return debut === null ? base : placer(base, date, debut, debut + dureeLecture(l.heures));
  };

  /** Premier créneau libre à partir de maintenant (ou du lundi affiché s'il est plus tard). */
  function premierCreneau(l: Lecture, occupees: Barre[]) {
    const now = new Date();
    const depuis = lundi > jourJ ? { date: lundi, minute: 0 } : { date: jourJ, minute: now.getHours() * 60 + now.getMinutes() };
    return creneauLibre(occupees, depuis, dureeLecture(l.heures));
  }

  async function placerLecture(l: Lecture) {
    const c = premierCreneau(l, toutes);
    if (!c) return setMessage({ niveau: "erreur", texte: "Aucun créneau libre dans les quatre prochaines semaines (9 h – 18 h, en semaine)." });
    const id = await d.creer(seanceLecture(l, c.date, c.debut));
    setLundi(lundiDe(c.date));
    if (id) setOuvrirId(id);
  }

  async function repartir(ls: Lecture[]) {
    const choix = ls.slice(0, 10);
    if (!window.confirm(`Placer ${choix.length} lecture(s), chacune au premier créneau libre (9 h – 18 h, en semaine) ?`)) return;
    const occupees: Barre[] = [...toutes];
    let premiere: string | null = null;
    for (const l of choix) {
      const c = premierCreneau(l, occupees);
      if (!c) break;
      const e = seanceLecture(l, c.date, c.debut);
      const id = await d.creer(e);
      occupees.push({ id: id ?? l.id, titre: e.titre, categorie: e.categorie, debut: e.debut, fin: e.fin, avancement: 0, heureDebut: e.heureDebut, heureFin: e.heureFin });
      premiere ??= c.date;
    }
    if (premiere) setLundi(lundiDe(premiere));
  }

  async function marquerLu(id: string, refId: string) {
    try {
      await ctx.registre.executer("bibliotheque.marquer-lu", { ctx, id: refId });
      const e = element(id);
      if (e) await d.enregistrer(id, { ...e, avancement: 100 });
      chargerLectures();
      setMessage({ niveau: "info", texte: `${e?.titre.replace(/^Lire /, "") ?? refId} : marqué « Lu » dans la Bibliothèque.` });
    } catch (err) {
      setMessage({ niveau: "erreur", texte: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Toute la thèse en image : fichier SVG, ou figure de la bibliothèque (régénérable). */
  async function image(vers: "svg" | "figures") {
    if (!p) return;
    try {
      const r = await renduGantt(p, jourJ);
      if (vers === "svg") await ctx.plateforme.enregistrerSous("planning-these.svg", new TextEncoder().encode(r.svg));
      else {
        const dossier = await ctx.registre.executer("figures.enregistrer-image", { ctx, titre: TITRE_FIGURE, ...r, source: "Planning (Gantt de la thèse)", tags: ["planning", "gantt"], origine: { module: "planning" } });
        setMessage({ niveau: "info", texte: `Figure enregistrée dans la bibliothèque : ${String(dossier)}. « Régénérer » la met à jour avec le planning du jour.` });
      }
    } catch (e) {
      setMessage({ niveau: "erreur", texte: e instanceof Error ? e.message : String(e) });
    }
  }

  const premier = lundi;
  return (
    <Page
      titre="Planning"
      sousTitre="La semaine, les lectures à placer et la vue d'ensemble de la thèse, partagées entre vos deux PC"
      actions={
        <>
          <button type="button" className="principal" onClick={nouveau}>
            + Créer
          </button>
          {vue === "gantt" ? (
            <>
              <button type="button" onClick={() => void image("svg")} title="Toute la thèse, en image vectorielle">
                SVG
              </button>
              {ctx.registre.aAction("figures.enregistrer-image") ? (
                <button type="button" onClick={() => void image("figures")} title="Nouvelle figure de la bibliothèque, qu'on pourra régénérer">
                  Enregistrer dans Figures
                </button>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      {d.erreur ? <Message niveau="erreur">{d.erreur}</Message> : null}
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}
      <div className="rangee barre-outils">
        <span className="segmente">
          {VUES.map(([v, l]) => (
            <button key={v} type="button" className={vue === v ? "actif" : undefined} onClick={() => setVue(v)}>
              {l}
            </button>
          ))}
        </span>
        {vue === "semaine" ? (
          <>
            <button type="button" onClick={() => setLundi(lundiDe(jourJ))} title="Revenir à cette semaine (T)">
              Aujourd'hui
            </button>
            <span className="rangee pl-nav">
              <button type="button" className="sem-icone" onClick={() => setLundi(iso(jour(lundi) - 7))} title="Semaine précédente (←)" aria-label="Semaine précédente">
                ‹
              </button>
              <button type="button" className="sem-icone" onClick={() => setLundi(iso(jour(lundi) + 7))} title="Semaine suivante (→)" aria-label="Semaine suivante">
                ›
              </button>
            </span>
            <strong className="pl-titre-semaine">{titreSemaine(premier, n)}</strong>
            <label className="petit" title="Afficher samedi et dimanche">
              <input type="checkbox" checked={weekend} onChange={(e) => setWeekend(e.target.checked)} /> week-end
            </label>
            {aLire && !colonneLire ? (
              <button type="button" onClick={() => setColonneLire(true)}>
                À lire{lectures ? ` (${lectures.length})` : ""}
              </button>
            ) : null}
          </>
        ) : vue === "gantt" ? (
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

      {vue === "semaine" ? (
        <div className={`pl-semaine${aLire && colonneLire ? " avec-alire" : ""}`}>
          <Semaine
            key={`${premier}${n}`}
            premier={premier}
            n={n}
            aujourdhui={jourJ}
            barres={toutes}
            couleur={(b) => couleurs.get(b.id) ?? "#777777"}
            categories={p.categories.filter((c) => c.active)}
            element={element}
            creer={d.creer}
            enregistrer={(id, e) => void d.enregistrer(id, e)}
            supprimer={(id) => void d.supprimer(id)}
            editer={(id, e) => setEdition({ id, element: e })}
            nouvelleLecture={(l, date, debut) => void d.creer(seanceLecture(l, date, debut))}
            ouvrirFiche={ctx.registre.aAction("bibliotheque.ouvrir") ? (id) => void ctx.registre.executer("bibliotheque.ouvrir", { ctx, id }) : undefined}
            marquerLu={ctx.registre.aAction("bibliotheque.marquer-lu") ? (id, refId) => void marquerLu(id, refId) : undefined}
            allerA={(source) => ctx.naviguer(source === "campagnes" ? "campagnes" : "bibliotheque")}
            ouvrirId={ouvrirId}
            onOuvert={() => setOuvrirId(null)}
          />
          {aLire && colonneLire ? (
            <ALire
              lectures={lectures ?? []}
              prevues={prevues}
              placer={(l) => void placerLecture(l)}
              repartir={(ls) => void repartir(ls)}
              voir={(b) => {
                setLundi(lundiDe(b.debut));
                setOuvrirId(b.id);
              }}
              fermer={() => setColonneLire(false)}
            />
          ) : null}
        </div>
      ) : tousGroupes.length === 0 ? (
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
            const fin = v.heureDebut ? debut : v.fin ? iso(Math.max(jour(debut), jour(v.fin) + dFin)) : "";
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
            {tousGroupes.flatMap((g) =>
              g.barres.map((b) => (
                <tr key={b.id} onClick={() => choisir(b)}>
                  <td>
                    <span className="pastille-couleur" style={{ background: g.categorie.couleur }} /> {g.categorie.nom}
                  </td>
                  <td>{b.titre}</td>
                  <td>
                    {b.debut}
                    {b.heureDebut ? ` ${b.heureDebut}` : ""}
                  </td>
                  <td>{b.heureFin ? b.heureFin : b.fin || "jalon"}</td>
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
