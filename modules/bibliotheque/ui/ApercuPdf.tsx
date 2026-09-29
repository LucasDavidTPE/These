/**
 * Aperçu de la première page du PDF d'une référence. L'image est gardée dans l'espace
 * (`bibliotheque/apercus/<id>.png`) : elle s'affiche tout de suite, sur l'un ou l'autre PC, et
 * n'est refaite que si le PDF a changé (autre nom ou autre contenu). Clic : ouvre le PDF.
 */
import { useEffect, useState } from "react";
import { absolu } from "@noyau/stockage";
import { useContexte } from "@interface/contexte";
import { DOSSIER_APERCUS, empreintePdf, lireInfoApercu, type InfoApercu } from "../core/pdf";
import { premierePagePng } from "./apercuPdf";

function versUrl(octets: Uint8Array): string {
  let b = "";
  for (let i = 0; i < octets.length; i += 0x8000) b += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(b)}`;
}

export function ApercuPdf({ id, fichierPdf }: { id: string; fichierPdf: string }) {
  const ctx = useContexte();
  const racine = ctx.racines["biblio-pdf"];
  const espace = ctx.espace?.fichiers;
  const [url, setUrl] = useState<string | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    if (!espace || !racine || !fichierPdf) return;
    let annule = false;
    const png = `${DOSSIER_APERCUS}/${id}.png`;
    const json = `${DOSSIER_APERCUS}/${id}.json`;
    (async () => {
      let info: InfoApercu | null = null;
      if (tour === 0 && (await espace.exists(png)) && (await espace.exists(json))) {
        info = lireInfoApercu(JSON.parse(await espace.readText(json)));
        const octets = await espace.readBytes(png);
        if (!annule) setUrl(versUrl(octets));
      }
      const pdfs = ctx.plateforme.fichiers(racine);
      if (!(await pdfs.exists(fichierPdf))) {
        if (!annule) setEtat(info ? null : "PDF absent de ce poste (pas encore synchronisé ?).");
        return;
      }
      const octets = await pdfs.readBytes(fichierPdf);
      const empreinte = empreintePdf(octets);
      if (info && info.pdf === fichierPdf && info.empreinte === empreinte) return;
      if (!annule) setEtat("Aperçu en cours…");
      const image = await premierePagePng(octets);
      await espace.ensureDir(DOSSIER_APERCUS);
      await espace.writeBytesAtomic(png, image);
      await espace.writeTextAtomic(json, JSON.stringify({ pdf: fichierPdf, empreinte } satisfies InfoApercu) + "\n");
      if (!annule) {
        setUrl(versUrl(image));
        setEtat(null);
      }
    })().catch((e: unknown) => !annule && setEtat(`Aperçu impossible : ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      annule = true;
    };
    // `ctx` change à chaque écriture dans l'espace (dont l'aperçu lui-même) : on ne suit que ce qui compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fichierPdf, racine, espace, tour]);

  if (!fichierPdf) return null;
  return (
    <figure className="apercu-pdf">
      {url ? (
        <button type="button" className="apercu-pdf-page" title={`Ouvrir ${fichierPdf}`} onClick={() => racine && void ctx.plateforme.ouvrirDossier(absolu(racine, fichierPdf))}>
          <img src={url} alt={`Première page de ${fichierPdf}`} />
        </button>
      ) : (
        <div className="apercu-pdf-vide discret petit">{etat ?? "Aperçu…"}</div>
      )}
      <figcaption className="discret petit">
        {url && etat ? `${etat} ` : ""}
        <button type="button" className="lien" title="Refaire l'aperçu depuis le PDF" onClick={() => setTour((t) => t + 1)}>
          actualiser
        </button>
      </figcaption>
    </figure>
  );
}
