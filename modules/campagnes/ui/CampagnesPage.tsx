/**
 * Module Campagnes (SPEC §8) : galerie des campagnes, fiche, essais découverts dans les
 * données brutes, carnet de notes et d'images. Remplace le tableau de bord de these-lgcb.
 */
import { useEffect, useMemo, useState } from "react";
import { resoudre, referenceDepuisChemin } from "@noyau/poste/racines";
import { Message, Page, Pastille, Section } from "@interface/composants";
import { Apercu, Courbes } from "@interface/Courbes";
import { FiguresLiees } from "@interface/FiguresLiees";
import { VUE_ENTIERE, type Vue } from "@noyau/courbes";
import { lireCsv, tableauEssai, versCsvExcel, type Serie } from "@noyau/formats/wavematrix";
import { ecrireXlsx } from "@noyau/formats/xlsx-ecriture";
import { apercu, panneaux, type PanneauEssai } from "../core/courbes";
import { SUFFIXE_SUIVI } from "../core/decouverte";
import { useContexte } from "@interface/contexte";
import { IconeDossier } from "@interface/icones";
import { decouvrir } from "../core/decouverte";
import { FILTRE_VIDE, garderCampagne, lireEssai, nouvelleCampagne, periode, periodeLisible, STATUTS, TYPES, typeDe, type Campagne, type Essai } from "../core/modele";
import { depuisLgcb } from "../core/toml";
import { valeur } from "../core/traitement";
import { ajouterImage, ajouterNote, chargerCampagnes, cheminTraitement, creerCampagne, enregistrerApercu, enregistrerCampagne, enregistrerEssai, type CampagneChargee } from "./donnees";
import { renduCourbes, titreFigure, type OrigineCourbes } from "./figure";
import { prendreOuverture } from "./ouverture";
import "./campagnes.css";

function heures(c: CampagneChargee): number {
  return Math.round(Object.values(c.essais).reduce((s, e) => s + (e.dureeH ?? 0), 0));
}

function Carte({ c, ouvrir }: { c: CampagneChargee; ouvrir(): void }) {
  const t = typeDe(c.campagne.type);
  const p = periode(Object.values(c.essais), c.campagne);
  return (
    <button type="button" className="carte-campagne" style={{ ["--type" as string]: t.couleur }} onClick={ouvrir}>
      <span className="bande" />
      <span className="titre">{c.campagne.titre}</span>
      <span className="discret">
        {t.libelle}
        {c.campagne.materiau ? ` · ${c.campagne.materiau}` : ""}
      </span>
      <span>{p ? periodeLisible(p) : <span className="discret">pas encore de date</span>}</span>
      {c.apercu ? (
        <span className="apercus">
          {c.apercu.temperature.length ? <Apercu x={c.apercu.heures} y={c.apercu.temperature} couleur="#b0602c" /> : null}
          {c.apercu.force.length ? <Apercu x={c.apercu.heures} y={c.apercu.force} couleur="#2f5f8a" /> : null}
        </span>
      ) : null}
      <span className="chiffres">
        {Object.keys(c.essais).length} essai(s) · {heures(c)} h · {c.notes.length} note(s) · {c.images.length} image(s)
      </span>
      <Pastille niveau={c.campagne.statut === "en cours" ? "attention" : c.campagne.statut === "terminé" ? "ok" : "info"}>{c.campagne.statut}</Pastille>
    </button>
  );
}

function ImageEspace({ chemin }: { chemin: string }) {
  const { espace, plateforme } = useContexte();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!espace) return;
    let u: string | null = null;
    let annule = false;
    void espace.fichiers.readBytes(chemin).then((o) => {
      if (annule) return;
      u = URL.createObjectURL(new Blob([o as BlobPart]));
      setUrl(u);
    });
    return () => {
      annule = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [espace, chemin]);
  return url ? (
    <img src={url} alt="" title="Ouvrir" onClick={() => espace && void plateforme.ouvrirDossier(`${espace.racine}${espace.racine.includes("\\") ? "\\" : "/"}${chemin.split("/").join(espace.racine.includes("\\") ? "\\" : "/")}`)} />
  ) : null;
}

