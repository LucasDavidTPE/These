/**
 * Journaux Instron WaveMatrix (`.log`), écrits par la machine à la fin d'un essai.
 * Format : `date;heure;projet;essai;code;message[;valeur]`. Portage de
 * `lgcb/io/instron_log.py` (these-lgcb).
 */

export interface Journal {
  projet: string;
  essai: string;
  /** « AAAA-MM-JJ HH:MM:SS ». */
  debut: string;
  fin: string;
  operateur: string;
  poste: string;
  bati: string;
  logiciel: string;
  controleur: string;
  dureeS: number | null;
  cycles: Record<string, number>;
  sha256: Record<string, string>;
  etatFinal: string;
}

const CREE = "60101";
const LOGICIEL = "60104";
const CONTROLEUR = "60106";
const UTILISATEUR = "60107";
const ORDINATEUR = "60108";
const DIVERS = "60110";
const ETAT = "60202";
const DUREE = "60120";
const CYCLES = "60121";
const EMPREINTE = "62000";

function horodatage(date: string, heure: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date.trim());
  if (!m || !/^\d{2}:\d{2}:\d{2}$/.test(heure.trim())) return "";
  return `${m[3]}-${m[2]}-${m[1]} ${heure.trim()}`;
}

const nombre = (v: string) => Number(v.replace(",", "."));

export function lireJournal(texte: string): Journal {
  const j: Journal = { projet: "", essai: "", debut: "", fin: "", operateur: "", poste: "", bati: "", logiciel: "", controleur: "", dureeS: null, cycles: {}, sha256: {}, etatFinal: "" };
  for (const ligne of texte.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const p = ligne.split(";");
    if (p.length < 6) continue;
    const [date, heure, projet, essai, code, message] = p as [string, string, string, string, string, string];
    const valeur = p[6] ?? "";
    const h = horodatage(date, heure);
    j.projet ||= projet;
    j.essai ||= essai;
    switch (code) {
      case CREE:
        j.debut ||= h;
        break;
      case LOGICIEL:
        j.logiciel = valeur;
        break;
      case CONTROLEUR:
        j.controleur = valeur;
        break;
      case UTILISATEUR:
        j.operateur = valeur;
        break;
      case ORDINATEUR:
        j.poste = valeur;
        break;
      case DIVERS:
        if (message.includes("rie")) j.bati = valeur; // « Numéro de série du bâti »
        break;
      case ETAT:
        j.etatFinal = valeur;
        j.fin = h;
        break;
      case DUREE:
        j.dureeS = nombre(valeur);
        j.fin ||= h;
        break;
      case CYCLES:
        j.cycles[message] = Math.trunc(nombre(valeur));
        break;
      case EMPREINTE: {
        const b = message.split(",");
        if (b.length >= 3) j.sha256[b[1]!.trim()] = b[2]!.trim();
        break;
      }
    }
  }
  return j;
}
