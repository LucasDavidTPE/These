/** Présentations : Markdown → .pptx, avec des modèles (couleurs, polices, pied de page) qu'on crée soi-même. */
import { useEffect, useMemo, useState } from "react";
import { Message, Section } from "@interface/composants";
import { resoudreCitations, type CitationsResolues } from "@interface/citations";
import { useContexte } from "@interface/contexte";
import { slugifier } from "@noyau/texte";
import { slugModele, trouverModele, type ModelePresentation } from "../core/modele";
import { citerPresentation, clesDePresentation } from "../core/citer";
import { construirePptx } from "../core/pptx";
import { analyserPresentation, avecModele, EXEMPLE_PRESENTATION, type MiseEnPage } from "../core/presentation";
import { chargerModeles, enregistrerModele, enregistrerPresentation, listerPresentations, resoudreImages } from "./presentations";

const MISES: Record<MiseEnPage, string> = { titre: "Titre", section: "Section", contenu: "Contenu", figure: "Figure", "deux-colonnes": "Deux colonnes", references: "Références" };
const COULEURS: [keyof ModelePresentation["couleurs"], string][] = [
  ["fond", "Fond"],
  ["titre", "Titres"],
  ["texte", "Texte"],
  ["accent", "Accent"],
  ["discret", "Discret"],
];

