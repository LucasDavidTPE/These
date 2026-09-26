/**
 * Accueil (SPEC §5) : cette semaine, derniers essais, dernières figures, une carte par
 * module, la liste « À régler ». Chaque encart vient d'une action nommée d'un autre module
 * et n'apparaît que si ce module est dans l'installeur.
 */
import { useEffect, useMemo, useState } from "react";
import { Page, Pastille, Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { ARegler } from "./ARegler";

function CarteModule({ m }: { m: Manifeste }) {
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
    <button type="button" className="carte-module" onClick={() => ctx.naviguer(m.id)}>
      <span className="carte-module-titre">
        <m.Icone />
        {m.titre}
        {m.aVenir ? (
          <span className="a-venir">
            <Pastille niveau="info">{m.aVenir}</Pastille>
          </span>
        ) : null}
      </span>
      <span className="discret">{m.resume}</span>
      {etat ? <span className="etat">{etat}</span> : null}
    </button>
  );
}

interface ElementSemaine {
  id: string;
  titre: string;
  debut: string;
  fin: string;
  detail?: string;
}

/** Résultat d'une action nommée d'un autre module ; null si le module est absent ou en attente. */
function useAction<T>(nom: string, charge: (ctx: ReturnType<typeof useContexte>) => unknown): T | null {
  const ctx = useContexte();
  const [r, setR] = useState<T | null>(null);
  const { registre, revision } = ctx;
  useEffect(() => {
    if (!registre.aAction(nom)) return;
    let annule = false;
    registre
      .executer(nom, charge(ctx))
      .then((x) => !annule && setR(x as T))
      .catch(() => !annule && setR([] as T));
    return () => {
      annule = true;
    };
    // Recalculé quand les fichiers changent, pas à chaque rendu du contexte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registre, revision, nom, ctx.reglages.figures]);
  return r;
}

const jour = (s: string) => new Date(s.includes("T") ? s : `${s.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

interface EssaiRecent {
  slug: string;
  campagne: string;
  essai: string;
  date: string;
  detail: string;
}

function DerniersEssais() {
  const ctx = useContexte();
  const essais = useAction<EssaiRecent[]>("campagnes.recents", (c) => c);
  if (!essais) return null;
  return (
    <Section titre="Derniers essais">
      {essais.length === 0 ? (
        <p className="discret">Aucun essai daté : découvrez les essais d'une campagne depuis son dossier de données.</p>
      ) : (
        <ul className="liste">
          {essais.map((e) => (
            <li key={`${e.slug}/${e.essai}`}>
              <button type="button" className="lien" onClick={() => void ctx.registre.executer("campagnes.ouvrir", { ctx, slug: e.slug })}>
                <strong>{e.essai}</strong> · {e.campagne}
              </button>{" "}
              <span className="discret">
                {jour(e.date)}
                {e.detail ? ` · ${e.detail}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
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

function DernieresFigures() {
  const ctx = useContexte();
  const figures = useAction<FigureRecente[]>("figures.recentes", (c) => c);
  const urls = useMemo(() => (figures ?? []).map((f) => (f.image ? URL.createObjectURL(new Blob([f.image as BlobPart], { type: f.type })) : null)), [figures]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  if (!figures || (figures.length === 0 && !ctx.reglages.figures)) return null;
  return (
    <Section titre="Dernières figures">
      {figures.length === 0 ? (
        <p className="discret">La bibliothèque de figures est vide.</p>
      ) : (
        <ul className="accueil-figures">
          {figures.map((f, i) => (
            <li key={f.dossier}>
              <button type="button" onClick={() => void ctx.registre.executer("figures.ouvrir", { ctx, dossier: f.dossier })} title={`${f.id} · modifiée le ${jour(f.date)}`}>
                <span className="accueil-vignette">{urls[i] ? <img src={urls[i]!} alt="" /> : <span className="discret petit">Pas d'aperçu</span>}</span>
                <span className="accueil-figure-titre">{f.titre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** « Cette semaine » : fourni par le Planning, s'il est dans l'installeur (action nommée). */
function CetteSemaine() {
  const ctx = useContexte();
  const [elements, setElements] = useState<ElementSemaine[] | null>(null);
  const { registre, revision } = ctx;
  useEffect(() => {
    if (!registre.aAction("planning.cette-semaine")) return;
    let annule = false;
    registre
      .executer("planning.cette-semaine", ctx)
      .then((r) => !annule && setElements(r as ElementSemaine[]))
      .catch(() => !annule && setElements([]));
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registre, revision]);
  if (!elements) return null;
  const date = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return (
    <Section titre="Cette semaine">
      {elements.length === 0 ? (
        <p className="discret">Rien d'inscrit au planning pour les 7 prochains jours.</p>
      ) : (
        <ul className="liste">
          {elements.map((e) => (
            <li key={e.id}>
              <strong>{e.titre}</strong>{" "}
              <span className="discret">
                {e.fin ? `${date(e.debut)} → ${date(e.fin)}` : date(e.debut)}
                {e.detail ? ` · ${e.detail}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function AccueilPage() {
  const ctx = useContexte();
  const autres = ctx.registre.manifestes.filter((m) => m.id !== "accueil");

  return (
    <Page
      titre="Accueil"
      sousTitre={
        <>
          Poste {ctx.poste}
          {ctx.espace ? (
            <>
              {" · espace "}
              <span className="chemin">{ctx.espace.racine}</span>
            </>
          ) : null}
        </>
      }
    >
      <CetteSemaine />
      <DerniersEssais />
      <DernieresFigures />
      <Section titre="Modules">
        <div className="grille-cartes">
          {autres.map((m) => (
            <CarteModule key={m.id} m={m} />
          ))}
        </div>
      </Section>
      <ARegler />
    </Page>
  );
}
