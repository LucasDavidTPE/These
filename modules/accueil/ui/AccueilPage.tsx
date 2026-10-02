/**
 * Accueil (SPEC §5) : un bandeau (salutation, date, avancement de la thèse d'après le
 * planning, prochain jalon), cette semaine, derniers essais, dernières figures, une tuile par
 * module et la liste « À régler ». Chaque encart vient d'une action nommée d'un autre module
 * et n'apparaît que si ce module est dans l'installeur.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Pastille } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { ARegler } from "./ARegler";
import "./accueil.css";

/** Teinte de chaque module (tuiles et pastilles), lisible en clair comme en sombre. */
const TEINTES: Record<string, number> = {
  figures: 275,
  traitement: 172,
  campagnes: 28,
  etudes: 212,
  manuscrits: 350,
  chausspec: 12,
  numeriseur: 52,
  bibliotheque: 128,
  planning: 245,
  journal: 300,
};
const teinte = (id: string) => ({ "--teinte": TEINTES[id] ?? 210 }) as CSSProperties;

/** Résultat d'une action nommée d'un autre module ; null si le module est absent ou en attente. */
function useAction<T>(nom: string, charge: (ctx: ReturnType<typeof useContexte>) => unknown, secours: T): T | null {
  const ctx = useContexte();
  const [r, setR] = useState<T | null>(null);
  const { registre, revision } = ctx;
  useEffect(() => {
    if (!registre.aAction(nom)) return;
    let annule = false;
    registre
      .executer(nom, charge(ctx))
      .then((x) => !annule && setR(x as T))
      .catch(() => !annule && setR(secours));
    return () => {
      annule = true;
    };
    // Recalculé quand les fichiers changent, pas à chaque rendu du contexte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registre, revision, nom, ctx.dossierFigures]);
  return r;
}

const jour = (s: string) => new Date(s.includes("T") ? s : `${s.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const jourCourt = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);

/* ───────────────────────────── bandeau ───────────────────────────── */

interface Avancement {
  debut: string;
  fin: string;
  part: number;
  joursRestants: number;
  prochainJalon: { titre: string; date: string; dans: number } | null;
}

function salutation(h: number) {
  return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

function dans(n: number) {
  return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n < 60 ? `dans ${n} jours` : `dans ${Math.round(n / 30.4)} mois`;
}

function Bandeau({ semaine }: { semaine: number | null }) {
  const ctx = useContexte();
  const av = useAction<Avancement | null>("planning.avancement", (c) => c, null);
  const maintenant = new Date();
  const date = maintenant.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const n = ctx.problemes.length;
  return (
    <header className={`acc-bandeau${av ? "" : " acc-bandeau-seul"}`}>
      <div className="acc-bandeau-texte">
        <p className="acc-date">{date.charAt(0).toUpperCase() + date.slice(1)}</p>
        <h1>{salutation(maintenant.getHours())}</h1>
        <p className="acc-sous">
          {ctx.produit.nom} {ctx.version} · poste {ctx.poste}
          {ctx.espace ? (
            <>
              {" · "}
              <span className="chemin" title={ctx.espace.racine}>
                {ctx.espace.racine.split(/[\\/]/).slice(-2).join("\\")}
              </span>
            </>
          ) : null}
        </p>
        <div className="acc-pastilles">
          {semaine !== null ? (
            <button type="button" className="acc-pastille" onClick={() => document.getElementById("acc-semaine")?.scrollIntoView({ behavior: "smooth" })}>
              {semaine ? (
                <>
                  <strong>{semaine}</strong> {semaine > 1 ? "éléments" : "élément"} cette semaine
                </>
              ) : (
                "Rien au planning cette semaine"
              )}
            </button>
          ) : null}
          <button type="button" className={`acc-pastille${n ? " acc-pastille-attention" : " acc-pastille-ok"}`} onClick={() => document.getElementById("acc-regler")?.scrollIntoView({ behavior: "smooth" })}>
            {n ? (
              <>
                <strong>{n}</strong> à régler
              </>
            ) : (
              "Rien à régler"
            )}
          </button>
        </div>
      </div>
      {av ? (
        <div className="acc-avancement" aria-label="Avancement de la thèse d'après le planning">
          <div className="acc-avancement-tete">
            <span>Thèse</span>
            <strong>{Math.round(av.part * 100)} %</strong>
          </div>
          <div className="acc-barre" role="progressbar" aria-valuenow={Math.round(av.part * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${av.part * 100}%` }} />
          </div>
          <div className="acc-avancement-bornes">
            <span>{jour(av.debut)}</span>
            <span>{jour(av.fin)}</span>
          </div>
          <p className="acc-reste">{av.joursRestants > 0 ? `${av.joursRestants.toLocaleString("fr-FR")} jours avant la fin du planning` : "Fin du planning atteinte"}</p>
          {av.prochainJalon ? (
            <button type="button" className="acc-jalon" onClick={() => ctx.naviguer("planning")}>
              <span className="acc-jalon-losange" aria-hidden="true" />
              <span>
                <strong>{av.prochainJalon.titre}</strong>
                <span className="discret">
                  {" "}
                  · {jour(av.prochainJalon.date)}, {dans(av.prochainJalon.dans)}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

/* ───────────────────────────── encarts ───────────────────────────── */

function Encart({ id, titre, action, children }: { id?: string; titre: string; action?: { texte: string; faire(): void }; children: React.ReactNode }) {
  return (
    <section className="acc-encart" id={id}>
      <header>
        <h2>{titre}</h2>
        {action ? (
          <button type="button" className="lien" onClick={action.faire}>
            {action.texte} →
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Vide({ children }: { children: React.ReactNode }) {
  return <p className="acc-vide">{children}</p>;
}

interface ElementSemaine {
  id: string;
  titre: string;
  debut: string;
  fin: string;
  detail?: string;
  couleur?: string | null;
}

function CetteSemaine({ elements }: { elements: ElementSemaine[] }) {
  const ctx = useContexte();
  return (
    <Encart id="acc-semaine" titre="Cette semaine" action={{ texte: "Planning", faire: () => ctx.naviguer("planning") }}>
      {elements.length === 0 ? (
        <Vide>Rien d'inscrit au planning pour les 7 prochains jours.</Vide>
      ) : (
        <ul className="acc-semaine">
          {elements.map((e) => {
            const d = jourCourt(e.debut);
            return (
              <li key={e.id} style={{ "--couleur": e.couleur ?? "var(--accent)" } as CSSProperties}>
                <span className="acc-jour">
                  <span>{d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span>
                  <strong>{d.getDate()}</strong>
                  <span>{d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span>
                </span>
                <span className="acc-semaine-texte">
                  <strong>{e.titre}</strong>
                  <span className="discret petit">
                    {e.fin ? `jusqu'au ${jourCourt(e.fin).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : "jalon"}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Encart>
  );
}

interface TacheDuJour {
  ligne: number;
  fait: boolean;
  texte: string;
}

function Aujourdhui({ taches }: { taches: TacheDuJour[] }) {
  const ctx = useContexte();
  const [ajout, setAjout] = useState(false);
  const ouvertes = taches.filter((t) => !t.fait);
  return (
    <Encart titre="Aujourd'hui" action={{ texte: "Journal", faire: () => ctx.naviguer("journal") }}>
      {taches.length === 0 ? (
        <Vide>Aucune tâche pour aujourd'hui.</Vide>
      ) : (
        <ul className="acc-taches">
          {[...ouvertes, ...taches.filter((t) => t.fait)].slice(0, 8).map((t) => (
            <li key={t.ligne} className={t.fait ? "fait" : undefined}>
              <label>
                <input type="checkbox" checked={t.fait} disabled={ajout} onChange={() => (setAjout(true), void ctx.registre.executer("journal.basculer", { ctx, ligne: t.ligne }).finally(() => setAjout(false)))} /> {t.texte}
              </label>
            </li>
          ))}
        </ul>
      )}
      {taches.length > 8 ? <p className="discret petit">… et {taches.length - 8} autre(s) dans le journal.</p> : null}
    </Encart>
  );
}

interface EssaiRecent {
  slug: string;
  campagne: string;
  essai: string;
  date: string;
  detail: string;
}

function DerniersEssais({ essais }: { essais: EssaiRecent[] }) {
  const ctx = useContexte();
  return (
    <Encart titre="Derniers essais" action={{ texte: "Campagnes", faire: () => ctx.naviguer("campagnes") }}>
      {essais.length === 0 ? (
        <Vide>Aucun essai daté : découvrez les essais d'une campagne depuis son dossier de données.</Vide>
      ) : (
        <ul className="acc-liste">
          {essais.map((e) => (
            <li key={`${e.slug}/${e.essai}`}>
              <button type="button" onClick={() => void ctx.registre.executer("campagnes.ouvrir", { ctx, slug: e.slug })}>
                <span className="acc-puce" style={teinte("campagnes")} aria-hidden="true" />
                <span className="acc-liste-texte">
                  <strong>{e.essai}</strong>
                  <span className="discret petit">
                    {e.campagne} · {jour(e.date)}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Encart>
  );
}

interface FigureRecente {
  dossier: string;
  id: string;
  titre: string;
  date: string;
  image: Uint8Array | null;
  type: string;
}

/** Vignette en URL data : pas d'URL blob à révoquer (le double montage de React la cassait). */
function enDataUrl(octets: Uint8Array, type: string): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binaire)}`;
}

function DernieresFigures({ figures }: { figures: FigureRecente[] }) {
  const ctx = useContexte();
  const urls = useMemo(() => figures.map((f) => (f.image ? enDataUrl(f.image, f.type) : null)), [figures]);
  return (
    <Encart titre="Dernières figures" action={{ texte: "Figures", faire: () => ctx.naviguer("figures") }}>
      {figures.length === 0 ? (
        <Vide>La bibliothèque de figures est vide.</Vide>
      ) : (
        <ul className="acc-figures">
          {figures.map((f, i) => (
            <li key={f.dossier}>
              <button type="button" onClick={() => void ctx.registre.executer("figures.ouvrir", { ctx, dossier: f.dossier })} title={`${f.titre}\n${f.id} · modifiée le ${jour(f.date)}`}>
                <span className="acc-vignette">{urls[i] ? <img src={urls[i]!} alt="" /> : <span className="discret petit">Pas d'aperçu</span>}</span>
                <span className="acc-figure-titre">{f.titre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Encart>
  );
}

/* ───────────────────────────── modules ───────────────────────────── */

function TuileModule({ m }: { m: Manifeste }) {
  const ctx = useContexte();
  const [etat, setEtat] = useState<string | null>(null);
  const { revision } = ctx;
  useEffect(() => {
    if (!m.etat) return;
    let annule = false;
    m.etat(ctx)
      .then((e) => !annule && setEtat(e))
      .catch(() => !annule && setEtat(null));
    return () => {
      annule = true;
    };
    // Recalculé quand les fichiers changent, pas à chaque rendu du contexte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, revision]);
  return (
    <button type="button" className="acc-tuile" style={teinte(m.id)} onClick={() => ctx.naviguer(m.id)}>
      <span className="acc-tuile-icone" aria-hidden="true">
        <m.Icone taille={22} />
      </span>
      <span className="acc-tuile-corps">
        <span className="acc-tuile-titre">
          {m.titre}
          {m.aVenir ? <Pastille niveau="info">{m.aVenir}</Pastille> : null}
        </span>
        <span className="acc-tuile-resume">{m.resume}</span>
        {etat ? <span className="acc-tuile-etat">{etat}</span> : null}
      </span>
    </button>
  );
}

/* ───────────────────────────── page ───────────────────────────── */

export function AccueilPage() {
  const ctx = useContexte();
  const autres = ctx.registre.manifestes.filter((m) => m.id !== "accueil");
  const semaine = useAction<ElementSemaine[]>("planning.cette-semaine", (c) => c, []);
  const jour = useAction<{ taches: TacheDuJour[] } | null>("journal.aujourdhui", (c) => c, null);
  const essais = useAction<EssaiRecent[]>("campagnes.recents", (c) => c, []);
  const figures = useAction<FigureRecente[]>("figures.recentes", (c) => c, []);
  const montrerFigures = figures && (figures.length > 0 || !!ctx.dossierFigures);
  const encarts = [jour, semaine, essais, montrerFigures ? figures : null].filter((x) => x !== null).length;

  return (
    <div className="acc">
      <Bandeau semaine={semaine ? semaine.length : null} />
      {encarts ? (
        <div className="acc-grille">
          {jour ? <Aujourdhui taches={jour.taches} /> : null}
          {semaine ? <CetteSemaine elements={semaine} /> : null}
          {essais ? <DerniersEssais essais={essais} /> : null}
          {montrerFigures && figures ? <DernieresFigures figures={figures} /> : null}
        </div>
      ) : null}
      <section className="acc-modules">
        <h2>Modules</h2>
        <div className="acc-tuiles">
          {autres.map((m) => (
            <TuileModule key={m.id} m={m} />
          ))}
        </div>
      </section>
      <div id="acc-regler">
        <ARegler />
      </div>
    </div>
  );
}
