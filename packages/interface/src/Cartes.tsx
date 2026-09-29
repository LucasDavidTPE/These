/**
 * Cartes éditables d'une page (ChaussSpec, campagne, étude) : texte en Markdown, écrit par
 * l'utilisateur ou fourni par l'application puis réécrit à sa façon. Rangées dans l'espace
 * (`cartes/<zone>/`), donc partagées entre les deux PC. Rien n'est jamais effacé.
 */
import { useEffect, useState } from "react";
import { nouvelId, type Carte, type CarteFournie } from "@noyau/cartes";
import { chargerCartes, ecrireCarte, ecrireIndex, rangerCarte, type CartesChargees } from "./stockageCartes";
import { useContexte } from "./contexte";
import { Markdown } from "./Markdown";
import { Sources } from "./Sources";

interface Props {
  zone: string;
  fournies?: readonly CarteFournie[];
  /** Cartes repliables (titre cliquable), comme un panneau d'explication. */
  repliables?: boolean;
  /** Texte quand il n'y a encore aucune carte. */
  vide?: string;
}

const AIDE = "Markdown : ## titre, **gras**, *italique*, - liste, 1. liste, `code`, [lien](https://…), [@BIB-020] pour citer la Bibliothèque.";

function Editeur({ carte, enregistrer, annuler }: { carte: Pick<Carte, "titre" | "texte">; enregistrer(titre: string, texte: string): void; annuler(): void }) {
  const [titre, setTitre] = useState(carte.titre);
  const [texte, setTexte] = useState(carte.texte);
  return (
    <div className="carte-edition">
      <input className="champ" aria-label="Titre de la carte" value={titre} placeholder="Titre" onChange={(e) => setTitre(e.target.value)} />
      <textarea className="champ" aria-label="Texte de la carte" value={texte} rows={Math.min(24, Math.max(6, texte.split("\n").length + 2))} onChange={(e) => setTexte(e.target.value)} />
      <p className="discret petit">{AIDE}</p>
      <div className="rangee">
        <button type="button" className="principal" onClick={() => enregistrer(titre, texte)}>
          Enregistrer
        </button>
        <button type="button" onClick={annuler}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export function Cartes({ zone, fournies = [], repliables = false, vide }: Props) {
  const ctx = useContexte();
  const fs = ctx.espace?.fichiers;
  const [charge, setEtat] = useState<CartesChargees | null>(null);
  // Sans espace (installeur d'un seul module) : les cartes fournies, en lecture seule.
  const etat: CartesChargees | null = fs ? charge : { visibles: fournies.map((f) => ({ ...f, sources: f.sources ?? [], origine: "fournie" as const })), masquees: [], index: { ordre: [], masquees: [] } };
  const [edition, setEdition] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    if (!fs) return;
    let annule = false;
    void chargerCartes(fs, zone, fournies).then((r) => !annule && setEtat(r));
    return () => {
      annule = true;
    };
    // `fournies` est une constante du module appelant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, zone, ctx.revision, tour]);

  async function agir(f: () => Promise<void>) {
    setErreur(null);
    try {
      await f();
      setTour((t) => t + 1);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  if (!etat) return null;
  const ordreComplet = (visibles: string[]) => [...visibles, ...etat.masquees.map((c) => c.id)];
  const deplacer = (id: string, sens: -1 | 1) => {
    const ids = etat.visibles.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + sens;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void agir(() => ecrireIndex(fs!, zone, { ...etat.index, ordre: ordreComplet(ids) }));
  };
  const masquer = (id: string, oui: boolean) =>
    void agir(() => ecrireIndex(fs!, zone, { ordre: ordreComplet(etat.visibles.map((c) => c.id)), masquees: oui ? [...etat.index.masquees, id] : etat.index.masquees.filter((x) => x !== id) }));

  const actions = (c: Carte, i: number) =>
    fs ? (
      <span className="carte-actions">
        <button type="button" className="lien" onClick={() => setEdition(c.id)} title="Modifier le titre et le texte">
          ✎ modifier
        </button>
        <button type="button" className="lien" disabled={i === 0} onClick={() => deplacer(c.id, -1)} title="Monter">
          ↑
        </button>
        <button type="button" className="lien" disabled={i === etat.visibles.length - 1} onClick={() => deplacer(c.id, 1)} title="Descendre">
          ↓
        </button>
        {c.origine === "modifiee" ? (
          <button type="button" className="lien" title="Reprendre le texte fourni par l'application (le vôtre est gardé dans .anciennes)" onClick={() => void agir(() => rangerCarte(fs, zone, c.id))}>
            texte d'origine
          </button>
        ) : null}
        {c.origine === "perso" ? (
          <button type="button" className="lien" title="Retirer la carte (le fichier est rangé dans .anciennes, pas effacé)" onClick={() => window.confirm(`Retirer la carte « ${c.titre} » ?`) && void agir(() => rangerCarte(fs, zone, c.id))}>
            retirer
          </button>
        ) : (
          <button type="button" className="lien" title="Masquer cette carte (réaffichable en bas)" onClick={() => masquer(c.id, true)}>
            masquer
          </button>
        )}
      </span>
    ) : null;

  const corps = (c: Carte) =>
    edition === c.id ? (
      <Editeur carte={c} annuler={() => setEdition(null)} enregistrer={(t, x) => void agir(async () => (await ecrireCarte(fs!, zone, c.id, t, x), setEdition(null)))} />
    ) : (
      <>
        <Markdown texte={c.texte} />
        {c.sources.length ? <Sources cles={c.sources} /> : null}
      </>
    );

  return (
    <div className="cartes">
      {erreur ? <p className="erreur-texte petit">{erreur}</p> : null}
      {etat.visibles.length === 0 && !nouvelle ? <p className="discret">{vide ?? "Aucune carte pour l'instant."}</p> : null}
      {etat.visibles.map((c, i) =>
        repliables && edition !== c.id ? (
          <details key={c.id} className="carte-texte">
            <summary>
              <span className="carte-titre">{c.titre}</span>
              {c.origine === "modifiee" ? <span className="discret petit"> (modifiée)</span> : null}
            </summary>
            {actions(c, i)}
            {corps(c)}
          </details>
        ) : (
          <section key={c.id} className="carte-texte ouverte">
            <header className="rangee">
              <strong className="carte-titre">{c.titre}</strong>
              {c.origine === "modifiee" ? <span className="discret petit">(modifiée)</span> : null}
              {edition === c.id ? null : actions(c, i)}
            </header>
            {corps(c)}
          </section>
        ),
      )}
      {nouvelle ? (
        <Editeur
          carte={{ titre: "", texte: "" }}
          annuler={() => setNouvelle(false)}
          enregistrer={(t, x) =>
            void agir(async () => {
              const id = nouvelId(Date.now());
              await ecrireCarte(fs!, zone, id, t, x);
              await ecrireIndex(fs!, zone, { ...etat.index, ordre: ordreComplet([...etat.visibles.map((c) => c.id), id]) });
              setNouvelle(false);
            })
          }
        />
      ) : null}
      {fs ? (
        <div className="rangee cartes-pied">
          {nouvelle ? null : (
            <button type="button" onClick={() => setNouvelle(true)}>
              + Nouvelle carte
            </button>
          )}
          {etat.masquees.map((c) => (
            <button key={c.id} type="button" className="lien" title="Réafficher cette carte" onClick={() => masquer(c.id, false)}>
              réafficher « {c.titre} »
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
