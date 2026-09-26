/**
 * Module Campagnes (SPEC §8) : galerie des campagnes, fiche, essais découverts dans les
 * données brutes, carnet de notes et d'images. Remplace le tableau de bord de these-lgcb.
 */
import { useEffect, useMemo, useState } from "react";
import { resoudre, referenceDepuisChemin } from "@noyau/poste/racines";
import { Message, Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { IconeDossier } from "@interface/icones";
import { decouvrir } from "../core/decouverte";
import { lireEssai, nouvelleCampagne, periode, periodeLisible, STATUTS, TYPES, typeDe, type Campagne, type Essai } from "../core/modele";
import { depuisLgcb } from "../core/toml";
import { ajouterImage, ajouterNote, chargerCampagnes, creerCampagne, enregistrerCampagne, enregistrerEssai, type CampagneChargee } from "./donnees";
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
              </>
            ) : null}
            {ctx.registre.aModule("traitement") && k.type === "module-complexe" ? (
              <button type="button" onClick={() => ctx.naviguer("traitement")}>
                Traitement 2S2P1D
              </button>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

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
  const [ouverte, setOuverte] = useState<string | null>(null);
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

  const triees = useMemo(
    () => [...(etat ?? [])].sort((a, b) => ((periode(Object.values(b.essais), b.campagne)?.debut ?? "") > (periode(Object.values(a.essais), a.campagne)?.debut ?? "") ? 1 : -1)),
    [etat],
  );
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
        <div className="galerie">
          {triees.map((c) => (
            <Carte key={c.slug} c={c} ouvrir={() => setOuverte(c.slug)} />
          ))}
        </div>
      )}
    </Page>
  );
}
