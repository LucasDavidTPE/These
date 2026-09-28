/**
 * Photos HEIC / HEIF (iPhone, certains Android) : le navigateur intégré de Windows ne les
 * décode pas. On les reconnaît à leur en-tête ISO BMFF (« ftyp » suivi d'une marque HEIF)
 * pour les convertir en PNG avant de les ouvrir (ui/cutout/imageIO.ts). L'AVIF, de la même
 * famille, est lu directement par le navigateur : il n'est pas concerné.
 */
const MARQUES = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

export function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const texte = (a: number) => String.fromCharCode(bytes[a]!, bytes[a + 1]!, bytes[a + 2]!, bytes[a + 3]!);
  if (texte(4) !== "ftyp") return false;
  const principale = texte(8);
  if (principale === "avif" || principale === "avis") return false;
  if (MARQUES.has(principale)) return true;
  // marques compatibles, jusqu'à la fin de la boîte ftyp
  const taille = Math.min(bytes.length, ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0);
  for (let i = 16; i + 4 <= taille; i += 4) if (MARQUES.has(texte(i))) return true;
  return false;
}
