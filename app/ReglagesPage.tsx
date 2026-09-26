/**
 * Réglages propres à ce poste (SPEC §4.2) : l'espace, les racines de données, le dossier
 * de la bibliothèque de figures. Rien de tout cela ne va dans OneDrive.
 */
import { useEffect, useState } from "react";
import { estNomRacine, RACINES_CONNUES, type ReglagesPoste } from "@noyau/poste/reglages";
import { Message, Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { IconeDossier } from "@interface/icones";

export function ReglagesPage() {
  const ctx = useContexte();
  const { reglages, plateforme } = ctx;
  const [existe, setExiste] = useState<Record<string, boolean>>({});
  const [nouveau, setNouveau] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void Promise.all(Object.entries(reglages.racines).map(async ([n, c]) => [n, await plateforme.dossierExiste(c)] as const)).then((r) => {
      if (!annule) setExiste(Object.fromEntries(r));
    });
    return () => {
      annule = true;
    };
  }, [reglages.racines, plateforme]);

  async function enregistrer(r: ReglagesPoste) {
    setErreur(null);
    try {
      await ctx.enregistrerReglages(r);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }

  async function choisirRacine(nom: string) {
    const chemin = await plateforme.choisirDossier(`Dossier de la racine « ${nom} »`, reglages.racines[nom]);
    if (chemin) await enregistrer({ ...reglages, racines: { ...reglages.racines, [nom]: chemin } });
  }

  async function retirerRacine(nom: string) {
    const racines = { ...reglages.racines };
    delete racines[nom];
    await enregistrer({ ...reglages, racines });
  }

  async function ajouter(nom: string) {
    const n = nom.trim();
    if (!estNomRacine(n)) {
      setErreur("Nom de racine : minuscules, chiffres et tirets, en commençant par une lettre (par exemple « comsol »).");
      return;
    }
    if (reglages.racines[n]) {
      setErreur(`La racine « ${n} » existe déjà.`);
      return;
    }
    setNouveau("");
    await choisirRacine(n);
  }

  async function choisirFigures() {
    const chemin = await plateforme.choisirDossier("Dossier de la bibliothèque de figures", reglages.figures ?? undefined);
    if (chemin) await enregistrer({ ...reglages, figures: chemin });
  }

  const suggestions = RACINES_CONNUES.filter((r) => !(r.nom in reglages.racines));
  const description = (nom: string) => RACINES_CONNUES.find((r) => r.nom === nom)?.description ?? "";

  return (
    <Page titre="Réglages du poste" sousTitre={`Propres au poste ${ctx.poste} : ils ne sont pas synchronisés par OneDrive.`}>
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}

      <Section titre="Espace Thèse">
        <div className="carte">
          <p>
            <span className="chemin">{reglages.espace}</span>
          </p>
          <div className="rangee">
            {reglages.espace ? (
              <button type="button" onClick={() => void plateforme.ouvrirDossier(reglages.espace!)}>
                <IconeDossier taille={16} />
                Ouvrir le dossier
              </button>
            ) : null}
            <button type="button" onClick={() => void enregistrer({ ...reglages, espace: null })}>
              Changer d'espace…
            </button>
          </div>
        </div>
      </Section>

      <Section titre="Racines de données">
        <p className="discret">
          Les données qui ne vont pas dans OneDrive (essais bruts, PDF) sont désignées par une racine, par exemple <code>essais:tsrst-lucas/Essai1</code>.
          Chaque poste dit où se trouve chaque racine : le jour où les données changent de disque, on corrige une ligne ici.
        </p>
        {Object.keys(reglages.racines).length > 0 ? (
          <table className="tableau">
            <thead>
              <tr>
                <th>Racine</th>
                <th>Dossier sur ce poste</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {Object.entries(reglages.racines).map(([nom, chemin]) => (
                <tr key={nom}>
                  <td>
                    <code>{nom}</code>
                    <div className="discret">{description(nom)}</div>
                  </td>
                  <td className="chemin">{chemin}</td>
                  <td>{nom in existe ? <Pastille niveau={existe[nom] ? "ok" : "attention"}>{existe[nom] ? "Présent" : "Absent ici"}</Pastille> : null}</td>
                  <td>
                    <div className="rangee">
                      <button type="button" onClick={() => void choisirRacine(nom)}>
                        Modifier…
                      </button>
                      <button type="button" onClick={() => void retirerRacine(nom)}>
                        Retirer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Message niveau="info">Aucune racine déclarée sur ce poste.</Message>
        )}
        <div className="rangee" style={{ marginTop: 10 }}>
          {suggestions.map((r) => (
            <button key={r.nom} type="button" title={`${r.description} — par exemple ${r.exemple}`} onClick={() => void choisirRacine(r.nom)}>
              + {r.nom}
            </button>
          ))}
          <span className="rangee" style={{ flexWrap: "nowrap" }}>
            <input type="text" aria-label="Nom d'une autre racine" placeholder="autre racine…" value={nouveau} onChange={(e) => setNouveau(e.target.value)} style={{ width: 160 }} />
            <button type="button" disabled={!nouveau.trim()} onClick={() => void ajouter(nouveau)}>
              Ajouter
            </button>
          </span>
        </div>
      </Section>

      <Section titre="Bibliothèque de figures">
        <div className="carte">
          <p className="discret">Le dossier de Figurine 1.0 (souvent dans OneDrive). Il sera repris tel quel par le module Figures.</p>
          <p>{reglages.figures ? <span className="chemin">{reglages.figures}</span> : <span className="discret">Pas encore choisi.</span>}</p>
          <button type="button" onClick={() => void choisirFigures()}>
            Choisir…
          </button>
        </div>
      </Section>
    </Page>
  );
}
