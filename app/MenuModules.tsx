/**
 * Barre des modules en sections dépliables (Accueil, Calendrier, Bibliographie, Essais, Outils,
 * Rédaction). Une section d'un seul module est un lien direct ; celle de la page ouverte reste
 * dépliée. Sections repliées : mémorisées sur ce poste seulement.
 */
import { useState } from "react";
import { sectionsDu } from "@noyau/menu";
import type { Destination } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";

const MEMOIRE = "these.menu.replies";

function lireReplies(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(MEMOIRE) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function Lien({ m, page, ouvrir }: { m: Manifeste; page: Destination; ouvrir(d: Destination): void }) {
  return (
    <li>
      <button type="button" className={m.id === page ? "actif" : undefined} aria-current={m.id === page ? "page" : undefined} onClick={() => ouvrir(m.id)}>
        <m.Icone />
        {m.titre}
        {m.aVenir ? <span className="a-venir">{m.aVenir}</span> : null}
      </button>
    </li>
  );
}

export function MenuModules({ manifestes, page, ouvrir }: { manifestes: Manifeste[]; page: Destination; ouvrir(d: Destination): void }) {
  const [replies, setReplies] = useState(lireReplies);
  const parId = new Map(manifestes.map((m) => [m.id as string, m]));
  const basculer = (titre: string) => {
    const n = new Set(replies);
    if (n.has(titre)) n.delete(titre);
    else n.add(titre);
    setReplies(n);
    try {
      localStorage.setItem(MEMOIRE, JSON.stringify([...n]));
    } catch {
      /* mémoire du poste indisponible : le menu se déplie simplement à chaque lancement */
    }
  };
  return (
    <ul className="menu-sections">
      {sectionsDu(manifestes.map((m) => m.id)).map((s) => {
        const mods = s.modules.map((id) => parId.get(id)!);
        if (mods.length === 1) return <Lien key={s.titre} m={mods[0]!} page={page} ouvrir={ouvrir} />;
        const contient = s.modules.includes(page);
        const ouverte = contient || !replies.has(s.titre);
        return (
          <li key={s.titre} className="menu-section">
            <button type="button" className="menu-section-titre" aria-expanded={ouverte} onClick={() => basculer(s.titre)} disabled={contient} title={contient ? "La page ouverte est dans cette section" : undefined}>
              <span className="menu-chevron" aria-hidden="true">
                {ouverte ? "▾" : "▸"}
              </span>
              {s.titre}
            </button>
            {ouverte ? (
              <ul>
                {mods.map((m) => (
                  <Lien key={m.id} m={m} page={page} ouvrir={ouvrir} />
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
