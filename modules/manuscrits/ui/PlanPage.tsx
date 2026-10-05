/**
 * Plan du manuscrit : une carte par partie (pages liminaires, chapitres, bibliographie,
 * annexes) dans l'ordre du plan, avec ce que l'appli lit dans son `.docx` (mots, consignes
 * restantes, commentaires, modifications suivies…) et ses versions. Les `.docx` restent où ils
 * sont ; versions et retours sont gardés ensemble dans l'espace (manuscrits/<projet>/).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Message, Pastille } from "@interface/composants";
import { useContexte, type Contexte } from "@interface/contexte";
import { isoAvecDecalage } from "@noyau/dates";
import { absolu } from "@noyau/stockage";
import { inventorier, type Inventaire } from "../core/inventaire";
import {
  ajouterParties,
  deplacerPartie,
  GENRES,
  modifierPartie,
  ordreNaturel,
  retirerPartie,
  STATUTS,
  type Manuscrit,
  type Partie,
} from "../core/plan";
import { rattacher, resoudreSource, scinder } from "../core/sources";
import { empreinte, type Etat } from "../core/versions";
import { aTraiterParPartie, type Retour } from "../core/retours";
import { chargerVersions, enregistrerVersion, listerDocx, type VersionLue } from "./donnees";
import type { ManuscritCourant } from "./useManuscrit";
import { GenererPanel } from "./GenererPanel";
import "./manuscrits.css";

type Lecture =
  | { etat: "lecture" }
  | { etat: "absent"; message: string; racine: string }
  | { etat: "erreur"; message: string }
  | { etat: "ok"; inventaire: Inventaire; empreinte: string; versions: VersionLue[]; absolu: string };

const ETATS: Record<Etat, [string, "info" | "attention" | "ok"]> = {
  "aucune-version": ["aucune version", "attention"],
  "a-jour": ["version à jour", "ok"],
  modifie: ["modifié depuis la dernière version", "attention"],
};

/** État d'une partie par rapport à sa dernière version enregistrée (null tant qu'elle n'est pas lue). */
function etatVersion(l: Lecture): Etat | null {
  if (l.etat !== "ok") return null;
  return l.versions.length ? (l.versions[0]!.empreinte === l.empreinte ? "a-jour" : "modifie") : "aucune-version";
}

