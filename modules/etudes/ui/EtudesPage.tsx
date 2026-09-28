/**
 * Module Études : les scripts d'analyse, vus comme une arborescence, ouverts dans VS Code
 * pour être exécutés ; l'application retrouve ensuite chaque exécution (date, poste,
 * données lues, fichiers produits, succès ou erreur) et donne accès à ses sorties.
 */
import { FiguresLiees } from "@interface/FiguresLiees";
import { useEffect, useState } from "react";
import { absolu, joindre } from "@noyau/stockage";
import { Message, Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { IconeDossier } from "@interface/icones";
import { DOSSIER, STATUTS, type Etude, type Execution } from "../core/modele";
import { chargerEtudes, creerEtude, enregistrerEtude, poserOutil, type EtudeChargee, type Noeud } from "./donnees";
import "./etudes.css";

const TEXTE = /\.(py|toml|json|md|txt|csv|tex|ipynb|yaml|yml)$/i;
const IMAGE = /\.(png|jpe?g|svg|gif|webp)$/i;
const taille = (o: number) => (o > 1e6 ? `${(o / 1e6).toFixed(1)} Mo` : o > 1e3 ? `${Math.round(o / 1e3)} ko` : `${o} o`);

function useOuvrir() {
  const ctx = useContexte();
  const racine = ctx.espace?.racine ?? "";
  return {
    abs: (rel: string) => absolu(racine, rel),
    code: (rel: string) => ctx.plateforme.ouvrirVSCode(absolu(racine, rel)),
    fichier: (rel: string) => ctx.plateforme.ouvrirDossier(absolu(racine, rel)),
  };
}

function Vignette({ chemin }: { chemin: string }) {
  const { espace } = useContexte();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!espace) return;
    let u: string | null = null;
    let annule = false;
    void espace.fichiers.readBytes(chemin).then((o) => {
      if (annule) return;
      u = URL.createObjectURL(new Blob([o as BlobPart], { type: chemin.endsWith(".svg") ? "image/svg+xml" : undefined }));
      setUrl(u);
    });
    return () => {
      annule = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [espace, chemin]);
  return url ? <img className="vignette" src={url} alt="" /> : null;
}

