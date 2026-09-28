/**
 * Numériseur : relever les valeurs d'un graphique à partir de son image. Deux modes :
 * courbes XY (étalonnage des axes, relevé automatique par couleur, points modifiables) et
 * carte de couleurs (légende étalonnée, coupes, moyennes sur un maillage). Un projet =
 * `numeriseur/<nom>.json` et son image, dans l'espace.
 */
import { useCallback, useEffect, useState } from "react";
import { Message, Page } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { lireProjet } from "../core/projet";
import { chargerImage } from "./charger";
import { useNumeriseur } from "./etat";
import { exempleCarte, exempleCourbes } from "./exemples";
import { EXTENSIONS } from "./image";
import { PanneauAxes } from "./PanneauAxes";
import { PanneauCarte } from "./PanneauCarte";
import { PanneauCourbes } from "./PanneauCourbes";
import { Visionneuse } from "./Visionneuse";
import "./numeriseur.css";

const DOSSIER = "numeriseur";
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "image";

export function NumeriseurPage() {
  const ctx = useContexte();
  const s = useNumeriseur();
  const [liste, setListe] = useState<string[]>([]);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    const fs = ctx.espace?.fichiers;
    if (!fs) return;
    let actif = true;
    fs.listDir(DOSSIER).then(
      (e) => actif && setListe(e.filter((x) => x.kind === "file" && x.name.endsWith(".json")).map((x) => x.name.slice(0, -5)).sort()),
      () => actif && setListe([]),
    );
    return () => {
      actif = false;
    };
  }, [ctx.espace, ctx.revision, tour]);

  const charger = useCallback(async (octets: Uint8Array, ext: string, nom: string) => {
    try {
      await chargerImage(octets, ext, slug(nom));
    } catch (e) {
      useNumeriseur.getState().signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }, []);

  // Ctrl+V : une capture d'écran (graphique d'un article, d'un PDF)
  useEffect(() => {
    const coller = (ev: ClipboardEvent) => {
      if ((ev.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const f = [...(ev.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (!f) return;
      ev.preventDefault();
      void f.arrayBuffer().then((b) => charger(new Uint8Array(b), f.type.split("/")[1] ?? "png", `capture-${new Date().toISOString().slice(0, 10)}`));
    };
    window.addEventListener("paste", coller);
    return () => window.removeEventListener("paste", coller);
  }, [charger]);

  async function ouvrirImage() {
    const f = await ctx.plateforme.ouvrirFichier("Image d'un graphique", EXTENSIONS);
    if (f) await charger(f.octets, f.nom.split(".").pop() ?? "png", f.nom.replace(/\.[^.]+$/, ""));
  }

  async function ouvrirProjet(nom: string) {
    const fs = ctx.espace!.fichiers;
    try {
      const projet = lireProjet(await fs.readText(`${DOSSIER}/${nom}.json`));
      const octets = await fs.readBytes(`${DOSSIER}/${projet.image}`);
      await chargerImage(octets, projet.image.split(".").pop() ?? "png", nom, projet);
    } catch (e) {
      s.signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  async function enregistrer() {
    if (!s.image) return;
    if (!ctx.espace) return s.signaler("Aucun espace ouvert : exporter les points en CSV.", "attention");
    const fs = ctx.espace.fichiers;
    const nom = slug(s.nom);
    const image = `${nom}.${s.image.ext}`;
    await fs.ensureDir(DOSSIER);
    await fs.writeBytesAtomic(`${DOSSIER}/${image}`, s.image.octets);
    await fs.writeTextAtomic(`${DOSSIER}/${nom}.json`, JSON.stringify({ ...s.projet, image }, null, 1) + "\n");
    useNumeriseur.setState({ nom, modifie: false, projet: { ...s.projet, image } });
    s.signaler(`Projet enregistré : ${DOSSIER}/${nom}.json et son image.`);
    setTour((t) => t + 1);
  }

  async function exemple(quoi: string) {
    useNumeriseur.setState((x) => ({ projet: { ...x.projet, mode: quoi === "carte" ? "carte" : "courbe" } }));
    await charger(quoi === "carte" ? await exempleCarte() : await exempleCourbes(), "png", quoi === "carte" ? "exemple-carte" : "exemple-courbes");
  }

  return (
    <Page
      titre="Numériseur"
      sousTitre="Relever les valeurs d'un graphique ou d'une carte de couleurs à partir de son image"
      actions={
        <>
          <button type="button" onClick={() => void ouvrirImage()}>
            Ouvrir une image…
          </button>
          <select
            className="champ"
            value=""
            aria-label="Ouvrir un projet ou un exemple"
            onChange={(ev) => {
              const v = ev.target.value;
              if (v.startsWith("ex:")) void exemple(v.slice(3));
              else if (v) void ouvrirProjet(v);
            }}
          >
            <option value="">Ouvrir…</option>
            {ctx.espace && liste.length ? (
              <optgroup label="Projets enregistrés">
                {liste.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Exemples">
              <option value="ex:courbes">Graphique à deux séries</option>
              <option value="ex:carte">Carte de pression d'un pneu</option>
            </optgroup>
          </select>
          <input className="champ" style={{ width: "16ch" }} value={s.nom} aria-label="Nom du projet" placeholder="nom du projet" onChange={(ev) => useNumeriseur.setState({ nom: ev.target.value, modifie: true })} />
          <button type="button" className="principal" style={{ whiteSpace: "nowrap" }} disabled={!s.image} onClick={() => void enregistrer()}>
            Enregistrer{s.modifie ? " *" : ""}
          </button>
        </>
      }
    >
      {s.message ? <Message niveau={s.message.niveau}>{s.message.texte}</Message> : null}
      <div
        className="nm-corps"
        onDrop={(ev) => {
          ev.preventDefault();
          const f = [...ev.dataTransfer.files].find((x) => x.type.startsWith("image/"));
          if (f) void f.arrayBuffer().then((b) => charger(new Uint8Array(b), f.name.split(".").pop() ?? "png", f.name.replace(/\.[^.]+$/, "")));
        }}
      >
        <Visionneuse />
        <aside className="nm-panneau">
          <div className="nm-modes" role="tablist" aria-label="Mode">
            {(
              [
                ["courbe", "Courbes XY"],
                ["carte", "Carte de couleurs"],
              ] as const
            ).map(([m, l]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={s.projet.mode === m}
                className={s.projet.mode === m ? "actif" : undefined}
                onClick={() => {
                  s.maj((p) => (p.mode = m));
                  s.choisirOutil(null);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <PanneauAxes />
          {s.projet.mode === "courbe" ? <PanneauCourbes /> : <PanneauCarte />}
        </aside>
      </div>
    </Page>
  );
}
