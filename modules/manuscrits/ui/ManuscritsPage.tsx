/**
 * Manuscrits : versions datées des .docx (SPEC, ajout). Les fichiers Word restent où ils
 * sont (racine « manuscrits ») ; chaque version est une copie dans l'espace OneDrive.
 */
import { useCallback, useEffect, useState } from "react";
import { Message, Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { isoAvecDecalage } from "@noyau/dates";
import { etat, dossierManuscrit, type Etat, type Version } from "../core/versions";
import { chargerVersions, enregistrerVersion, listerManuscrits } from "./donnees";
import { LatexIndex } from "./LatexIndex";

interface Ligne {
  chemin: string;
  etat: Etat;
  versions: Version[];
}

const ETATS: Record<Etat, [string, "info" | "attention" | "ok"]> = {
  "aucune-version": ["aucune version", "attention"],
  "a-jour": ["à jour", "ok"],
  modifie: ["modifié depuis la dernière version", "attention"],
};

const date = (s: string) => new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mo = (n: number) => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} ko` : `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`);

export function ManuscritsPage() {
  const ctx = useContexte();
  const racine = ctx.reglages.racines.manuscrits;
  const espace = ctx.espace;
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ niveau: "info" | "erreur"; texte: string } | null>(null);
  const [tour, setTour] = useState(0);
  const [vue, setVue] = useState<"word" | "latex">("word");

  useEffect(() => {
    if (!racine || !espace) return;
    let annule = false;
    (async () => {
      const fs = ctx.plateforme.fichiers(racine);
      const r: Ligne[] = [];
      for (const chemin of await listerManuscrits(fs)) {
        const versions = await chargerVersions(espace.fichiers, chemin);
        r.push({ chemin, versions, etat: etat(await fs.readBytes(chemin), versions) });
      }
      if (!annule) setLignes(r);
    })().catch((e: unknown) => !annule && setMessage({ niveau: "erreur", texte: String(e) }));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racine, espace, ctx.revision, tour]);

  const choisir = useCallback(async () => {
    const d = await ctx.plateforme.choisirDossier("Dossier de vos manuscrits Word (.docx)", racine);
    if (d) await ctx.enregistrerReglages({ ...ctx.reglages, racines: { ...ctx.reglages.racines, manuscrits: d } });
  }, [ctx, racine]);

  async function versionner(chemin: string) {
    if (!racine || !espace) return;
    try {
      const octets = await ctx.plateforme.fichiers(racine).readBytes(chemin);
      const v = await enregistrerVersion(espace.fichiers, octets, chemin, notes[chemin] ?? "", ctx.poste, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()));
      setNotes({ ...notes, [chemin]: "" });
      setMessage({ niveau: "info", texte: `Version enregistrée : ${v.fichier}.` });
      setTour((t) => t + 1);
    } catch (e) {
      setMessage({ niveau: "erreur", texte: `Enregistrement impossible (fichier ouvert dans Word ?) : ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  const absolu = (relatif: string) => {
    const sep = espace!.racine.includes("\\") ? "\\" : "/";
    return `${espace!.racine.replace(/[\\/]+$/, "")}${sep}${relatif.split("/").join(sep)}`;
  };

  async function copieSous(chemin: string, v: Version) {
    const octets = await espace!.fichiers.readBytes(`${dossierManuscrit(chemin.split("/").pop()!)}/${v.fichier}`);
    await ctx.plateforme.enregistrerSous(v.fichier, octets);
  }

  if (!espace) return <Page titre="Manuscrits"><Message niveau="erreur">Les versions sont gardées dans l'espace Thèse : ouvrez-en un d'abord.</Message></Page>;

  return (
    <Page
      titre="Manuscrits"
      sousTitre={racine ? <span className="chemin">{racine}</span> : "Versions datées de vos manuscrits Word"}
      actions={
        vue === "word" ? (
          <button type="button" onClick={() => void choisir()}>
            {racine ? "Changer de dossier…" : "Choisir le dossier des manuscrits…"}
          </button>
        ) : null
      }
    >
      <nav className="onglets" aria-label="Manuscrits">
        <button type="button" className={vue === "word" ? "actif" : undefined} onClick={() => setVue("word")}>
          Versions Word
        </button>
        <button type="button" className={vue === "latex" ? "actif" : undefined} onClick={() => setVue("latex")}>
          Sources LaTeX
        </button>
      </nav>
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}
      {vue === "latex" ? (
        <LatexIndex />
      ) : !racine ? (
        <div className="carte">
          <p>Indiquez le dossier où sont vos manuscrits (.docx). Ils restent où ils sont ; chaque version enregistrée est une copie datée, avec une note, dans l'espace OneDrive (<code>manuscrits/</code>), visible depuis les deux PC.</p>
        </div>
      ) : !lignes ? (
        <p className="discret">Lecture…</p>
      ) : lignes.length === 0 ? (
        <p className="discret">Aucun fichier .docx dans ce dossier (ni dans ses sous-dossiers directs).</p>
      ) : (
        lignes.map((l) => (
          <Section key={l.chemin} titre={l.chemin} aDroite={<Pastille niveau={ETATS[l.etat][1]}>{ETATS[l.etat][0]}</Pastille>}>
            <div className="rangee">
              <input type="text" placeholder="Note (facultative) : « envoyé à Sergio », « avant refonte chap. 3 »…" value={notes[l.chemin] ?? ""} onChange={(e) => setNotes({ ...notes, [l.chemin]: e.target.value })} style={{ flex: "1 1 320px" }} />
              <button type="button" className={l.etat === "a-jour" ? undefined : "principal"} onClick={() => void versionner(l.chemin)}>
                Enregistrer une version
              </button>
            </div>
            {l.versions.length ? (
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
                  {l.versions.map((v) => (
                    <tr key={v.fichier}>
                      <td className="nowrap">{v.date ? date(v.date) : v.fichier}</td>
                      <td>{v.note || <span className="discret">—</span>}</td>
                      <td>{v.poste}</td>
                      <td className="nowrap">{mo(v.taille)}</td>
                      <td className="nowrap">
                        <button type="button" title="Ouvrir cette version dans Word (lecture ; enregistrez-la ailleurs pour la modifier)" onClick={() => void ctx.plateforme.ouvrirDossier(absolu(`${dossierManuscrit(l.chemin.split("/").pop()!)}/${v.fichier}`))}>
                          Ouvrir
                        </button>{" "}
                        <button type="button" onClick={() => void copieSous(l.chemin, v)}>
                          Copie sous…
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Section>
        ))
      )}
    </Page>
  );
}
