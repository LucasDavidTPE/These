/**
 * Composants d'interface communs à tous les modules : page, carte, pastille de niveau.
 */
import type { ReactNode } from "react";
import type { Niveau } from "@noyau/diagnostic";

export function Page({ titre, sousTitre, actions, children }: { titre: string; sousTitre?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page">
      <header className="page-entete">
        <div>
          <h1>{titre}</h1>
          {sousTitre ? <p className="discret">{sousTitre}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Section({ titre, children, aDroite }: { titre: string; children?: ReactNode; aDroite?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-entete">
        <h2>{titre}</h2>
        {aDroite}
      </div>
      {children}
    </section>
  );
}

const LIBELLE_NIVEAU: Record<Niveau, string> = { ok: "OK", attention: "À voir", erreur: "Erreur", info: "Info" };

export function Pastille({ niveau, children }: { niveau: Niveau; children?: ReactNode }) {
  return <span className={`pastille pastille-${niveau}`}>{children ?? LIBELLE_NIVEAU[niveau]}</span>;
}

export function Message({ niveau, children }: { niveau: "info" | "attention" | "erreur"; children: ReactNode }) {
  return (
    <div className={`message message-${niveau}`} role={niveau === "erreur" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/**
 * Page d'un module pas encore construit : ce qu'il fera, et ce qu'on utilise en attendant.
 * Disparaît module par module au fil de la feuille de route.
 */
export function PageAVenir({
  titre,
  resume,
  phase,
  prevu,
  enAttendant,
}: {
  titre: string;
  resume: string;
  phase: string;
  prevu: string[];
  enAttendant: ReactNode;
}) {
  return (
    <Page titre={titre} sousTitre={resume}>
      <Message niveau="info">
        Ce module arrive en phase <strong>{phase}</strong> de la feuille de route.
      </Message>
      <Section titre="Ce qu'il fera">
        <ul className="liste">
          {prevu.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>
      <Section titre="En attendant">
        <div className="carte">{enAttendant}</div>
      </Section>
    </Page>
  );
}