export function PresentationsPage() {
  const ctx = useContexte();
  const fs = ctx.espace!.fichiers;
  const [noms, setNoms] = useState<string[]>([]);
  const [nom, setNom] = useState("");
  const [texte, setTexte] = useState(EXEMPLE_PRESENTATION);
  const [modifie, setModifie] = useState(false);
  const [modeles, setModeles] = useState<ModelePresentation[]>([]);
  const [edition, setEdition] = useState<ModelePresentation | null>(null);
  const [message, setMessage] = useState<{ niveau: "info" | "attention" | "erreur"; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [aide, setAide] = useState(false);

  useEffect(() => {
    let annule = false;
    void Promise.all([listerPresentations(fs), chargerModeles(fs)]).then(([n, m]) => {
      if (annule) return;
      setNoms(n);
      setModeles(m);
    });
    return () => {
      annule = true;
    };
  }, [fs, ctx.revision]);

  const p = useMemo(() => analyserPresentation(texte), [texte]);
  const modele = trouverModele(modeles, p.modele);
  const cles = clesDePresentation(p).join(",");
  const [cit, setCit] = useState<CitationsResolues | null>(null);
  useEffect(() => {
    let annule = false;
    const t = setTimeout(() => void resoudreCitations(ctx, cles ? cles.split(",") : []).then((r) => !annule && setCit(r)), 300);
    return () => {
      annule = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cles, ctx.revision]);
  const cite = cles && cit?.actives ? citerPresentation(p, cit.refs) : null;
  const rendu = cite?.presentation ?? p;

  function signaler(niveau: "info" | "attention" | "erreur", t: string) {
    setMessage({ niveau, texte: t });
  }

  async function ouvrir(n: string) {
    try {
      setTexte(await fs.readText(`presentations/${n}.md`));
      setNom(n);
      setModifie(false);
      setMessage(null);
    } catch (e) {
      signaler("erreur", e instanceof Error ? e.message : String(e));
    }
  }

  async function enregistrer() {
    const n = nom || slugifier(p.titre) || "presentation";
    try {
      await enregistrerPresentation(fs, n, texte);
      setNom(n);
      setModifie(false);
      signaler("info", `Enregistrée : presentations/${n}.md`);
      ctx.rafraichir();
    } catch (e) {
      signaler("erreur", e instanceof Error ? e.message : String(e));
    }
  }

  async function exporter() {
    setOccupe(true);
    try {
      const { images, manquantes } = await resoudreImages(ctx, rendu);
      const octets = construirePptx(rendu, modele, images);
      const fichier = `${nom || slugifier(p.titre) || "presentation"}.pptx`;
      const ok = await ctx.plateforme.enregistrerSous(fichier, octets);
      if (ok) signaler(manquantes.length ? "attention" : "info", manquantes.length ? `Exportée, mais ${manquantes.length} image(s) introuvable(s) : ${manquantes.join(", ")}` : `Exportée : ${rendu.diapos.length} diapos, modèle « ${modele.nom} »${cite?.citees.length ? `, ${cite.citees.length} référence(s) citée(s)` : ""}.${cite?.inconnues.length ? ` Clés inconnues laissées telles quelles : ${cite.inconnues.join(", ")}.` : ""}`);
    } catch (e) {
      signaler("erreur", e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  }

  async function sauverModele() {
    if (!edition) return;
    try {
      await enregistrerModele(fs, edition);
      setTexte((t) => avecModele(t, slugModele(edition.nom)));
      setModifie(true);
      setEdition(null);
      signaler("info", `Modèle « ${edition.nom} » enregistré (presentations/modeles/) et appliqué.`);
      ctx.rafraichir();
    } catch (e) {
      signaler("erreur", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}
      <div className="rangee">
        <select className="champ" aria-label="Ouvrir une présentation" value="" onChange={(e) => e.target.value && void ouvrir(e.target.value)}>
          <option value="">{noms.length ? "Ouvrir…" : "Aucune présentation enregistrée"}</option>
          {noms.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setTexte(EXEMPLE_PRESENTATION);
            setNom("");
            setModifie(true);
          }}
        >
          Nouvelle (exemple)
        </button>
        <button type="button" className="principal" onClick={() => void enregistrer()}>
          Enregistrer{modifie ? " *" : ""}
        </button>
        <button type="button" className="principal" disabled={occupe || p.diapos.length === 0} onClick={() => void exporter()}>
          Exporter en .pptx…
        </button>
        <button type="button" aria-pressed={aide} onClick={() => setAide((v) => !v)}>
          Syntaxe
        </button>
      </div>
      {aide ? (
        <div className="carte">
          <p className="discret">Une diapo par section séparée par <code>---</code>. La première section, faite de lignes « clé: valeur » (<code>titre</code>, <code>auteur</code>, <code>date</code>, <code>modèle</code>), donne la diapo de titre.</p>
          <pre className="chemin" style={{ whiteSpace: "pre-wrap" }}>{`# Titre de la diapo            ## Sous-titre (diapo de titre ou de section)
- puce, puis deux espaces par niveau     **gras**   *italique*
![Légende](figure:FIG-0001)     une figure de la bibliothèque (identifiant)
![Légende](chemin/dans/l-espace.png)     ou une image de l'espace
|||                              sépare deux colonnes
Source: Huang 2004               ligne de source en bas de diapo
mise-en-page: figure             titre | section | contenu | figure | deux-colonnes (sinon déduite)
[@BIB-020]  [@BIB-065, p. 12; @BIB-020]   citation de la Bibliothèque → (Burmister, 1945, p. 12 ; …)
références: non                  (en-tête) pas de diapo Références à la fin`}</pre>
          <p className="discret">Les équations écrites <code>$$…$$</code> sont posées en texte (LaTeX brut) ; pour une équation soignée, mettez-la dans une figure. Les textes restent modifiables dans PowerPoint, les figures sont des images.</p>
        </div>
      ) : null}

      <div className="pres-colonnes">
        <div>
          <textarea className="champ pres-editeur" aria-label="Texte de la présentation" spellCheck={false} value={texte} onChange={(e) => (setTexte(e.target.value), setModifie(true))} />
        </div>
        <div>
          <Section titre={`${rendu.diapos.length} diapo${rendu.diapos.length > 1 ? "s" : ""}`}>
            <ol className="pres-plan">
              {rendu.diapos.map((d, i) => (
                <li key={i}>
                  <span className="discret">{MISES[d.mise]}</span> {d.titre || <span className="discret">(sans titre)</span>}
                </li>
              ))}
            </ol>
            {cles && cit ? (
              <p className="discret petit">
                {!cit.actives
                  ? "Citations [@…] coupées (Bibliothèque) : elles restent telles qu'écrites."
                  : `Citations : ${cite?.citees.length ?? 0} référence(s) de la Bibliothèque${p.references ? ", diapo Références à la fin" : ""}.${cite?.inconnues.length ? ` Inconnues : ${cite.inconnues.join(", ")}.` : ""}`}
              </p>
            ) : null}
          </Section>
          <Section titre="Modèle">
            <div className="rangee">
              <select className="champ" aria-label="Modèle" value={slugModele(modele.nom)} onChange={(e) => (setTexte((t) => avecModele(t, e.target.value)), setModifie(true))}>
                {modeles.map((m) => (
                  <option key={m.nom} value={slugModele(m.nom)}>
                    {m.nom}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setEdition({ ...modele, nom: `${modele.nom} (copie)` })}>
                Nouveau modèle depuis celui-ci…
              </button>
            </div>
            <div className="pres-echantillon" style={{ background: `#${modele.couleurs.fond}`, color: `#${modele.couleurs.texte}`, fontFamily: modele.polices.texte }}>
              <strong style={{ color: `#${modele.couleurs.titre}`, fontFamily: modele.polices.titre }}>Titre de diapo</strong>
              <div style={{ height: 3, width: 48, background: `#${modele.couleurs.accent}`, margin: "4px 0" }} />
              <span>• Un texte, une puce</span>
              <span style={{ color: `#${modele.couleurs.discret}`, fontSize: 11 }}>{modele.pied || "Pied de page"}</span>
            </div>
          </Section>
        </div>
      </div>

      {edition ? (
        <Section titre="Nouveau modèle">
          <div className="carte pres-modele">
            <label>
              Nom <input className="champ" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
            </label>
            {COULEURS.map(([k, libelle]) => (
              <label key={k}>
                {libelle} <input type="color" value={`#${edition.couleurs[k]}`} onChange={(e) => setEdition({ ...edition, couleurs: { ...edition.couleurs, [k]: e.target.value.slice(1).toUpperCase() } })} />
              </label>
            ))}
            <label>
              Police des titres <input className="champ" value={edition.polices.titre} onChange={(e) => setEdition({ ...edition, polices: { ...edition.polices, titre: e.target.value } })} />
            </label>
            <label>
              Police du texte <input className="champ" value={edition.polices.texte} onChange={(e) => setEdition({ ...edition, polices: { ...edition.polices, texte: e.target.value } })} />
            </label>
            <label>
              Taille des titres (pt) <input className="champ" type="number" min={16} max={72} value={edition.tailles.titre} onChange={(e) => setEdition({ ...edition, tailles: { ...edition.tailles, titre: Number(e.target.value) || 36 } })} />
            </label>
            <label>
              Taille du texte (pt) <input className="champ" type="number" min={12} max={40} value={edition.tailles.texte} onChange={(e) => setEdition({ ...edition, tailles: { ...edition.tailles, texte: Number(e.target.value) || 24 } })} />
            </label>
            <label>
              Pied de page <input className="champ" value={edition.pied} placeholder="Thèse · L. David · ENTPE" onChange={(e) => setEdition({ ...edition, pied: e.target.value })} />
            </label>
            <label>
              <input type="checkbox" checked={edition.numeros} onChange={(e) => setEdition({ ...edition, numeros: e.target.checked })} /> Numéros de diapo
            </label>
            <div className="rangee">
              <button type="button" className="principal" disabled={!edition.nom.trim()} onClick={() => void sauverModele()}>
                Enregistrer le modèle
              </button>
              <button type="button" onClick={() => setEdition(null)}>
                Annuler
              </button>
            </div>
          </div>
        </Section>
      ) : null}
    </>
  );
}