function Champ({ titre, valeur, onValider, large, multiligne, type }: { titre: string; valeur: string; onValider(v: string): void; large?: boolean; multiligne?: boolean; type?: string }) {
  const [v, setV] = useState<string | null>(null);
  const courant = v ?? valeur;
  const valider = () => {
    if (v !== null && v !== valeur) onValider(v);
    setV(null);
  };
  return (
    <label className={large ? "champ-c large" : "champ-c"}>
      <span>{titre}</span>
      {multiligne ? <textarea rows={3} value={courant} onChange={(e) => setV(e.target.value)} onBlur={valider} /> : <input type={type ?? "text"} value={courant} onChange={(e) => setV(e.target.value)} onBlur={valider} />}
    </label>
  );
}

function VueCampagne({ c, fermer, rafraichir }: { c: CampagneChargee; fermer(): void; rafraichir(): void }) {
  const ctx = useContexte();
  const fs = ctx.espace!.fichiers;
  const [message, setMessage] = useState<{ niveau: "info" | "erreur"; texte: string } | null>(null);
  const [note, setNote] = useState({ titre: "", texte: "" });
  const [courbes, setCourbes] = useState<{ essai: string; panneaux: PanneauEssai[] | null; serie?: Serie } | null>(null);
  const [vue, setVue] = useState<Vue>(VUE_ENTIERE);
  // Les régressions posées sur les courbes sont gardées avec l'essai (essai.json).
  useEffect(() => {
    const nom = courbes?.essai;
    const essai = nom ? c.essais[nom] : undefined;
    if (!nom || !essai || !vue.regressions) return;
    if (JSON.stringify(vue.regressions) === JSON.stringify(essai.regressions)) return;
    void enregistrerEssai(fs, c.slug, nom, { ...essai, regressions: vue.regressions }).catch((e: unknown) => setMessage({ niveau: "erreur", texte: e instanceof Error ? e.message : String(e) }));
  }, [vue.regressions, courbes?.essai, c.essais, c.slug, fs]);
  const k = c.campagne;
  const agir = async (f: () => Promise<unknown>, ok?: string) => {
    try {
      await f();
      if (ok) setMessage({ niveau: "info", texte: ok });
      rafraichir();
    } catch (e) {
      setMessage({ niveau: "erreur", texte: e instanceof Error ? e.message : String(e) });
    }
  };
  const maj = (m: Partial<Campagne>) => void agir(() => enregistrerCampagne(fs, c.slug, { ...k, ...m }));
  const donnees = k.donnees ? resoudre(k.donnees, ctx.reglages.racines) : null;

  async function choisirDonnees() {
    const chemin = await ctx.plateforme.choisirDossier("Dossier des données brutes de la campagne", donnees?.ok ? donnees.chemin : undefined);
    if (!chemin) return;
    const ref = referenceDepuisChemin(chemin, ctx.reglages.racines);
    if (!ref) {
      setMessage({ niveau: "erreur", texte: "Ce dossier n'est sous aucune racine de données. Déclarez d'abord sa racine (par exemple « essais » → E:\\) dans les réglages du poste." });
      return;
    }
    maj({ donnees: ref });
  }

  async function decouvrirEssais() {
    if (!donnees?.ok) return;
    if (!(await ctx.plateforme.dossierExiste(donnees.chemin))) {
      setMessage({ niveau: "erreur", texte: `${donnees.chemin} est introuvable sur ce poste (les données brutes ne sont peut-être que sur le PC de travail).` });
      return;
    }
    await agir(async () => {
      const d = await decouvrir(ctx.plateforme.fichiers(donnees.chemin));
      for (const [nom, trouve] of Object.entries(d.essais)) await enregistrerEssai(fs, c.slug, nom, { ...(c.essais[nom] ?? lireEssai({})), ...trouve });
      const machine = { ...k.machine };
      for (const [cle, v] of Object.entries(d.machine)) if (!machine[cle as keyof typeof machine]) machine[cle as keyof typeof machine] = v;
      await enregistrerCampagne(fs, c.slug, { ...k, machine });
      setMessage({ niveau: "info", texte: `${Object.keys(d.essais).length} essai(s) trouvé(s) dans ${donnees.chemin}.` });
    });
  }

  async function voirCourbes(nom: string) {
    if (!donnees?.ok) return;
    setCourbes({ essai: nom, panneaux: null });
    try {
      const fsDonnees = ctx.plateforme.fichiers(donnees.chemin);
      const fichier = (await fsDonnees.listDir(nom)).find((f) => f.name.endsWith(SUFFIXE_SUIVI));
      if (!fichier) throw new Error(`Pas d'export ${SUFFIXE_SUIVI} dans ${nom}.`);
      const serie = lireCsv(new TextDecoder().decode(await fsDonnees.readBytes(`${nom}/${fichier.name}`)));
      setCourbes({ essai: nom, panneaux: panneaux(serie), serie });
      const a = apercu(serie);
      if (a) await enregistrerApercu(fs, c.slug, nom, a);
    } catch (e) {
      setCourbes(null);
      setMessage({ niveau: "erreur", texte: e instanceof Error ? e.message : String(e) });
    }
  }

  async function versFigures() {
    if (!courbes) return;
    const p = courbes.panneaux;
    if (!p) return;
    await agir(async () => {
      const titre = titreFigure(k.titre, courbes.essai);
      const origine: OrigineCourbes = { module: "campagnes", campagne: c.slug, essai: courbes.essai, vue };
      const r = await renduCourbes(p, titre, vue);
      const dossier = await ctx.registre.executer("figures.enregistrer-image", { ctx, titre, ...r, source: `Campagnes : ${k.titre}, ${courbes.essai}`, tags: [typeDe(k.type).libelle, courbes.essai], origine });
      setMessage({ niveau: "info", texte: `Figure enregistrée dans la bibliothèque : ${String(dossier)}. Elle garde le lien vers les données : « Régénérer » la refait (mêmes voies, même plage).` });
    });
  }

  async function exporterXlsx(essai: string, serie: Serie) {
    try {
      const t = tableauEssai(serie);
      const octets = ecrireXlsx(essai, t.entetes, t.lignes.map((l) => l.map((x) => (Number.isFinite(x) ? Number(x.toPrecision(8)) : null))));
      await ctx.plateforme.enregistrerSous(`${k.titre} - ${essai}.xlsx`.replace(/[\\/:*?"<>|]/g, "_"), octets);
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `${e instanceof Error ? e.message : String(e)} Utilisez l'export .csv.` });
    }
  }

  /** Copie les données brutes (un essai, ou tout le dossier) vers un dossier choisi. */
  async function copier(essai?: string) {
    if (!donnees?.ok) return;
    let depart: string | undefined;
    try {
      depart = localStorage.getItem("campagnes.copie") ?? undefined;
    } catch {
      depart = undefined;
    }
    const choisi = await ctx.plateforme.choisirDossier(essai ? `Copier les données de ${essai} vers…` : "Copier toutes les données de la campagne vers…", depart);
    if (!choisi) return;
    try {
      localStorage.setItem("campagnes.copie", choisi);
    } catch {
      /* mémoire du poste indisponible : sans conséquence */
    }
    const sep = choisi.includes("\\") || !choisi.includes("/") ? "\\" : "/";
    const base = donnees.chemin.replace(/[\\/]+$/, "");
    const nom = essai ?? base.split(/[\\/]/).pop()!;
    const source = essai ? `${base}${donnees.chemin.includes("\\") ? "\\" : "/"}${essai}` : base;
    const destination = `${choisi.replace(/[\\/]+$/, "")}${sep}${nom}`;
    setMessage({ niveau: "info", texte: `Copie de ${nom} en cours…` });
    try {
      const r = await ctx.plateforme.copierDossier(source, destination);
      const mo = (r.octets / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      setMessage({ niveau: "info", texte: `${nom} copié dans ${destination} : ${r.copies} fichier(s) copié(s) (${mo} Mo), ${r.aJour} déjà à jour.` });
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Copie impossible : ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function depouiller(nom: string) {
    if (!donnees?.ok) return;
    try {
      const fichier = (await ctx.plateforme.fichiers(donnees.chemin).listDir(nom)).find((f) => f.name.endsWith(SUFFIXE_SUIVI));
      if (!fichier) throw new Error(`Pas d'export ${SUFFIXE_SUIVI} dans ${nom}.`);
      const sep = donnees.chemin.includes("\\") ? "\\" : "/";
      await ctx.registre.executer("traitement.ouvrir-essai", {
        ctx,
        titre: `${k.titre} — ${nom}`,
        dossierDonnees: `${donnees.chemin.replace(/[\\/]+$/, "")}${sep}${nom}`,
        fichier: fichier.name,
        projet: cheminTraitement(c.slug, nom),
        campagne: c.slug,
      });
    } catch (e) {
      setMessage({ niveau: "erreur", texte: e instanceof Error ? e.message : String(e) });
    }
  }

  async function collerImage(e: React.ClipboardEvent) {
    const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    await agir(async () => ajouterImage(fs, c.slug, f.name || "collage.png", new Uint8Array(await f.arrayBuffer())), "Image ajoutée.");
  }

  const essais = Object.entries(c.essais).sort(([a], [b]) => a.localeCompare(b, "fr", { numeric: true }));
  const p = periode(Object.values(c.essais), k);

  return (
    <Page
      titre={k.titre}
      sousTitre={`${typeDe(k.type).libelle}${p ? ` · ${periodeLisible(p)}` : ""}${k.materiau ? ` · ${k.materiau}` : ""}`}
      actions={
        <button type="button" onClick={fermer}>
          ← Campagnes
        </button>
      }
    >
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}

      <Section titre="Fiche">
        <div className="grille-c">
          <Champ titre="Titre" valeur={k.titre} onValider={(v) => maj({ titre: v })} large />
          <label className="champ-c">
            <span>Type d'essai</span>
            <select value={k.type} onChange={(e) => maj({ type: e.target.value })}>
              {TYPES.map(([id, l]) => (
                <option key={id} value={id}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="champ-c">
            <span>Statut</span>
            <select value={k.statut} onChange={(e) => maj({ statut: e.target.value })}>
              {STATUTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Champ titre="Matériau / formulation" valeur={k.materiau} onValider={(v) => maj({ materiau: v })} />
          <Champ titre="Début prévu" type="date" valeur={k.prevu.debut} onValider={(v) => maj({ prevu: { ...k.prevu, debut: v } })} />
          <Champ titre="Fin prévue" type="date" valeur={k.prevu.fin} onValider={(v) => maj({ prevu: { ...k.prevu, fin: v } })} />
          <Champ titre="Notes (conditions, incidents, éprouvettes écartées)" valeur={k.notes} onValider={(v) => maj({ notes: v })} large multiligne />
        </div>
      </Section>

      <Section titre="Données brutes">
        <div className="carte">
          <p>
            {k.donnees ? <code>{k.donnees}</code> : <span className="discret">Pas encore de dossier.</span>}{" "}
            {donnees && !donnees.ok ? <span className="texte-erreur">{donnees.message}</span> : null}
            {donnees?.ok ? <span className="discret chemin"> → {donnees.chemin}</span> : null}
          </p>
          <div className="rangee">
            <button type="button" onClick={() => void choisirDonnees()}>
              Choisir le dossier…
            </button>
            {donnees?.ok ? (
              <>
                <button type="button" onClick={() => void ctx.plateforme.ouvrirDossier(donnees.chemin)}>
                  <IconeDossier taille={16} /> Ouvrir
                </button>
                <button type="button" className="principal" onClick={() => void decouvrirEssais()}>
                  Découvrir les essais
                </button>
                <button type="button" title="Copie incrémentale vers un disque externe ou un dossier partagé ; rien n'est supprimé" onClick={() => void copier()}>
                  Copier les données…
                </button>
              </>
            ) : null}
          </div>
          {Object.values(k.machine).some(Boolean) ? (
            <p className="discret petit">
              Machine : opérateur {k.machine.operateur || "—"} · poste {k.machine.poste || "—"} · bâti {k.machine.bati || "—"} · logiciel {k.machine.logiciel || "—"}
            </p>
          ) : null}
        </div>
      </Section>

      <Section titre={`Essais (${essais.length})`}>
        {essais.length === 0 ? (
          <p className="discret">Aucun essai : « Découvrir les essais » les lit dans les journaux de la machine.</p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Essai</th>
                <th>Éprouvette</th>
                <th>Début</th>
                <th>Durée</th>
                <th>Cycles</th>
                <th>État final</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {essais.map(([nom, e]) => {
                const ecrire = (m: Partial<Essai>) => void agir(() => enregistrerEssai(fs, c.slug, nom, { ...e, ...m }));
                return (
                  <tr key={nom}>
                    <td>
                      <strong>{nom}</strong>
                    </td>
                    <td>
                      <Champ titre="" valeur={e.eprouvette} onValider={(v) => ecrire({ eprouvette: v })} />
                    </td>
                    <td className="nowrap">{e.debut.slice(0, 16)}</td>
                    <td>{e.dureeH !== null ? `${e.dureeH} h` : ""}</td>
                    <td>{e.cycles ?? ""}</td>
                    <td className="petit">{e.etat}</td>
                    <td>
                      <Champ titre="" valeur={e.notes} onValider={(v) => ecrire({ notes: v })} />
                    </td>
                    <td className="nowrap">
                      <button type="button" disabled={!donnees?.ok} title={donnees?.ok ? "Lire l'export de suivi et tracer les courbes" : "Choisissez d'abord le dossier de données"} onClick={() => void voirCourbes(nom)}>
                        Courbes
                      </button>{" "}
                      <button type="button" disabled={!donnees?.ok} title="Copier les données brutes de cet essai vers un dossier choisi" onClick={() => void copier(nom)}>
                        Copier…
                      </button>{" "}
                      {k.type === "module-complexe" && ctx.registre.aAction("traitement.ouvrir-essai") ? (
                        <button type="button" disabled={!donnees?.ok} title="Ouvrir cet essai dans le traitement 2S2P1D" onClick={() => void depouiller(nom)}>
                          {c.depouilles.includes(nom) ? "2S2P1D ✓" : "2S2P1D"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {Object.keys(c.traitements).length > 0 ? (
        <Section titre="Résultats du traitement 2S2P1D">
          <table className="tableau">
            <thead>
              <tr>
                <th>Essai</th>
                <th>Modèle</th>
                <th>T réf.</th>
                <th>WLF C1 / C2</th>
                <th>Paramètres calés</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(c.traitements).map(([nom, t]) => (
                <tr key={nom}>
                  <td>{nom}</td>
                  <td>{t.modele}</td>
                  <td>{t.Tref !== null ? `${valeur(t.Tref)} °C` : "—"}</td>
                  <td>{t.C1 !== null && t.C2 !== null ? `${valeur(t.C1)} / ${valeur(t.C2)}` : "—"}</td>
                  <td className="petit">{t.parametres.map(([k, v]) => `${k} = ${valeur(v)}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {courbes ? (
        <Section
          titre={`Courbes : ${courbes.essai}`}
          aDroite={
            <span className="rangee">
              {courbes.serie ? (
                <button
                  type="button"
                  onClick={() => void ctx.plateforme.enregistrerSous(`${k.titre} - ${courbes.essai}.csv`.replace(/[\\/:*?"<>|]/g, "_"), new TextEncoder().encode(versCsvExcel(courbes.serie!)))}
                >
                  Exporter en CSV
                </button>
              ) : null}
              {courbes.serie ? (
                <button type="button" onClick={() => void exporterXlsx(courbes.essai, courbes.serie!)}>
                  Exporter en Excel (.xlsx)
                </button>
              ) : null}
              {courbes.panneaux && ctx.registre.aAction("figures.enregistrer-image") ? (
                <button type="button" onClick={() => void versFigures()}>
                  Enregistrer dans Figures
                </button>
              ) : null}
              <button type="button" onClick={() => setCourbes(null)}>
                Fermer
              </button>
            </span>
          }
        >
          {courbes.panneaux ? <Courbes key={courbes.essai} panneaux={courbes.panneaux} xLibelle="temps (h)" onVue={setVue} regressionsInitiales={c.essais[courbes.essai]?.regressions} /> : <p className="discret">Lecture de l'export…</p>}
        </Section>
      ) : null}

      {ctx.registre.aAction("figures.liste") ? (
        <Section titre="Figures">
          <FiguresLiees cible={{ type: "campagne", id: c.slug, titre: k.titre }} />
        </Section>
      ) : null}

      <Section titre="Carnet">
        <div className="carnet" onPaste={(e) => void collerImage(e)}>
          <div className="carte">
            <input type="text" placeholder="Titre de la note" value={note.titre} onChange={(e) => setNote({ ...note, titre: e.target.value })} />
            <textarea rows={3} placeholder="Ce qui s'est passé, ce qu'il faudra se rappeler… (Ctrl+V : coller une image)" value={note.texte} onChange={(e) => setNote({ ...note, texte: e.target.value })} />
            <div className="rangee">
              <button type="button" className="principal" disabled={!note.texte.trim()} onClick={() => void agir(() => ajouterNote(fs, c.slug, note.titre, note.texte), "Note ajoutée.").then(() => setNote({ titre: "", texte: "" }))}>
                Ajouter la note
              </button>
              <button
                type="button"
                onClick={() =>
                  void ctx.plateforme.ouvrirFichier("Ajouter une image", ["png", "jpg", "jpeg", "gif", "webp", "bmp"]).then((f) => f && agir(() => ajouterImage(fs, c.slug, f.nom, f.octets), "Image ajoutée."))
                }
              >
                Ajouter une image…
              </button>
            </div>
          </div>
          {c.images.length ? (
            <div className="images">
              {c.images.map((i) => (
                <ImageEspace key={i} chemin={`campagnes/${c.slug}/images/${i}`} />
              ))}
            </div>
          ) : null}
          {c.notes.map((n) => (
            <div key={n.fichier} className="carte note">
              <div className="discret petit">{n.date}</div>
              <strong>{n.titre}</strong>
              <p>{n.texte}</p>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}

export function CampagnesPage() {
  const ctx = useContexte();
  const [etat, setEtat] = useState<CampagneChargee[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(prendreOuverture);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tour, setTour] = useState(0);
  const fs = ctx.espace?.fichiers;

  useEffect(() => {
    if (!fs) return;
    let annule = false;
    chargerCampagnes(fs)
      .then((r) => !annule && setEtat(r.campagnes))
      .catch((e: unknown) => !annule && setErreur(String(e)));
    return () => {
      annule = true;
    };
  }, [fs, ctx.revision, tour]);

  const [filtre, setFiltre] = useState(FILTRE_VIDE);
  const materiaux = useMemo(() => [...new Set((etat ?? []).map((c) => c.campagne.materiau).filter(Boolean))].sort(), [etat]);
  const triees = useMemo(
    () => [...(etat ?? [])].sort((a, b) => ((periode(Object.values(b.essais), b.campagne)?.debut ?? "") > (periode(Object.values(a.essais), a.campagne)?.debut ?? "") ? 1 : -1)),
    [etat],
  );
  const visibles = triees.filter((c) => garderCampagne(c.campagne, c.essais, c.notes, filtre));
  if (!fs) return <Page titre="Campagnes"><Message niveau="erreur">Les campagnes vivent dans l'espace Thèse : ouvrez-en un d'abord.</Message></Page>;
  const courante = etat?.find((c) => c.slug === ouverte);
  if (courante) return <VueCampagne c={courante} fermer={() => setOuverte(null)} rafraichir={() => setTour((t) => t + 1)} />;

  async function importer() {
    const f = await ctx.plateforme.ouvrirFichier("Fiche de campagne these-lgcb (projects/*.toml)", ["toml"]);
    if (!f || !fs) return;
    try {
      const { campagne, essais } = depuisLgcb(new TextDecoder().decode(f.octets));
      setOuverte(await creerCampagne(fs, campagne, essais));
      setTour((t) => t + 1);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function nouvelle() {
    if (!fs) return;
    setOuverte(await creerCampagne(fs, nouvelleCampagne("Nouvelle campagne")));
    setTour((t) => t + 1);
  }

  return (
    <Page
      titre="Campagnes"
      sousTitre="Campagnes d'essais : données brutes, essais, notes et photos"
      actions={
        <>
          <button type="button" className="principal" onClick={() => void nouvelle()}>
            Nouvelle campagne
          </button>
          <button type="button" onClick={() => void importer()}>
            Importer une fiche these-lgcb…
          </button>
        </>
      }
    >
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      {!etat ? (
        <p className="discret">Chargement…</p>
      ) : etat.length === 0 ? (
        <div className="carte">
          <p>Aucune campagne.</p>
          <p className="discret">Créez-en une, ou importez vos fiches de these-lgcb (<code>projects/*.toml</code>) : titre, type, matériau, machine et essais sont repris.</p>
        </div>
      ) : (
        <>
          <div className="filtres">
            <input className="recherche" type="search" placeholder="Rechercher (fiche, essais, carnet)…" value={filtre.texte} onChange={(e) => setFiltre({ ...filtre, texte: e.target.value })} />
            <select value={filtre.type} onChange={(e) => setFiltre({ ...filtre, type: e.target.value })} aria-label="Type">
              <option value="">Tous les types</option>
              {TYPES.map(([id, libelle]) => (
                <option key={id} value={id}>
                  {libelle}
                </option>
              ))}
            </select>
            <select value={filtre.statut} onChange={(e) => setFiltre({ ...filtre, statut: e.target.value })} aria-label="Statut">
              <option value="">Tous les statuts</option>
              {STATUTS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            {materiaux.length > 1 ? (
              <select value={filtre.materiau} onChange={(e) => setFiltre({ ...filtre, materiau: e.target.value })} aria-label="Matériau">
                <option value="">Tous les matériaux</option>
                {materiaux.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {visibles.length === 0 ? <p className="discret">Aucune campagne ne correspond.</p> : null}
          <div className="galerie">
            {visibles.map((c) => (
              <Carte key={c.slug} c={c} ouvrir={() => setOuverte(c.slug)} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