const nombre = (n: number) => n.toLocaleString("fr-FR");
const date = (s: string) => new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mo = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} ko` : `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`);
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

/** Lit l'inventaire et les versions de chaque partie (une à la fois : les fichiers Word peuvent être gros). */
function useLectures(ctx: Contexte, projet: string | null, m: Manuscrit | null, tour: number) {
  const [lectures, setLectures] = useState<Record<string, Lecture>>({});
  const espace = ctx.espace;
  const cle = m ? JSON.stringify([m.parties.map((p) => [p.id, p.source]), m.lecture]) : "";
  useEffect(() => {
    if (!espace || !projet || !m) return;
    const { parties, lecture } = m;
    let annule = false;
    const maj = (id: string, l: Lecture) => !annule && setLectures((x) => ({ ...x, [id]: l }));
    (async () => {
      for (const p of parties) {
        const r = resoudreSource(p.source, espace.racine, ctx.reglages.racines);
        if (!r.ok) {
          maj(p.id, { etat: "absent", message: r.message, racine: r.racine });
          continue;
        }
        try {
          const octets = await ctx.plateforme.fichiers(r.dossier).readBytes(r.chemin);
          const versions = await chargerVersions(espace.fichiers, projet, p.id, scinder(r.chemin).nom);
          maj(p.id, { etat: "ok", inventaire: inventorier(octets, lecture), empreinte: empreinte(octets), versions, absolu: r.absolu });
        } catch (e) {
          maj(p.id, { etat: "erreur", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      annule = true;
    };
    // `m` n'est relu que si ses parties ou ses réglages de lecture changent (`cle`), pas à chaque statut modifié.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espace, projet, cle, ctx.revision, ctx.reglages.racines, tour]);
  return lectures;
}

export function PlanPage({ ms, retours, voirRetours }: { ms: ManuscritCourant; retours: Retour[]; voirRetours(partie: string): void }) {
  const ctx = useContexte();
  const espace = ctx.espace!;
  const { projets, projet, setProjet, m, sauver } = ms;
  const [message, setMessage] = useState<{ niveau: "info" | "erreur"; texte: string } | null>(ms.erreur ? { niveau: "erreur", texte: ms.erreur } : null);
  const [tour, setTour] = useState(0);
  const [titreNouveau, setTitreNouveau] = useState("Thèse");
  const [choix, setChoix] = useState<{ dossier: string; fichiers: { chemin: string; coche: boolean }[] } | null>(null);
  const lectures = useLectures(ctx, projet, m, tour);
  const enCours = useRef(false);
  const aTraiter = useMemo(() => aTraiterParPartie(retours), [retours]);

  // Les fichiers Word se modifient hors de l'appli : on relit au retour dans la fenêtre.
  useEffect(() => {
    const retour = () => setTour((t) => t + 1);
    window.addEventListener("focus", retour);
    return () => window.removeEventListener("focus", retour);
  }, []);

  async function creer() {
    await ms.creer(titreNouveau);
  }

  /** Ajoute des fichiers (chemins absolus) : leurs dossiers deviennent des racines de ce PC si besoin. */
  async function ajouter(chemins: string[]) {
    if (!m || !chemins.length) return;
    const r = rattacher(chemins, espace.racine, ctx.reglages.racines);
    if (Object.keys(r.nouvellesRacines).length) await ctx.enregistrerReglages({ ...ctx.reglages, racines: { ...ctx.reglages.racines, ...r.nouvellesRacines } });
    const avant = m.parties.length;
    const suivant = ajouterParties(
      m,
      r.sources.map((s) => ({ fichier: scinder(s.absolu).nom, source: s.source })),
    );
    await sauver(suivant);
    const nb = suivant.parties.length - avant;
    const racines = Object.entries(r.nouvellesRacines);
    setMessage({
      niveau: "info",
      texte: `${pluriel(nb, "partie ajoutée", "parties ajoutées")}${nb < chemins.length ? " (les autres y étaient déjà)" : ""}.${
        racines.length ? ` Dossier${racines.length > 1 ? "s" : ""} enregistré${racines.length > 1 ? "s" : ""} sur ce PC : ${racines.map(([n, d]) => `« ${n} » = ${d}`).join(" ; ")}. À régler aussi sur l'autre PC (Réglages du poste).` : ""
      }`,
    });
  }

  async function ajouterFichier() {
    const f = await ctx.plateforme.ouvrirFichier("Une partie du manuscrit (.docx)", ["docx"]);
    if (!f) return;
    if (!f.chemin) return setMessage({ niveau: "erreur", texte: "Le chemin du fichier n'est connu que dans l'application installée." });
    await ajouter([f.chemin]);
  }

  async function ouvrirDossier() {
    const dossier = await ctx.plateforme.choisirDossier("Dossier contenant des parties du manuscrit (.docx)");
    if (!dossier) return;
    const trouves = (await listerDocx(ctx.plateforme.fichiers(dossier))).sort(ordreNaturel);
    if (!trouves.length) return setMessage({ niveau: "info", texte: "Aucun fichier .docx dans ce dossier (ni dans ses sous-dossiers)." });
    setChoix({ dossier, fichiers: trouves.map((chemin) => ({ chemin, coche: !/fusionn|trame_complete|~\$/i.test(chemin) })) });
  }

  async function validerChoix() {
    if (!choix) return;
    const chemins = choix.fichiers.filter((f) => f.coche).map((f) => absolu(choix.dossier, f.chemin));
    setChoix(null);
    await ajouter(chemins);
  }

  async function choisirRacine(racine: string) {
    const d = await ctx.plateforme.choisirDossier(`Dossier « ${racine} » sur ce PC`);
    if (d) await ctx.enregistrerReglages({ ...ctx.reglages, racines: { ...ctx.reglages.racines, [racine]: d } });
  }

  async function versionner(p: Partie, note: string) {
    if (enCours.current) return;
    enCours.current = true;
    try {
      const r = resoudreSource(p.source, espace.racine, ctx.reglages.racines);
      if (!r.ok || !projet) return;
      const octets = await ctx.plateforme.fichiers(r.dossier).readBytes(r.chemin);
      const v = await enregistrerVersion(espace.fichiers, projet, p.id, p.source, octets, note, ctx.poste, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()));
      setMessage({ niveau: "info", texte: `Version enregistrée : ${v.fichier} (${p.nom}).` });
      setTour((t) => t + 1);
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Enregistrement impossible (fichier ouvert dans Word ?) : ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      enCours.current = false;
    }
  }

  async function copieSous(v: VersionLue) {
    const octets = await espace.fichiers.readBytes(`${v.dossier}/${v.fichier}`);
    await ctx.plateforme.enregistrerSous(v.fichier, octets);
  }

  const totaux = useMemo(() => {
    let mots = 0;
    let aRediger = 0;
    let commentaires = 0;
    let modifiees = 0;
    let lues = 0;
    for (const l of Object.values(lectures)) {
      if (l.etat !== "ok") continue;
      lues++;
      mots += l.inventaire.mots;
      aRediger += l.inventaire.aRediger;
      commentaires += l.inventaire.commentaires.filter((c) => !c.resolu).length;
      if (etatVersion(l) !== "a-jour") modifiees++;
    }
    return { mots, aRediger, commentaires, modifiees, lues };
  }, [lectures]);

  if (!projets) return <p className="discret">Lecture…</p>;

  if (!projet || !m) {
    return (
      <div className="carte">
        {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}
        <p>
          Un <strong>manuscrit</strong> est la liste ordonnée de ses parties (pages liminaires, chapitres, bibliographie, annexes), chacune étant un
          fichier Word qui reste <strong>où vous voulez</strong>. L'appli en garde le plan, l'état d'avancement et, au même endroit dans l'espace,
          toutes les versions (<code>manuscrits/&lt;manuscrit&gt;/versions</code>).
        </p>
        <div className="rangee">
          <input type="text" value={titreNouveau} onChange={(e) => setTitreNouveau(e.target.value)} aria-label="Titre du manuscrit" style={{ width: 280 }} />
          <button type="button" className="principal" disabled={!titreNouveau.trim()} onClick={() => void creer()}>
            Créer le manuscrit
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rangee ms-barre">
        {projets.length > 1 ? (
          <select className="champ" value={projet} onChange={(e) => setProjet(e.target.value)} aria-label="Manuscrit">
            {projets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titre}
              </option>
            ))}
          </select>
        ) : (
          <strong>{m.titre}</strong>
        )}
        <button type="button" onClick={() => void ajouterFichier()}>
          Ajouter une partie…
        </button>
        <button type="button" onClick={() => void ouvrirDossier()} title="Choisit un dossier et propose tous les .docx qu'il contient">
          Ajouter un dossier…
        </button>
        <button type="button" onClick={() => setTour((t) => t + 1)} title="Relit les fichiers Word (fait aussi au retour dans la fenêtre)">
          Actualiser
        </button>
      </div>
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}

      {choix ? (
        <div className="carte">
          <p>
            <strong>{choix.fichiers.length}</strong> fichiers .docx dans <code>{choix.dossier}</code> : cochez les parties du manuscrit, dans l'ordre du nom.
          </p>
          <ul className="ms-choix">
            {choix.fichiers.map((f, i) => (
              <li key={f.chemin}>
                <label>
                  <input type="checkbox" checked={f.coche} onChange={(e) => setChoix({ ...choix, fichiers: choix.fichiers.map((x, j) => (j === i ? { ...x, coche: e.target.checked } : x)) })} /> {f.chemin}
                </label>
              </li>
            ))}
          </ul>
          <div className="rangee">
            <button type="button" className="principal" disabled={!choix.fichiers.some((f) => f.coche)} onClick={() => void validerChoix()}>
              Ajouter les parties cochées
            </button>
            <button type="button" onClick={() => setChoix(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {m.parties.length === 0 ? (
        <div className="carte">
          <p>Aucune partie. « Ajouter un dossier… » propose tous les .docx d'un dossier (par exemple le dossier des chapitres) ; « Ajouter une partie… » en prend un seul.</p>
        </div>
      ) : (
        <>
          <GenererPanel projet={projet!} m={m} sauver={sauver} />
          <div className="ms-totaux">
            <Tuile valeur={nombre(totaux.mots)} titre="mots (consignes exclues)" />
            <Tuile valeur={nombre(totaux.aRediger)} titre="consignes « À rédiger »" niveau={totaux.aRediger ? "attention" : undefined} />
            <Tuile valeur={nombre(totaux.commentaires)} titre="commentaires non résolus" niveau={totaux.commentaires ? "attention" : undefined} />
            <Tuile valeur={`${totaux.modifiees} / ${totaux.lues}`} titre="parties sans version à jour (modifiées ou jamais enregistrées)" />
          </div>
          {m.parties.map((p, i) => (
            <CartePartie
              key={p.id}
              p={p}
              l={lectures[p.id] ?? { etat: "lecture" }}
              aTraiter={aTraiter.get(p.id) ?? 0}
              nbRetours={retours.filter((r) => r.partie === p.id).length}
              voirRetours={() => voirRetours(p.id)}
              premiere={i === 0}
              derniere={i === m.parties.length - 1}
              maj={(champs) => void sauver(modifierPartie(m, p.id, champs))}
              deplacer={(delta) => void sauver(deplacerPartie(m, p.id, delta))}
              retirer={() => window.confirm(`Retirer « ${p.nom} » du plan ? Le fichier Word et ses versions ne sont pas touchés.`) && void sauver(retirerPartie(m, p.id))}
              choisirRacine={(r) => void choisirRacine(r)}
              versionner={(note) => void versionner(p, note)}
              ouvrir={(chemin) => void ctx.plateforme.ouvrirDossier(chemin)}
              ouvrirVersion={(v) => void ctx.plateforme.ouvrirDossier(absolu(espace.racine, `${v.dossier}/${v.fichier}`))}
              copieSous={(v) => void copieSous(v)}
            />
          ))}
        </>
      )}
    </>
  );
}

function Tuile({ valeur, titre, niveau }: { valeur: string; titre: string; niveau?: "attention" }) {
  return (
    <div className={`ms-tuile${niveau ? ` ms-tuile-${niveau}` : ""}`}>
      <div className="ms-tuile-valeur">{valeur}</div>
      <div className="discret petit">{titre}</div>
    </div>
  );
}

function CartePartie({
  p,
  l,
  aTraiter,
  nbRetours,
  voirRetours,
  premiere,
  derniere,
  maj,
  deplacer,
  retirer,
  choisirRacine,
  versionner,
  ouvrir,
  ouvrirVersion,
  copieSous,
}: {
  p: Partie;
  l: Lecture;
  aTraiter: number;
  nbRetours: number;
  voirRetours(): void;
  premiere: boolean;
  derniere: boolean;
  maj(champs: Partial<Omit<Partie, "id">>): void;
  deplacer(delta: number): void;
  retirer(): void;
  choisirRacine(racine: string): void;
  versionner(note: string): void;
  ouvrir(chemin: string): void;
  ouvrirVersion(v: VersionLue): void;
  copieSous(v: VersionLue): void;
}) {
  const [note, setNote] = useState("");
  const ok = l.etat === "ok" ? l : null;
  const inv = ok ? ok.inventaire : null;
  const etatV = etatVersion(l);
  const nonResolus = inv ? inv.commentaires.filter((c) => !c.resolu).length : 0;
  const titre = inv?.titre && p.genre !== "liminaire" ? inv.titre : p.nom;

  return (
    <section className="ms-partie">
      <div className="ms-partie-tete">
        <div className="ms-fleches">
          <button type="button" disabled={premiere} onClick={() => deplacer(-1)} aria-label="Monter" title="Monter">
            ↑
          </button>
          <button type="button" disabled={derniere} onClick={() => deplacer(1)} aria-label="Descendre" title="Descendre">
            ↓
          </button>
        </div>
        <div className="ms-titre">
          <h2 title={titre}>{titre}</h2>
          <div className="discret petit chemin">{p.source}</div>
        </div>
        <select className="champ" value={p.genre} onChange={(e) => maj({ genre: e.target.value as Partie["genre"] })} aria-label="Genre">
          {GENRES.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </select>
        <select className="champ" value={p.statut} onChange={(e) => maj({ statut: e.target.value as Partie["statut"] })} aria-label="Statut">
          {STATUTS.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </select>
        {etatV ? <Pastille niveau={ETATS[etatV][1]}>{ETATS[etatV][0]}</Pastille> : null}
      </div>

      {l.etat === "lecture" ? <p className="discret">Lecture du fichier…</p> : null}
      {l.etat === "erreur" ? <Message niveau="erreur">{l.message}</Message> : null}
      {l.etat === "absent" ? (
        <Message niveau="attention">
          {l.message}{" "}
          {l.racine ? (
            <button type="button" onClick={() => choisirRacine(l.racine)}>
              Choisir le dossier « {l.racine} »…
            </button>
          ) : null}
        </Message>
      ) : null}

      {inv ? (
        <>
          <div className="ms-mesures">
            <span>
              <strong>{nombre(inv.mots)}</strong> mots
              {p.objectifMots ? ` sur ${nombre(p.objectifMots)}` : ""}
            </span>
            {p.objectifMots ? <progress max={p.objectifMots} value={Math.min(inv.mots, p.objectifMots)} /> : null}
            <span className={inv.aRediger ? "ms-attention" : "discret"}>{pluriel(inv.aRediger, "consigne « À rédiger »", "consignes « À rédiger »")}</span>
            <span className={nonResolus ? "ms-attention" : "discret"}>
              {pluriel(inv.commentaires.length, "commentaire")}
              {nonResolus && nonResolus !== inv.commentaires.length ? ` (${nonResolus} non résolu${nonResolus > 1 ? "s" : ""})` : ""}
            </span>
            <span className={inv.modifications.length ? "ms-attention" : "discret"}>{pluriel(inv.modifications.length, "modification suivie", "modifications suivies")}</span>
            {nbRetours ? (
              <button type="button" className="lien" onClick={voirRetours} title="Corrections reçues pour cette partie">
                {pluriel(nbRetours, "retour reçu", "retours reçus")}
                {aTraiter ? ` · ${pluriel(aTraiter, "remarque à traiter", "remarques à traiter")}` : " · tout traité"}
              </button>
            ) : null}
            <span className="discret">
              {pluriel(inv.figures, "figure")} · {pluriel(inv.tableaux, "tableau", "tableaux")} · {pluriel(inv.notes, "note")} · {pluriel(inv.citations, "citation")} Zotero
            </span>
            {inv.modifie ? <span className="discret">modifié le {date(inv.modifie)}</span> : null}
          </div>

          <div className="rangee">
            <label className="discret petit">
              Objectif{" "}
              <input
                type="number"
                min={0}
                step={500}
                placeholder="mots"
                value={p.objectifMots ?? ""}
                onChange={(e) => maj({ objectifMots: e.target.value === "" || Number(e.target.value) <= 0 ? null : Number(e.target.value) })}
                style={{ width: 90 }}
                aria-label="Objectif en mots"
              />
            </label>
            <button type="button" onClick={() => ouvrir(ok!.absolu)} title="Ouvre le fichier dans Word">
              Ouvrir dans Word
            </button>
            <input type="text" placeholder="Note de version (facultative) : « envoyé à Sergio »…" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: "1 1 260px" }} aria-label="Note de version" />
            <button
              type="button"
              className={etatV === "a-jour" ? undefined : "principal"}
              onClick={() => {
                versionner(note);
                setNote("");
              }}
            >
              Enregistrer une version
            </button>
            <button type="button" className="lien" onClick={retirer}>
              Retirer du plan
            </button>
          </div>

          {inv.plan.length ? (
            <details className="ms-plan">
              <summary>Plan ({pluriel(inv.plan.length, "titre")})</summary>
              <ul>
                {inv.plan.map((t, i) => (
                  <li key={i} style={{ paddingLeft: `${(t.niveau - 1) * 16}px` }} className={t.niveau === 1 ? "gras" : undefined}>
                    {t.numero ? `${t.numero} ` : ""}
                    {t.texte}
                    {t.signet ? <span className="discret petit"> · {t.signet}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {ok && ok.versions.length ? (
            <details className="ms-versions">
              <summary>Versions ({ok.versions.length})</summary>
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Note</th>
                    <th>Poste</th>
                    <th>Taille</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ok.versions.map((v) => (
                    <tr key={`${v.dossier}/${v.fichier}`}>
                      <td className="nowrap">{v.date ? date(v.date) : v.fichier}</td>
                      <td>{v.note || <span className="discret">—</span>}</td>
                      <td>{v.poste}</td>
                      <td className="nowrap">{mo(v.taille)}</td>
                      <td className="nowrap">
                        <button type="button" title="Ouvre la copie dans Word (enregistrez-la ailleurs pour la modifier)" onClick={() => ouvrirVersion(v)}>
                          Ouvrir
                        </button>{" "}
                        <button type="button" onClick={() => copieSous(v)}>
                          Copie sous…
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      ) : l.etat === "absent" || l.etat === "erreur" ? (
        <div className="rangee">
          <button type="button" className="lien" onClick={retirer}>
            Retirer du plan
          </button>
        </div>
      ) : null}
    </section>
  );
}
