/**
 * Les formules du classeur, à l'identique (SPEC §9.1) : citation, état, alerte, score,
 * temps de lecture, tableau de bord, demandes. Chaque fonction cite la cellule d'origine ;
 * `conformite.test.ts` compare les résultats aux valeurs calculées par Excel.
 */
import type { Demande, Parametres, Reference } from "./modele";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « AAAA-MM-JJ » → [année, mois 1-12, jour]. */
function decouper(date: string): [number, number, number] {
  const [a, m, j] = date.split("-").map(Number);
  return [a!, m!, j!];
}

/** Paramètres!C8 : mois du plan en cours, de 1 à nbMois + 1 (plan terminé). */
export function moisCourant(aujourdhui: string, p: Parametres): number {
  const [a, m] = decouper(aujourdhui);
  const [a0, m0] = decouper(p.debutPlan);
  return Math.max(1, Math.min(p.nbMois + 1, (a - a0) * 12 + m - m0 + 1));
}

/** Premier jour du mois `n` du plan (Paramètres!U6:U11). */
export function premierJourDuMois(n: number, p: Parametres): string {
  const [a0, m0] = decouper(p.debutPlan);
  const d = new Date(Date.UTC(a0, m0 - 1 + n - 1, 1));
  return d.toISOString().slice(0, 10);
}

/** Paramètres!T6:T11 : « octobre 2026 ». */
export function libelleMois(n: number, p: Parametres): string {
  const [a, m] = decouper(premierJourDuMois(n, p));
  return `${MOIS[m - 1]} ${a}`;
}

