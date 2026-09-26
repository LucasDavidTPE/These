/**
 * « À régler » (SPEC §5) : tout ce qui demande une décision, avec de quoi la prendre sur
 * place. Rien n'est jamais supprimé en silence : une version écartée est rangée dans
 * `.conflits/`, seul un fichier temporaire d'écriture interrompue peut être effacé.
 */
import { useState } from "react";
import { horodatageFichier } from "@noyau/dates";
import { absolu, appliquer, cleProbleme, comparerJson, decrire, joindre, parent, planResolution, resoudreConflit, type Difference, type Probleme } from "@noyau/stockage";
import { Message, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";

function Comparaison({ differences, etiquette }: { differences: Difference[]; etiquette: string }) {
  if (differences.length === 0) return <p className="discret">Les deux versions sont identiques : vous pouvez garder l'une ou l'autre.</p>;
  return (
    <table className="tableau" style={{ margin: "10px 0" }}>
      <thead>
        <tr>
          <th>Champ</th>
          <th>Version actuelle</th>
          <th>Copie ({etiquette})</th>
        </tr>
      </thead>
      <tbody>
        {differences.map((d) => (
          <tr key={d.champ}>
            <td>
              <code>{d.champ}</code>
            </td>
            <td>{d.a ?? <span className="discret">(absent)</span>}</td>
            <td>{d.b ?? <span className="discret">(absent)</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Actions({ p }: { p: Probleme }) {
  const ctx = useContexte();
  const [differences, setDifferences] = useState<Difference[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const espace = ctx.espace;
  if (!espace) return null;
  const fs = espace.fichiers;

  async function agir(f: () => Promise<void>) {
    setErreur(null);
    try {
      await f();
      ctx.rafraichir();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  const horodatage = () => horodatageFichier(new Date(), -new Date().getTimezoneOffset());

  switch (p.type) {
    case "conflit": {
      const { dossier, conflit, format } = p;
      const garder = (choix: "original" | "copie" | "les-deux") =>
        agir(async () => {
          if (format) await resoudreConflit(fs, { dossier, format }, conflit, choix, horodatage());
          else await appliquer(fs, planResolution(dossier, conflit, choix === "les-deux" ? "original" : choix, horodatage(), await fs.exists(joindre(dossier, ".conflits"))));
        });
      return (
        <>
          {differences ? <Comparaison differences={differences} etiquette={conflit.etiquette} /> : null}
          <div className="rangee">
            {differences ? null : (
              <button
                type="button"
                onClick={() =>
                  void agir(async () => {
                    const [a, b] = await Promise.all([fs.readText(joindre(dossier, conflit.original)), fs.readText(joindre(dossier, conflit.copie))]);
                    setDifferences(comparerJson(a, b));
                  })
                }
              >
                Comparer les deux versions
              </button>
            )}
            <button type="button" onClick={() => void garder("original")}>
              Garder la version actuelle
            </button>
            <button type="button" onClick={() => void garder("copie")}>
              Garder la copie ({conflit.etiquette})
            </button>
            {format ? (
              <button type="button" title="Deux objets différents ont reçu le même numéro hors ligne : la copie prend le numéro suivant." onClick={() => void garder("les-deux")}>
                Garder les deux
              </button>
            ) : null}
          </div>
          {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
        </>
      );
    }
    case "temporaire":
      return (
        <>
          <button type="button" onClick={() => void agir(() => ctx.plateforme.supprimerTemporaire(espace.racine, p.chemin))}>
            Supprimer le fichier temporaire
          </button>
          {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
        </>
      );
    case "illisible":
      return (
        <button type="button" onClick={() => void ctx.plateforme.ouvrirDossier(absolu(espace.racine, parent(p.chemin)))}>
          Ouvrir le dossier
        </button>
      );
    case "racine-absente":
      return (
        <button type="button" onClick={() => ctx.naviguer("reglages")}>
          Corriger dans les réglages
        </button>
      );
  }
}

export function ARegler() {
  const { problemes } = useContexte();
  return (
    <Section titre="À régler" aDroite={<Pastille niveau={problemes.length === 0 ? "ok" : "attention"}>{problemes.length === 0 ? "Rien" : String(problemes.length)}</Pastille>}>
      {problemes.length === 0 ? (
        <p className="discret">Rien à régler : pas de conflit OneDrive, pas d'écriture interrompue, toutes les racines sont présentes.</p>
      ) : (
        <ul className="liste">
          {problemes.map(({ probleme }) => {
            const d = decrire(probleme);
            return (
              <li key={cleProbleme(probleme)}>
                <strong>{d.titre}</strong>
                <p className="discret">{d.detail}</p>
                <Actions p={probleme} />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
