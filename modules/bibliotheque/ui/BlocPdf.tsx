/**
 * Le PDF d'une référence : on le pointe (boîte « Ouvrir »), il est renommé selon la convention
 * des PDF déjà rangés (`BIB-003_Tielking_1989_Aircraft-tire-….pdf`) dans la racine
 * « biblio-pdf », et son nom est noté dans la fiche (PDF récupéré). Un PDF déjà dans le dossier
 * est renommé sur place ; un PDF pris ailleurs (Téléchargements…) y est copié.
 */
import { useState } from "react";
import { useContexte } from "@interface/contexte";
import type { Reference } from "../core/modele";
import { dansRacine, nomPdf } from "../core/pdf";

export function BlocPdf({ id, r, maj }: { id: string; r: Reference; maj(p: Partial<Reference>): void }) {
  const ctx = useContexte();
  const racine = ctx.reglages.racines["biblio-pdf"];
  const propose = nomPdf(id, r);
  const [saisi, setSaisi] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean } | null>(null);
  const cible = (() => {
    const n = (saisi ?? propose).trim().replace(/[\\/:*?"<>|]/g, "-");
    return n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`;
  })();
  const sansDossier = "Déclarez d'abord le dossier des PDF (racine « biblio-pdf ») dans les réglages du poste.";

  async function pointer() {
    if (!racine) return setMessage({ texte: sansDossier, erreur: true });
    const f = await ctx.plateforme.ouvrirFichier("PDF de la référence", ["pdf"]);
    if (!f) return;
    try {
      const fs = ctx.plateforme.fichiers(racine);
      const rel = f.chemin ? dansRacine(f.chemin, racine) : null;
      if (rel === cible) {
        maj({ fichierPdf: cible });
        return setMessage({ texte: `PDF déjà rangé sous ce nom : ${cible}.` });
      }
      if ((await fs.exists(cible)) && !window.confirm(`« ${cible} » existe déjà dans le dossier des PDF. Le remplacer ?`)) return;
      if (rel && !(await fs.exists(cible))) {
        await fs.rename(rel, cible);
        setMessage({ texte: `PDF renommé dans le dossier : ${rel} → ${cible}.` });
      } else {
        await fs.writeBytesAtomic(cible, f.octets);
        setMessage({ texte: `PDF copié dans le dossier sous le nom ${cible}${f.chemin ? " (l'original n'est pas touché)" : ""}.` });
      }
      maj({ fichierPdf: cible });
      setSaisi(null);
    } catch (e) {
      setMessage({ texte: `PDF non rangé : ${e instanceof Error ? e.message : String(e)}`, erreur: true });
    }
  }

  async function renommer() {
    if (!racine) return setMessage({ texte: sansDossier, erreur: true });
    try {
      await ctx.plateforme.fichiers(racine).rename(r.fichierPdf, cible);
      maj({ fichierPdf: cible });
      setMessage({ texte: `PDF renommé : ${cible}.` });
      setSaisi(null);
    } catch (e) {
      setMessage({ texte: `Renommage impossible : ${e instanceof Error ? e.message : String(e)}`, erreur: true });
    }
  }

  const aRenommer = r.fichierPdf && r.fichierPdf !== cible;
  return (
    <div className={`bloc-pdf${r.fichierPdf ? "" : " bloc-pdf-manquant"}`}>
      <div className="rangee">
        <strong>PDF</strong>
        {r.fichierPdf ? <span className="discret">{r.fichierPdf}</span> : <span>Pas encore de PDF : pointez-le, il sera renommé et rangé avec les autres.</span>}
      </div>
      <div className="rangee">
        <label className="libelle bloc-pdf-nom">
          <span>Nom selon la convention (modifiable)</span>
          <input className="champ" value={saisi ?? propose} onChange={(e) => setSaisi(e.target.value)} spellCheck={false} />
        </label>
        <button type="button" className={r.fichierPdf ? undefined : "principal"} onClick={() => void pointer()}>
          {r.fichierPdf ? "Remplacer le PDF…" : "Pointer le PDF…"}
        </button>
        {aRenommer ? (
          <button type="button" onClick={() => void renommer()} title={`${r.fichierPdf} → ${cible}`}>
            Renommer selon la convention
          </button>
        ) : null}
        {saisi !== null ? (
          <button type="button" className="lien" onClick={() => setSaisi(null)}>
            nom proposé
          </button>
        ) : null}
      </div>
      {!r.auteurs || !r.annee || r.titre === "Nouvelle référence" ? <p className="discret petit">Le nom se complète avec les auteurs, l'année et le titre (remplissez-les d'abord, ou par le DOI).</p> : null}
      {message ? <p className={message.erreur ? "erreur-texte petit" : "discret petit"}>{message.texte}</p> : null}
    </div>
  );
}
