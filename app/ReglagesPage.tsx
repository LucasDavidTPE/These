/**
 * Réglages propres à ce poste (SPEC §4.2) : l'espace, les racines de données (d'où viennent
 * les données brutes, copiées dans l'espace à l'ouverture). Rien de tout cela ne va dans
 * OneDrive. Aussi : l'export de tout l'espace en .zip, et le rapatriement des anciens
 * emplacements (PDF, figures) dans l'espace.
 */
import { useEffect, useState } from "react";
import { DANS_L_ESPACE, horsEspace, type DansLEspace } from "@noyau/poste/racines";
import { estNomRacine, RACINES_CONNUES, type ReglagesPoste } from "@noyau/poste/reglages";
import { absolu } from "@noyau/stockage";
import { Message, Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { IconeDossier } from "@interface/icones";
import { LIBELLE_DANS_L_ESPACE, PHRASES_DANS_L_ESPACE, rapatrier } from "@interface/rapatriement";

export function ReglagesPage() {
  const ctx = useContexte();
  const { reglages, plateforme } = ctx;
  const [existe, setExiste] = useState<Record<string, boolean>>({});
  const [nouveau, setNouveau] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const anciens = horsEspace(reglages, ctx.espace?.racine ?? null);

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

  async function tache(libelle: string, f: () => Promise<string | null>) {
    setErreur(null);
    setInfo(null);
    setOccupe(libelle);
    try {
      const m = await f();
      if (m) setInfo(m);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  }

  const exporter = () =>
    tache("Export de l'espace en cours…", async () => {
      if (!ctx.espace) return null;
      const date = new Date().toISOString().slice(0, 10);
      const r = await plateforme.archiverDossier(ctx.espace.racine, `Espace Thèse ${date}.zip`);
      if (!r) return null;
      const mo = (r.octets / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      return `Espace exporté : ${r.fichiers} fichiers (${mo} Mo avant compression).`;
    });

  const rapatrierDans = (quoi: DansLEspace) => tache(`Copie de ${LIBELLE_DANS_L_ESPACE[quoi]} dans l'espace…`, () => rapatrier(ctx, quoi));

  const suggestions = RACINES_CONNUES.filter((r) => !(r.nom in reglages.racines));
  const description = (nom: string) => RACINES_CONNUES.find((r) => r.nom === nom)?.description ?? "";

  return (
    <Page titre="Réglages du poste" sousTitre={`Propres au poste ${ctx.poste} : ils ne sont pas synchronisés par OneDrive.`}>
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      {info ? <Message niveau="info">{info}</Message> : null}
      {occupe ? <Message niveau="info">{occupe}</Message> : null}

      <Section titre="Espace Thèse">
        <div className="carte">
          <p>
            <span className="chemin">{reglages.espace}</span>
          </p>
          <p className="discret">
            Tout vit ici : fiches, notes, références et leurs PDF (<code>bibliotheque/pdf</code>), figures (<code>figures</code>), dépouillements, et une copie de
            chaque fichier de données ouvert pour une analyse (<code>donnees</code>). L'espace se suffit à lui-même : l'exporter, c'est emporter toute la thèse.
          </p>
          <div className="rangee">
            {reglages.espace ? (
              <button type="button" onClick={() => void plateforme.ouvrirDossier(reglages.espace!)}>
                <IconeDossier taille={16} />
                Ouvrir le dossier
              </button>
            ) : null}
            {ctx.espace ? (
              <button type="button" disabled={!!occupe} onClick={() => void exporter()} title="Tout l'espace dans un seul fichier .zip : pour l'archiver ou le garder hors du OneDrive de l'école">
                Exporter l'espace (.zip)…
              </button>
            ) : null}
            <button type="button" onClick={() => void enregistrer({ ...reglages, espace: null })}>
              Changer d'espace…
            </button>
          </div>
        </div>
        {anciens.map((a) => (
          <div key={a.quoi} className="carte" style={{ marginTop: 10 }}>
            <p>
              <strong>{PHRASES_DANS_L_ESPACE[a.quoi].sujet}</strong> : encore hors de l'espace sur ce poste,{" "}
              <span className="chemin">{a.chemin}</span>
            </p>
            <p className="discret">
              « Rapatrier » les copie dans <span className="chemin">{absolu(ctx.espace!.racine, DANS_L_ESPACE[a.quoi])}</span> sans rien écraser, vérifie que tout est
              arrivé, puis oublie l'ancien dossier. Rien n'est supprimé : vous supprimerez l'ancien dossier vous-même.
            </p>
            <button type="button" className="principal" disabled={!!occupe} onClick={() => void rapatrierDans(a.quoi)}>
              Rapatrier dans l'espace
            </button>
          </div>
        ))}
      </Section>

      <Section titre="Racines de données">
        <p className="discret">
          Les disques d'où viennent les données brutes (sorties machine, calculs) : une racine les désigne, par exemple <code>essais:tsrst-lucas/Essai1</code>. Ils ne
          sont jamais modifiés ; un fichier ouvert pour une analyse est copié dans l'espace, et l'autre PC le relit depuis cette copie. Chaque poste dit où se trouve
          chaque racine : le jour où les données changent de disque, on corrige une ligne ici.
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
              {Object.entries(reglages.racines).filter(([nom]) => !anciens.some((a) => a.quoi === nom)).map(([nom, chemin]) => (
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

      {!ctx.espace ? (
        <Section titre="Bibliothèque de figures">
          <div className="carte">
            <p className="discret">Le dossier de la bibliothèque (celui de Figurine 1.0).</p>
            <p>{reglages.figures ? <span className="chemin">{reglages.figures}</span> : <span className="discret">Pas encore choisi.</span>}</p>
            <button type="button" onClick={() => void choisirFigures()}>
              Choisir…
            </button>
          </div>
        </Section>
      ) : null}
    </Page>
  );
}