export function ajouterJours(date: string, jours: number): string {
  const [a, m, j] = decouper(date);
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

/** Références!C : « De Beer et al. (2012) », « Olard & Di Benedetto (2003) », « Tielking (1989) ». */
export function citation(r: Pick<Reference, "auteurs" | "annee" | "cle">): string {
  if (!r.cle) return "";
  const auteurs = r.auteurs.split(";").map((a) => a.trim());
  const nom = (a: string) => (a.includes(",") ? a.slice(0, a.indexOf(",")) : a);
  const suite = auteurs.length === 1 ? "" : auteurs.length === 2 ? ` & ${nom(auteurs[1]!)}` : " et al.";
  return `${nom(auteurs[0] ?? "")}${suite} (${r.annee ?? ""})`;
}

/** Références!O : PDF récupéré dès que le fichier est renseigné. */
export function pdfRecupere(r: Reference): boolean {
  return r.fichierPdf.trim() !== "";
}

export type Etat = "Lu" | "Écarté" | "EN RETARD" | "Ce mois-ci" | "Mois prochain" | "À venir" | "";

/** Références!K. */
export function etat(r: Reference, mc: number): Etat {
  if (!r.cle) return "";
  if (r.statut === "Lu") return "Lu";
  if (r.statut === "Écarté") return "Écarté";
  const m = r.mois ?? 0; // cellule vide = 0 pour Excel
  if (m < mc) return "EN RETARD";
  if (m === mc) return "Ce mois-ci";
  if (m === mc + 1) return "Mois prochain";
  return "À venir";
}

const PDF_LIBRE = (r: Reference) => r.accesDocument === "PDF libre" || r.accesDocument === "PDF libre (dépôt)";

/** Références!L. `pdf` : PDF récupéré (par défaut, fichier renseigné). */
export function alerte(r: Reference, pdf = pdfRecupere(r)): string {
  if (!r.cle) return "";
  if (r.verification === "Non vérifié") return "Ne pas citer en l'état : métadonnées non vérifiées";
  if (r.verification === "Partiel") return "Vérification à compléter avant de citer";
  if (pdf) return "";
  if (PDF_LIBRE(r)) return "PDF libre à télécharger";
  if (r.accesDocument === "Éditeur (abonnement)") return "À télécharger via l'accès ENTPE";
  if (r.accesDocument === "Payant (boutique)") return "À consulter via l'abonnement de l'école";
  if (r.accesDocument === "Non diffusé (à demander)") return "Document à demander (feuille Demandes)";
  return "Texte intégral à localiser";
}

/** Références!M : score de priorité (quoi lire maintenant). */
export function score(r: Reference, p: Parametres, mc: number, pdf = pdfRecupere(r)): number {
  if (!r.cle || r.statut === "Lu" || r.statut === "Écarté") return 0;
  const b = p.bareme;
  const m = r.mois ?? 0;
  return (
    (b.priorites[r.priorite] ?? 0) +
    b.parMoisDAvance * (7 - m) +
    (m < mc ? b.retard : 0) +
    (r.tfe ? b.tfe : 0) +
    (r.verification !== "Vérifié" ? b.verification : 0) +
    (!pdf && PDF_LIBRE(r) ? b.pdfLibre : 0)
  );
}

/** Références!AT : temps de lecture estimé (h). */
export function temps(r: Reference, p: Parametres): number {
  return r.cle ? (p.tempsHeures[r.priorite] ?? 0) : 0;
}

export interface Calcule {
  id: string;
  ref: Reference;
  citation: string;
  etat: Etat;
  alerte: string;
  score: number;
  /** Références!BA : score + départage par l'ordre du classeur (le premier l'emporte). */
  scoreTri: number;
  temps: number;
  /** PDF récupéré, tel qu'utilisé dans le calcul. */
  pdf: boolean;
}

/**
 * Toutes les colonnes calculées, dans l'ordre des références (celui des ID).
 * `pdf` remplace la règle « PDF récupéré » : sert au test de conformité, qui rejoue la
 * colonne O telle qu'Excel l'a calculée (elle est fausse à partir de la ligne 124).
 */
export function calculer(refs: { id: string; valeur: Reference }[], p: Parametres, mc: number, pdf?: (id: string) => boolean): Calcule[] {
  return refs.map(({ id, valeur: r }, i) => {
    const recupere = pdf ? pdf(id) : pdfRecupere(r);
    const s = score(r, p, mc, recupere);
    return { id, ref: r, citation: citation(r), etat: etat(r, mc), alerte: alerte(r, recupere), score: s, scoreTri: s + (1000 - (i + 2)) / 100000, temps: temps(r, p), pdf: recupere };
  });
}

// ---- Demandes ----

/** Demandes!J : date limite d'envoi. */
export function dateLimite(d: Demande, p: Parametres): string {
  if (d.moisUsage === null || d.delaiMaxSemaines === null) return "";
  return ajouterJours(premierJourDuMois(d.moisUsage, p), -7 * d.delaiMaxSemaines);
}

/** Demandes!M : date de relance. */
export function relanceLe(d: Demande, p: Parametres): string {
  return d.dateEnvoi ? ajouterJours(d.dateEnvoi, p.delaiRelanceJours) : "";
}

/** Demandes!N. */
export function alerteDemande(d: Demande, p: Parametres, aujourdhui: string): string {
  if (!d.document) return "";
  if (d.statut === "Reçue" || d.statut === "Abandonnée") return "";
  if (!d.dateEnvoi) return aujourdhui >= dateLimite(d, p) ? "ENVOYER MAINTENANT" : "À envoyer avant la date limite";
  return aujourdhui >= relanceLe(d, p) ? "RELANCER" : "En attente";
}

// ---- Tableau de bord ----

export interface LigneAxe {
  numero: number;
  intitule: string;
  total: number;
  incontournables: number;
  lues: number;
  reste: number;
  partLue: number;
  heuresRestantes: number;
}

export interface LigneMois {
  numero: number;
  libelle: string;
  total: number;
  lues: number;
  reste: number;
  heuresPrevues: number;
  heuresRestantes: number;
  capacite: number;
  charge: number;
  etat: "Terminé" | "En retard" | "En cours" | "À venir";
}

export interface TableauDeBord {
  total: number;
  tfe: number;
  verifiees: number;
  partielles: number;
  nonVerifiees: number;
  avecDoi: number;
  pdfLibres: number;
  viaAbonnement: number;
  payantes: number;
  aDemander: number;
  lues: number;
  enCours: number;
  tauxLecture: number;
  enRetard: number;
  ceMois: number;
  pdfLibresATelecharger: number;
  demandesAEnvoyer: number;
  correctionsRestantes: number;
  moisCourant: number;
  libelleMoisCourant: string;
  heuresRestantesMois: number;
  heuresEnRetard: number;
  charge: string;
  prochaineAction: string;
  parAxe: LigneAxe[];
  parMois: LigneMois[];
  /** Les 8 meilleurs scores non lus (feuille Tableau de bord, F27:L34). */
  prochaines: Calcule[];
  parAcces: { acces: string; nombre: number; part: number }[];
}

export function tableauDeBord(
  calc: Calcule[],
  demandes: Demande[],
  correctionsNonFaites: number,
  p: Parametres,
  aujourdhui: string,
): TableauDeBord {
  const mc = moisCourant(aujourdhui, p);
  const refs = calc.filter((c) => c.ref.cle);
  const n = (f: (c: Calcule) => boolean) => refs.filter(f).length;
  const somme = (f: (c: Calcule) => boolean) => refs.filter(f).reduce((s, c) => s + c.temps, 0);
  const finie = (c: Calcule) => c.ref.statut === "Lu" || c.ref.statut === "Écarté";
  const acces = (a: string) => (c: Calcule) => c.ref.accesDocument === a;
  const total = refs.length;
  const ecartees = n((c) => c.ref.statut === "Écarté");
  const lues = n((c) => c.ref.statut === "Lu");
  const pdfLibresATelecharger = n((c) => PDF_LIBRE(c.ref) && !c.pdf);
  const demandesAEnvoyer = demandes.filter((d) => ["ENVOYER MAINTENANT", "RELANCER"].includes(alerteDemande(d, p, aujourdhui))).length;
  const heuresRestantesMois = somme((c) => (c.ref.mois ?? 0) === mc && !finie(c));
  const heuresEnRetard = somme((c) => c.etat === "EN RETARD");

  const parMois: LigneMois[] = Array.from({ length: p.nbMois }, (_, i) => {
    const m = i + 1;
    const du = (c: Calcule) => c.ref.mois === m;
    const t = n(du);
    const l = n((c) => du(c) && c.ref.statut === "Lu");
    const reste = t - l - n((c) => du(c) && c.ref.statut === "Écarté");
    const prevues = somme(du);
    const restantes = prevues - somme((c) => du(c) && finie(c));
    return {
      numero: m,
      libelle: libelleMois(m, p),
      total: t,
      lues: l,
      reste,
      heuresPrevues: prevues,
      heuresRestantes: restantes,
      capacite: p.capaciteHeures,
      charge: p.capaciteHeures ? prevues / p.capaciteHeures : 0,
      etat: reste === 0 ? "Terminé" : m < mc ? "En retard" : m === mc ? "En cours" : "À venir",
    };
  });

  const parAxe: LigneAxe[] = p.axes.map((a) => {
    const de = (c: Calcule) => c.ref.axe === a.numero;
    const t = n(de);
    const l = n((c) => de(c) && c.ref.statut === "Lu");
    const e = n((c) => de(c) && c.ref.statut === "Écarté");
    return {
      numero: a.numero,
      intitule: a.intitule,
      total: t,
      incontournables: n((c) => de(c) && c.ref.priorite === "INCONTOURNABLE"),
      lues: l,
      reste: t - l - e,
      partLue: t - e > 0 ? l / (t - e) : 0,
      heuresRestantes: somme(de) - somme((c) => de(c) && finie(c)),
    };
  });

  const prochaines = [...refs]
    .filter((c) => c.score > 0)
    .sort((a, b) => b.scoreTri - a.scoreTri)
    .slice(0, 8);
  const premiere = prochaines[0];

  return {
    total,
    tfe: n((c) => c.ref.tfe),
    verifiees: n((c) => c.ref.verification === "Vérifié"),
    partielles: n((c) => c.ref.verification === "Partiel"),
    nonVerifiees: n((c) => c.ref.verification === "Non vérifié"),
    avecDoi: n((c) => c.ref.doi !== ""),
    pdfLibres: n(acces("PDF libre")) + n(acces("PDF libre (dépôt)")),
    viaAbonnement: n(acces("Éditeur (abonnement)")),
    payantes: n(acces("Payant (boutique)")),
    aDemander: n(acces("Non diffusé (à demander)")) + n(acces("Notice en ligne (texte à localiser)")),
    lues,
    enCours: n((c) => c.ref.statut === "En cours"),
    tauxLecture: total - ecartees > 0 ? lues / (total - ecartees) : 0,
    enRetard: n((c) => c.etat === "EN RETARD"),
    ceMois: n((c) => c.etat === "Ce mois-ci"),
    pdfLibresATelecharger,
    demandesAEnvoyer,
    correctionsRestantes: correctionsNonFaites,
    moisCourant: mc,
    libelleMoisCourant: mc > p.nbMois ? "Plan terminé" : `${mc} — ${libelleMois(mc, p)}`,
    heuresRestantesMois,
    heuresEnRetard,
    charge: heuresRestantesMois + heuresEnRetard > p.capaciteHeures ? "Surcharge : reporter des « A consulter » au mois suivant" : "Dans la capacité",
    prochaineAction:
      demandesAEnvoyer > 0
        ? `Envoyer ou relancer ${demandesAEnvoyer} demande(s)`
        : pdfLibresATelecharger > 0
          ? `Télécharger ${pdfLibresATelecharger} PDF libre(s)`
          : premiere
            ? `Lire ${premiere.citation}`
            : "Rien en attente",
    parAxe,
    parMois,
    prochaines,
    parAcces: ["PDF libre", "PDF libre (dépôt)", "Éditeur (abonnement)", "Payant (boutique)", "Non diffusé (à demander)", "Notice en ligne (texte à localiser)"].map((a) => {
      const nombre = n(acces(a));
      return { acces: a, nombre, part: total ? nombre / total : 0 };
    }),
  };
}
