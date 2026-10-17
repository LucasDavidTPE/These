/**
 * « Quoi de neuf » : les nouveautés depuis la dernière version vue sur ce poste (montrées seules après une mise
 * à jour), ou toutes (bouton « Nouveautés » de la barre, Ctrl+K). Chaque nouveauté a son bouton « Essayer ».
 * La dernière version vue est mémorisée sur ce poste seulement.
 */
import type { Nouveaute } from "@noyau/nouveautes";
import { parVersion } from "@noyau/nouveautes";
import { useContexte, type Destination } from "@interface/contexte";

export function Nouveautes({ liste, depuis, fermer }: { liste: Nouveaute[]; depuis: string | null; fermer(): void }) {
  const ctx = useContexte();
  const titres = Object.fromEntries(ctx.registre.manifestes.map((m) => [m.id, m.titre]));
  const essayer = async (n: Nouveaute) => {
    const e = n.essayer;
    if (!e) return;
    fermer();
    if (e.action && ctx.registre.aAction(e.action)) {
      try {
        await ctx.registre.executer(e.action, { ctx, ...e.charge });
        return;
      } catch {
        // à défaut, la page du module
      }
    }
    const vers = e.vers ?? n.module;
    if (vers) ctx.naviguer(vers as Destination);
  };
  const essayable = (n: Nouveaute) => Boolean(n.essayer && (n.essayer.action ? ctx.registre.aAction(n.essayer.action) : n.essayer.vers && ctx.registre.aModule(n.essayer.vers)));
  return (
    <div className="recherche-fond" onMouseDown={fermer}>
      <div className="nouveautes" role="dialog" aria-label="Quoi de neuf" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && fermer()}>
        <header className="nouveautes-tete">
          <div>
            <h2>
              Quoi de neuf dans {ctx.produit.nom} {ctx.version}
            </h2>
            <p className="discret">{depuis ? `Depuis la version ${depuis}, sur ce poste.` : "Les nouveautés des dernières versions."} Chaque bouton ouvre la fonction, prête à essayer.</p>
          </div>
          <button type="button" className="principal" onClick={fermer} autoFocus>
            Fermer
          </button>
        </header>
        <div className="nouveautes-liste">
          {parVersion(liste).map((g) => (
            <section key={g.version}>
              <h3>{g.version}</h3>
              <ul>
                {g.nouveautes.map((n) => (
                  <li key={n.titre}>
                    <div>
                      <strong>{n.titre}</strong>
                      {n.module && titres[n.module] ? <span className="nouveautes-module">{titres[n.module]}</span> : null}
                      <p>{n.detail}</p>
                    </div>
                    {essayable(n) ? (
                      <button type="button" onClick={() => void essayer(n)}>
                        {n.essayer!.libelle} →
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
