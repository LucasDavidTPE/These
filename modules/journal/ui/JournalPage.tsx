/**
 * Journal : une note par jour, avec sa liste de tâches. La note du jour se crée à l'ouverture et
 * reprend les tâches non faites de la dernière note ; on coche sur place, on ajoute une tâche d'une
 * ligne, on écrit le reste en Markdown.
 */
import { useEffect, useState } from "react";
import { Message, Page } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { Markdown } from "@interface/Markdown";
import { useOuverture } from "@interface/ouverture";
import { ajouterTache, basculer, decaler, jourDe, taches, titreJour } from "../core/journal";
import { brouillon, ecrireNote, listerJours, lireNote, noteDuJour } from "./donnees";
import "./journal.css";

export function JournalPage() {
  const ctx = useContexte();
  const fs = ctx.espace?.fichiers;
  const aujourdhui = jourDe(new Date());
  const [demande, setDemande] = useOuverture("journal");
  const jour = demande ?? aujourdhui;
  const [note, setNote] = useState<string | null>(null);
  const [existe, setExiste] = useState(false);
  const [jours, setJours] = useState<{ jour: string; ouvertes: number }[]>([]);
  const [edition, setEdition] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!fs) return;
    let annule = false;
    (async () => {
      // Aujourd'hui : la note est créée (report des tâches) ; un autre jour : seulement lue.
      const md = jour === aujourdhui ? await noteDuJour(fs, jour) : await lireNote(fs, jour);
      const liste = await listerJours(fs);
      const recents = await Promise.all(liste.slice(-30).reverse().map(async (j) => ({ jour: j, ouvertes: taches((await lireNote(fs, j)) ?? "").filter((t) => !t.fait).length })));
      if (annule) return;
      setNote(md ?? (await brouillon(fs, jour)));
      setExiste(md !== null);
      setJours(recents);
    })().catch((e: unknown) => !annule && setErreur(e instanceof Error ? e.message : String(e)));
    return () => {
      annule = true;
    };
  }, [fs, jour, aujourdhui, ctx.revision]);

  if (!fs) return <Page titre="Journal"><Message niveau="erreur">Le journal vit dans l'espace Thèse : ouvrez-en un d'abord.</Message></Page>;

  async function ecrire(md: string) {
    setErreur(null);
    try {
      await ecrireNote(fs!, jour, md);
      setNote(md);
      setExiste(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  const aller = (j: string) => {
    setEdition(null);
    setDemande(j === aujourdhui ? null : j);
  };
  const liste = note ? taches(note) : [];
  const ouvertes = liste.filter((t) => !t.fait).length;

  return (
    <Page
      titre="Journal"
      sousTitre={`${titreJour(jour)}${jour === aujourdhui ? " · aujourd'hui" : ""}${liste.length ? ` · ${ouvertes} tâche${ouvertes > 1 ? "s" : ""} à faire sur ${liste.length}` : ""}`}
      actions={
        <>
          <button type="button" onClick={() => aller(decaler(jour, -1))} title="Jour précédent">
            ←
          </button>
          <button type="button" disabled={jour === aujourdhui} onClick={() => aller(aujourdhui)}>
            Aujourd'hui
          </button>
          <button type="button" onClick={() => aller(decaler(jour, 1))} title="Jour suivant">
            →
          </button>
        </>
      }
    >
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      <div className="journal">
        <aside className="journal-jours" aria-label="Notes récentes">
          {jours.map((j) => (
            <button key={j.jour} type="button" className={j.jour === jour ? "actif" : undefined} onClick={() => aller(j.jour)}>
              <span>{new Date(`${j.jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
              {j.ouvertes ? <span className="journal-compte">{j.ouvertes}</span> : null}
            </button>
          ))}
          {jours.length === 0 ? <p className="discret petit">Les notes apparaîtront ici.</p> : null}
        </aside>
        <div className="journal-note">
          {note === null ? null : edition !== null ? (
            <div className="carte-edition">
              <textarea className="champ" aria-label="Texte de la note" rows={Math.max(12, edition.split("\n").length + 2)} value={edition} onChange={(e) => setEdition(e.target.value)} />
              <p className="discret petit">Markdown : ## titre, - [ ] tâche, - [x] faite, **gras**, *italique*, - liste, [lien](https://…), [@BIB-020].</p>
              <div className="rangee">
                <button type="button" className="principal" onClick={() => void ecrire(edition).then(() => setEdition(null))}>
                  Enregistrer
                </button>
                <button type="button" onClick={() => setEdition(null)}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              {!existe ? <p className="discret petit">Pas encore de note ce jour-là : elle sera créée à la première modification (avec les tâches non faites de la note précédente).</p> : null}
              <form
                className="rangee journal-ajout"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!nouvelle.trim()) return;
                  void ecrire(ajouterTache(note, nouvelle)).then(() => setNouvelle(""));
                }}
              >
                <input className="champ" aria-label="Nouvelle tâche" placeholder="Nouvelle tâche…" value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} />
                <button type="submit" disabled={!nouvelle.trim()}>
                  Ajouter
                </button>
                <button type="button" onClick={() => setEdition(note)}>
                  ✎ Modifier la note
                </button>
              </form>
              <div className="carte-texte">
                <Markdown texte={note} basculer={(ligne) => void ecrire(basculer(note, ligne))} />
              </div>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
