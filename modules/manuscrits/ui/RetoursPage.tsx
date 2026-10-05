/**
 * Corrections reçues : un `.docx` relu (commentaires, modifications suivies) ou un PDF annoté.
 * Le fichier est copié dans l'espace avec ses remarques extraites ; chaque remarque a un état
 * (à traiter, traitée, refusée) partagé entre les deux PC. Au même endroit que les versions.
 */
import { useEffect, useMemo, useState } from "react";
import { Message, Pastille } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { isoAvecDecalage } from "@noyau/dates";
import { absolu } from "@noyau/stockage";
import { remarquesDocx, auteursDe, bilan, dossierRetour, ETATS_REMARQUE, idRetour, LIBELLE_GENRE, modifierRemarque, nomFichierSur, partieProbable, remarquesPdf, typeDe, type EtatRemarque, type Remarque, type Retour } from "../core/retours";
import { empreinte } from "../core/versions";
import { chargerVersions, enregistrerRetour, majRetour, retirerRetour, type VersionLue } from "./donnees";
import { annotationsPdf } from "./extrairePdf";
import type { ManuscritCourant } from "./useManuscrit";

interface Brouillon {
  nom: string;
  type: "docx" | "pdf";
  octets: Uint8Array;
  remarques: Remarque[];
  de: string;
  auteurs: string[];
  recu: string;
  partie: string;
  base: string;
  note: string;
}

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
const dateHeure = (s: string) => (s ? new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${n.toLocaleString("fr-FR")} ${n > 1 ? plusieurs : un}`;
const LIMITE = 300;

export function RetoursPage({ ms, retours, setRetours, partieInitiale }: { ms: ManuscritCourant; retours: Retour[]; setRetours(r: Retour[]): void; partieInitiale: string }) {
  const ctx = useContexte();
  const espace = ctx.espace!;
  const { projet, m } = ms;
  const [partie, setPartie] = useState(partieInitiale);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [versions, setVersions] = useState<VersionLue[]>([]);
  const [message, setMessage] = useState<{ niveau: "info" | "attention" | "erreur"; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  // Versions de la partie choisie, pour dire sur laquelle portent les corrections.
  const partieBrouillon = brouillon?.partie ?? "";
  useEffect(() => {
    if (!projet || !m || !partieBrouillon) return;
    const p = m.parties.find((x) => x.id === partieBrouillon);
    if (!p) return;
    let annule = false;
    chargerVersions(espace.fichiers, projet, p.id, p.source.split(/[:/]/).pop() ?? "")
      .then((v) => !annule && setVersions(v))
      .catch(() => !annule && setVersions([]));
    return () => {
      annule = true;
    };
  }, [espace, projet, m, partieBrouillon]);

  const visibles = useMemo(() => retours.filter((r) => !partie || (partie === "-" ? r.partie === null : r.partie === partie)), [retours, partie]);

  if (!projet || !m) return <Message niveau="attention">Créez d'abord le manuscrit (onglet Plan) : les retours sont rangés avec lui.</Message>;
  const nomPartie = (id: string | null) => (id ? (m.parties.find((p) => p.id === id)?.nom ?? id) : "Manuscrit entier / non précisé");

  async function choisir() {
    setMessage(null);
    const f = await ctx.plateforme.ouvrirFichier("Corrections reçues (.docx relu ou PDF annoté)", ["docx", "pdf"]);
    if (!f) return;
    const type = typeDe(f.nom);
    if (!type) return setMessage({ niveau: "erreur", texte: "Seuls les fichiers .docx et .pdf sont lus." });
    setOccupe(true);
    try {
      const remarques = type === "docx" ? remarquesDocx(f.octets).remarques : remarquesPdf(await annotationsPdf(f.octets));
      const auteurs = auteursDe(remarques);
      setBrouillon({
        nom: nomFichierSur(f.nom),
        type,
        octets: f.octets,
        remarques,
        de: auteurs[0] ?? "",
        auteurs,
        recu: aujourdhui(),
        partie: partieProbable(f.nom, m!.parties) ?? (partie && partie !== "-" ? partie : ""),
        base: "",
        note: "",
      });
      if (!remarques.length) {
        setMessage({
          niveau: "attention",
          texte:
            type === "docx"
              ? "Aucun commentaire ni modification suivie dans ce fichier (le suivi des modifications était-il activé ?). Il peut quand même être rangé."
              : "Aucune annotation lisible dans ce PDF (texte surligné, notes, commentaires). Il peut quand même être rangé.",
        });
      }
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Lecture impossible : ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrer() {
    if (!brouillon || !projet) return;
    setOccupe(true);
    try {
      const id = idRetour(brouillon.recu, brouillon.de, brouillon.partie || null, new Set(retours.map((r) => r.id)));
      const r: Retour = {
        id,
        partie: brouillon.partie || null,
        de: brouillon.de.trim(),
        recu: brouillon.recu,
        note: brouillon.note.trim(),
        fichier: brouillon.nom,
        type: brouillon.type,
        taille: brouillon.octets.length,
        empreinte: empreinte(brouillon.octets),
        base: brouillon.base,
        ajoute: isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()),
        poste: ctx.poste,
        remarques: brouillon.remarques,
      };
      await enregistrerRetour(espace.fichiers, projet, r, brouillon.octets);
      setRetours([r, ...retours].sort((a, b) => (a.recu === b.recu ? (a.id < b.id ? 1 : -1) : a.recu < b.recu ? 1 : -1)));
      setBrouillon(null);
      setMessage({ niveau: "info", texte: `Retour rangé : ${pluriel(r.remarques.length, "remarque")} lue${r.remarques.length > 1 ? "s" : ""} (${r.fichier}).` });
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Enregistrement impossible : ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setOccupe(false);
    }
  }

  async function maj(r: Retour) {
    setRetours(retours.map((x) => (x.id === r.id ? r : x)));
    try {
      await majRetour(espace.fichiers, projet!, r);
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Non enregistré : ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  async function retirer(r: Retour) {
    if (!window.confirm(`Retirer le retour de ${r.de || "?"} (${r.fichier}) ? Il est rangé dans retours/.supprimes, rien n'est effacé.`)) return;
    try {
      await retirerRetour(espace.fichiers, projet!, r.id);
      setRetours(retours.filter((x) => x.id !== r.id));
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Retrait impossible : ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const chemin = (r: Retour) => `${dossierRetour(projet!, r.id)}/${r.fichier}`;

  return (
    <>
      <div className="rangee ms-barre">
        <select className="champ" value={partie} onChange={(e) => setPartie(e.target.value)} aria-label="Partie">
          <option value="">Toutes les parties</option>
          {m.parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
          <option value="-">Sans partie précisée</option>
        </select>
        <button type="button" className="principal" disabled={occupe} onClick={() => void choisir()}>
          Ajouter un retour reçu…
        </button>
        <span className="discret petit">
          Un fichier Word relu (commentaires, modifications suivies) ou un PDF annoté. Il est copié ici, avec ses remarques.
        </span>
      </div>
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}

      {brouillon ? (
        <div className="carte ms-brouillon">
          <p>
            <strong>{brouillon.nom}</strong> — {brouillon.type === "docx" ? "document Word" : "PDF annoté"} : <strong>{pluriel(brouillon.remarques.length, "remarque")}</strong> lue
            {brouillon.remarques.length > 1 ? "s" : ""}
            {brouillon.auteurs.length ? ` (${brouillon.auteurs.join(", ")})` : ""}.
          </p>
          <div className="ms-formulaire">
            <label>
              De
              <input type="text" list="ms-auteurs" value={brouillon.de} onChange={(e) => setBrouillon({ ...brouillon, de: e.target.value })} placeholder="Qui a envoyé ces corrections" />
              <datalist id="ms-auteurs">
                {brouillon.auteurs.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
            <label>
              Reçu le
              <input type="date" value={brouillon.recu} onChange={(e) => setBrouillon({ ...brouillon, recu: e.target.value })} />
            </label>
            <label>
              Partie
              <select className="champ" value={brouillon.partie} onChange={(e) => setBrouillon({ ...brouillon, partie: e.target.value, base: "" })}>
                <option value="">Manuscrit entier / non précisé</option>
                {m.parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Porte sur la version
              <select className="champ" value={brouillon.base} onChange={(e) => setBrouillon({ ...brouillon, base: e.target.value })} disabled={!brouillon.partie}>
                <option value="">Inconnue</option>
                {versions.map((v) => (
                  <option key={`${v.dossier}/${v.fichier}`} value={v.fichier}>
                    {v.date ? dateHeure(v.date) : v.fichier}
                    {v.note ? ` — ${v.note}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="ms-large">
              Note
              <input type="text" value={brouillon.note} onChange={(e) => setBrouillon({ ...brouillon, note: e.target.value })} placeholder="Facultative : « relecture du chapitre avant le comité »…" />
            </label>
          </div>
          <div className="rangee">
            <button type="button" className="principal" disabled={occupe} onClick={() => void enregistrer()}>
              Ranger ce retour
            </button>
            <button type="button" onClick={() => setBrouillon(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {visibles.length === 0 && !brouillon ? (
        <div className="carte">
          <p>{retours.length ? "Aucun retour pour cette partie." : "Aucun retour reçu pour l'instant."}</p>
          <p className="discret">
            « Ajouter un retour reçu… » prend le fichier de vos relecteurs où qu'il soit : il est copié dans <code>manuscrits/{projet}/retours/</code>, au même endroit sur les deux PC,
            avec ses commentaires et modifications suivies (ou les annotations d'un PDF).
          </p>
        </div>
      ) : null}

      {visibles.map((r) => (
        <CarteRetour
          key={r.id}
          r={r}
          partie={nomPartie(r.partie)}
          maj={(x) => void maj(x)}
          retirer={() => void retirer(r)}
          ouvrir={() => void ctx.plateforme.ouvrirDossier(absolu(espace.racine, chemin(r)))}
          copieSous={async () => ctx.plateforme.enregistrerSous(r.fichier, await espace.fichiers.readBytes(chemin(r)))}
        />
      ))}
    </>
  );
}

function CarteRetour({ r, partie, maj, retirer, ouvrir, copieSous }: { r: Retour; partie: string; maj(r: Retour): void; retirer(): void; ouvrir(): void; copieSous(): void | Promise<unknown> }) {
  const b = bilan(r);
  const [filtre, setFiltre] = useState<"a-traiter" | "toutes">(b["a-traiter"] ? "a-traiter" : "toutes");
  const [tout, setTout] = useState(false);
  const lignes = r.remarques.filter((x) => filtre === "toutes" || x.etat === "a-traiter");
  const montrees = tout ? lignes : lignes.slice(0, LIMITE);

  return (
    <section className="ms-partie">
      <div className="ms-partie-tete">
        <div className="ms-titre">
          <h2 title={r.fichier}>
            {r.de || "Expéditeur inconnu"} — {partie}
          </h2>
          <div className="discret petit">
            Reçu le {dateFr(r.recu)} · {r.fichier} · {r.type === "docx" ? "Word" : "PDF"}
            {r.base ? ` · sur la version ${r.base.replace(/\.docx$/, "")}` : ""}
            {r.note ? ` · ${r.note}` : ""}
          </div>
        </div>
        <Pastille niveau={b["a-traiter"] ? "attention" : "ok"}>{b["a-traiter"] ? `${pluriel(b["a-traiter"], "remarque")} à traiter` : "tout traité"}</Pastille>
      </div>
      <div className="ms-mesures">
        <span className="discret">
          {pluriel(b.total, "remarque")} · {b.traitee} traitée{b.traitee > 1 ? "s" : ""} · {b.refusee} refusée{b.refusee > 1 ? "s" : ""}
        </span>
        <button type="button" onClick={ouvrir} title="Ouvre la copie dans Word ou dans votre lecteur PDF">
          Ouvrir le fichier
        </button>
        <button type="button" onClick={() => void copieSous()}>
          Copie sous…
        </button>
        {b["a-traiter"] ? (
          <button type="button" onClick={() => window.confirm(`Marquer les ${b["a-traiter"]} remarques comme traitées ?`) && maj({ ...r, remarques: r.remarques.map((x) => (x.etat === "a-traiter" ? { ...x, etat: "traitee" } : x)) })}>
            Tout marquer traité
          </button>
        ) : null}
        <select className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} aria-label="Remarques affichées">
          <option value="a-traiter">À traiter</option>
          <option value="toutes">Toutes</option>
        </select>
        <button type="button" className="lien" onClick={retirer}>
          Retirer
        </button>
      </div>
      {lignes.length ? (
        <>
          <table className="tableau ms-remarques">
            <thead>
              <tr>
                <th>État</th>
                <th>De</th>
                <th>Où</th>
                <th>Passage</th>
                <th>Remarque</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {montrees.map((x) => (
                <tr key={x.id} className={x.etat === "a-traiter" ? undefined : "lue"}>
                  <td>
                    <select className="champ" value={x.etat} onChange={(e) => maj(modifierRemarque(r, x.id, { etat: e.target.value as EtatRemarque }))} aria-label="État de la remarque">
                      {ETATS_REMARQUE.map(([id, nom]) => (
                        <option key={id} value={id}>
                          {nom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="nowrap">
                    {x.auteur || "—"}
                    {x.date ? <div className="discret petit">{dateHeure(x.date)}</div> : null}
                  </td>
                  <td>
                    {x.page !== null ? `p. ${x.page}` : x.titre || "—"}
                    <div className="discret petit">{LIBELLE_GENRE[x.genre]}</div>
                  </td>
                  <td className="discret petit">{x.ancre}</td>
                  <td>{x.texte || <span className="discret">—</span>}</td>
                  <td>
                    <input
                      type="text"
                      defaultValue={x.note}
                      placeholder="Note"
                      aria-label="Note de traitement"
                      onBlur={(e) => e.target.value !== x.note && maj(modifierRemarque(r, x.id, { note: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lignes.length > montrees.length ? (
            <button type="button" onClick={() => setTout(true)}>
              Afficher les {lignes.length - montrees.length} suivantes
            </button>
          ) : null}
        </>
      ) : r.remarques.length === 0 ? (
        <p className="discret">Aucune remarque lue dans ce fichier.</p>
      ) : (
        <p className="discret">Tout est traité. « Toutes » affiche les {r.remarques.length} remarques.</p>
      )}
    </section>
  );
}