function Arbre({ noeuds, onErreur }: { noeuds: Noeud[]; onErreur(m: string): void }) {
  const o = useOuvrir();
  return (
    <ul className="arbre">
      {noeuds.map((n) => (
        <li key={n.chemin}>
          {n.dossier ? (
            <details open>
              <summary>📁 {n.nom}</summary>
              <Arbre noeuds={n.enfants} onErreur={onErreur} />
            </details>
          ) : (
            <button type="button" className="lien" title={TEXTE.test(n.nom) ? "Ouvrir dans VS Code" : "Ouvrir"} onClick={() => void (TEXTE.test(n.nom) ? o.code(n.chemin) : o.fichier(n.chemin)).catch((e: unknown) => onErreur(String(e instanceof Error ? e.message : e)))}>
              {n.nom}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function CarteExecution({ base, x }: { base: string; x: Execution }) {
  const o = useOuvrir();
  const dossier = joindre(base, "sorties", x.dossier);
  return (
    <div className="carte execution">
      <div className="rangee">
        <Pastille niveau={x.statut === "ok" ? "ok" : x.statut === "erreur" ? "erreur" : "attention"}>{x.statut === "ok" ? "Réussie" : x.statut === "erreur" ? "Erreur" : "En cours ou interrompue"}</Pastille>
        <strong>{x.debut.replace("T", " ")}</strong>
        <span className="discret">
          {x.dureeS !== null ? `${x.dureeS} s` : ""} · {x.poste} · Python {x.python}
        </span>
        <button type="button" className="a-droite" onClick={() => void o.fichier(dossier)}>
          <IconeDossier taille={15} /> Sorties
        </button>
      </div>
      {x.entrees.length ? (
        <p className="petit discret">
          Données : {x.entrees.map((e) => e.reference).join(" · ")}
        </p>
      ) : null}
      {x.erreur ? <pre className="erreur-python">{x.erreur}</pre> : null}
      <div className="fichiers">
        {x.fichiers.map((f) => (
          <button key={f.nom} type="button" className="fichier" onClick={() => void o.fichier(joindre(dossier, f.nom))}>
            {IMAGE.test(f.nom) ? <Vignette chemin={joindre(dossier, f.nom)} /> : null}
            <span>{f.nom}</span>
            <span className="discret petit">{taille(f.octets)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function VueEtude({ e, campagnes, fermer }: { e: EtudeChargee; campagnes: { slug: string; titre: string }[]; fermer(): void }) {
  const ctx = useContexte();
  const o = useOuvrir();
  const fs = ctx.espace!.fichiers;
  const base = joindre(DOSSIER, e.dossier);
  const [erreur, setErreur] = useState<string | null>(null);
  const k = e.etude;
  const maj = (m: Partial<Etude>) => void enregistrerEtude(fs, e.dossier, { ...k, ...m }).catch((x: unknown) => setErreur(String(x)));
  const lgcb = e.format === "lgcb";
  const nomCampagne = (s: string) => campagnes.find((c) => c.slug === s)?.titre ?? s;

  return (
    <Page
      titre={k.titre}
      sousTitre={`${k.date || e.dossier.slice(0, 10)} · ${k.statut}${lgcb ? " · étude reprise de these-lgcb" : ""}`}
      actions={
        <>
          <button type="button" className="principal" onClick={() => void o.code(base).catch((x: unknown) => setErreur(String(x instanceof Error ? x.message : x)))}>
            Ouvrir dans VS Code
          </button>
          <button type="button" onClick={() => void o.fichier(base)}>
            <IconeDossier taille={16} /> Dossier
          </button>
          <button type="button" onClick={fermer}>
            ← Études
          </button>
        </>
      }
    >
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      <div className="etude-colonnes">
        <div>
          <Section titre="Question">
            {lgcb ? (
              <p>{k.question || <span className="discret">—</span>}</p>
            ) : (
              <textarea className="champ-e" rows={3} defaultValue={k.question} onBlur={(v) => v.target.value !== k.question && maj({ question: v.target.value })} />
            )}
          </Section>
          <Section titre="Conclusion">
            {lgcb ? (
              <p>{k.conclusion || <span className="discret">—</span>}</p>
            ) : (
              <textarea className="champ-e" rows={3} placeholder="À remplir à la fin : c'est ce que vous relirez dans six mois." defaultValue={k.conclusion} onBlur={(v) => v.target.value !== k.conclusion && maj({ conclusion: v.target.value })} />
            )}
          </Section>
          {!lgcb ? (
            <div className="rangee">
              <label>
                Statut{" "}
                <select className="champ-e" value={k.statut} onChange={(v) => maj({ statut: v.target.value })}>
                  {STATUTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              {campagnes.length ? (
                <label>
                  Campagnes{" "}
                  <select className="champ-e" multiple size={Math.min(4, campagnes.length)} value={k.campagnes} onChange={(v) => maj({ campagnes: [...v.target.selectedOptions].map((x) => x.value) })}>
                    {campagnes.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.titre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {k.campagnes.length ? (
            <p className="petit">
              Campagnes :{" "}
              {k.campagnes.map((c) => (
                <button key={c} type="button" className="lien" onClick={() => ctx.naviguer("campagnes")}>
                  {nomCampagne(c)}
                </button>
              ))}
            </p>
          ) : null}
          {Object.keys(k.entrees).length ? (
            <p className="petit discret">
              Entrées déclarées : {Object.entries(k.entrees).map(([n, r]) => `${n} = ${r}`).join(" · ")}
            </p>
          ) : null}
        </div>
        <Section titre="Fichiers">
          <Arbre noeuds={e.arbre} onErreur={setErreur} />
          {lgcb && !e.arbre.some((n) => n.nom === "these_etude.py") ? (
            <button type="button" className="petit" onClick={() => void poserOutil(fs, e.dossier)}>
              Ajouter l'outil de traçabilité (these_etude.py)
            </button>
          ) : null}
        </Section>
      </div>

      {ctx.registre.aAction("figures.liste") ? (
        <Section titre="Figures">
          <FiguresLiees cible={{ type: "etude", id: e.dossier, titre: k.titre }} />
        </Section>
      ) : null}
      <Section titre={`Exécutions (${e.executions.length})`}>
        {e.executions.length === 0 ? (
          <p className="discret">
            Aucune exécution tracée. Lancez <code>run.py</code> dans VS Code : chaque exécution qui utilise <code>Etude(__file__)</code> apparaîtra ici avec ses sorties.
          </p>
        ) : (
          e.executions.map((x) => <CarteExecution key={x.dossier} base={base} x={x} />)
        )}
      </Section>

      {e.sortiesLgcb.length ? (
        <Section titre="Sorties (these-lgcb)">
          <div className="fichiers">
            {e.sortiesLgcb.map((s) => (
              <button key={s.nom} type="button" className="fichier" onClick={() => void o.fichier(joindre(base, "outputs", s.nom))}>
                {IMAGE.test(s.nom) ? <Vignette chemin={joindre(base, "outputs", s.nom)} /> : null}
                <span>{s.nom}</span>
                {s.provenance ? <span className="discret petit">provenance tracée</span> : null}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </Page>
  );
}

export function EtudesPage() {
  const ctx = useContexte();
  const fs = ctx.espace?.fichiers;
  const [etudes, setEtudes] = useState<EtudeChargee[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState<{ titre: string; question: string } | null>(null);
  const [campagnes, setCampagnes] = useState<{ slug: string; titre: string }[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    if (!fs) return;
    let annule = false;
    chargerEtudes(fs)
      .then((r) => !annule && setEtudes(r.etudes))
      .catch((e: unknown) => !annule && setErreur(String(e)));
    if (ctx.registre.aAction("campagnes.liste"))
      void ctx.registre.executer("campagnes.liste", ctx).then((c) => !annule && setCampagnes(c as { slug: string; titre: string }[]));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, ctx.revision, tour]);

  if (!fs) return <Page titre="Études"><Message niveau="erreur">Les études vivent dans l'espace Thèse : ouvrez-en un d'abord.</Message></Page>;
  const courante = etudes?.find((e) => e.dossier === ouverte);
  if (courante) return <VueEtude e={courante} campagnes={campagnes} fermer={() => setOuverte(null)} />;

  async function creer() {
    if (!nouvelle || !fs) return;
    try {
      const d = await creerEtude(fs, nouvelle.titre.trim(), nouvelle.question, []);
      setNouvelle(null);
      setTour((t) => t + 1);
      setOuverte(d);
    } catch (e) {
      setErreur(String(e));
    }
  }

  return (
    <Page
      titre="Études"
      sousTitre="Une étude = une question : un script Python, ses données, ses exécutions tracées"
      actions={
        <>
          <button type="button" className="principal" onClick={() => setNouvelle({ titre: "", question: "" })}>
            Nouvelle étude
          </button>
          <button type="button" onClick={() => void ctx.plateforme.creerDossier(absolu(ctx.espace!.racine, DOSSIER)).then(() => ctx.plateforme.ouvrirDossier(absolu(ctx.espace!.racine, DOSSIER)))}>
            <IconeDossier taille={16} /> Dossier des études
          </button>
        </>
      }
    >
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      {nouvelle ? (
        <div className="carte nouvelle-etude">
          <input className="champ-e" placeholder="Titre (par exemple : Calage 2S2P1D du B2C4 bio)" value={nouvelle.titre} onChange={(e) => setNouvelle({ ...nouvelle, titre: e.target.value })} autoFocus />
          <textarea className="champ-e" rows={2} placeholder="La question, en une ou deux phrases, écrite avant de coder." value={nouvelle.question} onChange={(e) => setNouvelle({ ...nouvelle, question: e.target.value })} />
          <div className="rangee">
            <button type="button" className="principal" disabled={!nouvelle.titre.trim()} onClick={() => void creer()}>
              Créer
            </button>
            <button type="button" onClick={() => setNouvelle(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      {!etudes ? (
        <p className="discret">Chargement…</p>
      ) : etudes.length === 0 ? (
        <div className="carte">
          <p>Aucune étude.</p>
          <p className="discret">
            Créez-en une, ou copiez vos études de these-lgcb (<code>studies/&lt;date_titre&gt;/</code>) dans le dossier des études : elles apparaissent telles quelles.
          </p>
        </div>
      ) : (
        <div className="grille-cartes">
          {etudes.map((e) => {
            const d = e.executions[0];
            return (
              <button key={e.dossier} type="button" className="carte-module" onClick={() => setOuverte(e.dossier)}>
                <span className="carte-module-titre">{e.etude.titre}</span>
                <span className="discret petit">
                  {e.etude.date || e.dossier.slice(0, 10)} · {e.etude.statut}
                  {e.format === "lgcb" ? " · these-lgcb" : ""}
                </span>
                {e.etude.question ? <span className="petit">{e.etude.question.slice(0, 140)}</span> : null}
                <span className="petit">
                  {e.executions.length} exécution(s)
                  {d ? (
                    <>
                      {" · dernière "}
                      <Pastille niveau={d.statut === "ok" ? "ok" : d.statut === "erreur" ? "erreur" : "attention"}>{d.debut.slice(0, 10)}</Pastille>
                    </>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Page>
  );
}
