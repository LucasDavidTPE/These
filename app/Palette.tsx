/**
 * Palette Ctrl+K : recherche dans tout l'espace (chaque module décrit son contenu par
 * `indexer`) et accès rapide aux pages. Rien n'est lu tant que la palette n'est pas ouverte.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { chercher, chercherCommandes, type Commande, type EntreeRecherche } from "@noyau/recherche";
import type { Destination } from "@interface/contexte";
import { useContexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";

interface Props {
  manifestes: Manifeste[];
  fermer(): void;
}

type Ligne = { type: "entree"; entree: EntreeRecherche; libelleModule: string } | { type: "commande"; commande: Commande; vers: Destination };

const MAX = 40;

export function Palette({ manifestes, fermer }: Props) {
  const ctx = useContexte();
  const [requete, setRequete] = useState("");
  const [index, setIndex] = useState<EntreeRecherche[] | null>(null);
  const [curseur, setCurseur] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLUListElement>(null);

  useEffect(() => {
    champ.current?.focus();
  }, []);

  useEffect(() => {
    let annule = false;
    void Promise.all(manifestes.map((m) => (m.indexer ? m.indexer(ctx).catch(() => [] as EntreeRecherche[]) : Promise.resolve([] as EntreeRecherche[])))).then((parts) => {
      if (!annule) setIndex(parts.flat());
    });
    return () => {
      annule = true;
    };
    // Une indexation à l'ouverture (et si des fichiers changent pendant qu'elle est ouverte).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.revision, manifestes]);

  const titres = useMemo(() => Object.fromEntries(manifestes.map((m) => [m.id, m.titre])), [manifestes]);

  const lignes = useMemo<Ligne[]>(() => {
    const destinations: { commande: Commande; vers: Destination }[] = [
      ...manifestes.map((m) => ({ commande: { id: m.id, titre: `Aller à ${m.titre}`, detail: m.resume, mots: m.id } as Commande, vers: m.id as Destination })),
      ...(ctx.produit.espace
        ? [
            { commande: { id: "reglages", titre: "Réglages du poste", detail: "Espace, racines de données, export en .zip, rapatriement", mots: "parametres espace racines zip exporter rapatrier" } as Commande, vers: "reglages" as Destination },
            { commande: { id: "diagnostic", titre: "Diagnostic", detail: "État de l'espace et du poste", mots: "diagnostic problemes" } as Commande, vers: "diagnostic" as Destination },
          ]
        : []),
    ];
    const cmds = chercherCommandes(
      destinations.map((d) => d.commande),
      requete,
    ).map((c) => ({ type: "commande" as const, commande: c, vers: destinations.find((d) => d.commande.id === c.id)!.vers }));
    const trouves = index ? chercher(index, requete, MAX).map((entree) => ({ type: "entree" as const, entree, libelleModule: titres[entree.module] ?? entree.module })) : [];
    return requete.trim() ? [...trouves, ...cmds.slice(0, 5)] : cmds;
  }, [requete, index, manifestes, titres, ctx.produit.espace]);

  useEffect(() => {
    liste.current?.children[curseur]?.scrollIntoView?.({ block: "nearest" });
  }, [curseur]);

  async function choisir(l: Ligne | undefined) {
    if (!l) return;
    fermer();
    if (l.type === "commande") return ctx.naviguer(l.vers);
    const { entree } = l;
    if (entree.ouvrir && ctx.registre.aAction(entree.ouvrir.action)) {
      try {
        await ctx.registre.executer(entree.ouvrir.action, { ctx, ...(entree.ouvrir.charge as object) });
        return;
      } catch {
        // à défaut, on ouvre au moins la page du module
      }
    }
    ctx.naviguer(entree.module as Destination);
  }

  function touche(e: React.KeyboardEvent) {
    if (e.key === "Escape") return fermer();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCurseur((c) => Math.min(c + 1, lignes.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCurseur((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void choisir(lignes[curseur]);
    }
  }

  return (
    <div className="recherche-fond" onMouseDown={fermer}>
      <div className="recherche" role="dialog" aria-label="Recherche" onMouseDown={(e) => e.stopPropagation()} onKeyDown={touche}>
        <input
          ref={champ}
          className="recherche-champ"
          type="text"
          placeholder="Chercher une référence, un essai, une figure, un cas… ou une page"
          aria-label="Recherche"
          value={requete}
          onChange={(e) => {
            setRequete(e.target.value);
            setCurseur(0);
          }}
        />
        <ul ref={liste} className="recherche-liste" role="listbox">
          {lignes.map((l, i) => (
            <li key={l.type === "entree" ? `${l.entree.module}/${l.entree.id}` : `cmd-${l.commande.id}`} role="option" aria-selected={i === curseur} className={i === curseur ? "actif" : undefined} onMouseMove={() => setCurseur(i)} onClick={() => void choisir(l)}>
              <span className="recherche-genre">{l.type === "entree" ? l.entree.genre : "Page"}</span>
              <span className="recherche-texte">
                <span className="recherche-titre">{l.type === "entree" ? l.entree.titre : l.commande.titre}</span>
                <span className="recherche-detail">{l.type === "entree" ? [l.libelleModule, l.entree.detail].filter(Boolean).join(" · ") : l.commande.detail}</span>
              </span>
            </li>
          ))}
          {index === null && requete.trim() ? <li className="recherche-vide">Indexation…</li> : null}
          {index !== null && requete.trim() && lignes.length === 0 ? <li className="recherche-vide">Rien ne correspond à « {requete.trim()} ».</li> : null}
        </ul>
        <div className="recherche-pied">
          ↑↓ pour choisir · Entrée pour ouvrir · Échap pour fermer{index ? ` · ${index.length} éléments indexés` : ""}
        </div>
      </div>
    </div>
  );
}
