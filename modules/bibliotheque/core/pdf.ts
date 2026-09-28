/**
 * Nom du PDF d'une référence, selon la convention des PDF déjà rangés dans la racine
 * « biblio-pdf » : `BIB-003_Tielking_1989_Aircraft-tire-pavement-pressure-distribution.pdf`.
 *   - auteurs : nom du premier (« De Beer » → « DeBeer », « Cardoso da Silva » → « CardosoDaSilva ») ; deux auteurs « X-Y » ; au-delà
 *     « X-etal » ; un organisme (sans virgule) garde son premier mot (« Airbus S.A.S. » → Airbus) ;
 *   - titre court : les mots significatifs du titre (sans mots vides), six au plus, reliés par
 *     des tirets, sans accents ; les sigles gardent leurs majuscules.
 */
import type { Reference } from "./modele";

const MOTS_VIDES = new Set(
  (
    "a an the of in on for and or to with by at from into toward towards using via its their based as is are be " +
    "le la les de des du d l un une et en pour sur dans par au aux avec vers ou a"
  ).split(" "),
);

/** Lettres sans décomposition Unicode (ł de Wesołowski, ø, ß…). */
const SPECIALES: Record<string, string> = { ł: "l", Ł: "L", ø: "o", Ø: "O", ß: "ss", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", đ: "d", Đ: "D", ı: "i", þ: "th", ð: "d" };
const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁøØßæÆœŒđĐıþð]/g, (c) => SPECIALES[c] ?? c);

/** Partie « auteurs » du nom. */
export function auteursPourNom(auteurs: string): string {
  const liste = auteurs
    .split(/;|\s+&\s+|\s+and\s+|\s+et\s+/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (!liste.length) return "Anonyme";
  const nom = (a: string) => {
    const brut = a.includes(",") ? a.split(",")[0]! : a.split(/\s+/)[0]!;
    // « Cardoso da Silva » → CardosoDaSilva, « De Beer » → DeBeer
    return (
      ascii(brut)
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
        .join("") || "Anonyme"
    );
  };
  if (liste.length === 1) return nom(liste[0]!);
  if (liste.length === 2) return `${nom(liste[0]!)}-${nom(liste[1]!)}`;
  return `${nom(liste[0]!)}-etal`;
}

/** Titre court : mots significatifs, six au plus. */
export function titreCourt(titre: string, max = 6): string {
  const mots = ascii(titre)
    .replace(/[—–]/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter((m) => m && !MOTS_VIDES.has(m.toLowerCase()));
  const garde = mots.slice(0, max).map((m, i) => {
    const sigle = m.length > 1 && m === m.toUpperCase() && /[A-Z]/.test(m);
    if (sigle) return m;
    const bas = m.toLowerCase();
    return i === 0 ? bas.charAt(0).toUpperCase() + bas.slice(1) : bas;
  });
  return garde.join("-") || "Sans-titre";
}

export function nomPdf(id: string, r: Pick<Reference, "auteurs" | "annee" | "titre">): string {
  const annee = r.annee ? String(r.annee) : "sd";
  return `${id}_${auteursPourNom(r.auteurs)}_${annee}_${titreCourt(r.titre)}.pdf`;
}

/** Chemin relatif de `chemin` dans `racine` (Windows ou POSIX, casse ignorée), ou null s'il est ailleurs. */
export function dansRacine(chemin: string, racine: string): string | null {
  const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
  const c = norm(chemin),
    r = norm(racine);
  if (c.toLowerCase().startsWith(r.toLowerCase() + "/")) return c.slice(r.length + 1);
  return null;
}
