/**
 * Lecture d'archive zip, juste ce qu'il faut pour un .xlsx (portage de io/zip.js).
 *
 * La décompression est confiée à DecompressionStream, implémenté nativement : c'est du code
 * compilé, bien plus rapide que n'importe quel inflate écrit en JavaScript, et les octets
 * sortent par morceaux, ce qui permet d'analyser au fil de l'eau sans jamais tenir les 206 Mo
 * de la feuille en mémoire d'un seul tenant.
 */

const SIG_FIN_CENTRAL = 0x06054b50;
const SIG_ENTREE_CENTRALE = 0x02014b50;

export interface EntreeZip {
  nom: string;
  methode: number;
  debut: number;
  tailleCompressee: number;
  tailleBrute: number;
}

export function lireRepertoire(buffer: ArrayBuffer): Map<string, EntreeZip> {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const n = u8.length;

  // fin du répertoire central : signature cherchée depuis la fin
  let fin = -1;
  for (let i = n - 22; i >= Math.max(0, n - 66000); i--) {
    if (dv.getUint32(i, true) === SIG_FIN_CENTRAL) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("Archive illisible : ce fichier n'est pas un .xlsx valide.");

  let nbEntrees = dv.getUint16(fin + 10, true);
  let debutCentral = dv.getUint32(fin + 16, true);

  // zip64 : les compteurs 32 bits sont saturés
  if (debutCentral === 0xffffffff || nbEntrees === 0xffff) {
    for (let i = fin - 20; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x07064b50) {
        const loc = Number(dv.getBigUint64(i + 8, true));
        nbEntrees = Number(dv.getBigUint64(loc + 32, true));
        debutCentral = Number(dv.getBigUint64(loc + 48, true));
        break;
      }
    }
  }

  const decodeur = new TextDecoder("utf-8");
  const entrees = new Map<string, EntreeZip>();
  let p = debutCentral;
  for (let e = 0; e < nbEntrees && p + 46 <= n; e++) {
    if (dv.getUint32(p, true) !== SIG_ENTREE_CENTRALE) break;
    const methode = dv.getUint16(p + 10, true);
    let tailleCompressee = dv.getUint32(p + 20, true);
    let tailleBrute = dv.getUint32(p + 24, true);
    const lNom = dv.getUint16(p + 28, true);
    const lExtra = dv.getUint16(p + 30, true);
    const lComm = dv.getUint16(p + 32, true);
    let offsetLocal = dv.getUint32(p + 42, true);
    const nom = decodeur.decode(u8.subarray(p + 46, p + 46 + lNom));

    if (tailleBrute === 0xffffffff || tailleCompressee === 0xffffffff || offsetLocal === 0xffffffff) {
      let q = p + 46 + lNom;
      const finExtra = q + lExtra;
      while (q + 4 <= finExtra) {
        const id = dv.getUint16(q, true),
          taille = dv.getUint16(q + 2, true);
        if (id === 0x0001) {
          let r = q + 4;
          if (tailleBrute === 0xffffffff) {
            tailleBrute = Number(dv.getBigUint64(r, true));
            r += 8;
          }
          if (tailleCompressee === 0xffffffff) {
            tailleCompressee = Number(dv.getBigUint64(r, true));
            r += 8;
          }
          if (offsetLocal === 0xffffffff) offsetLocal = Number(dv.getBigUint64(r, true));
          break;
        }
        q += 4 + taille;
      }
    }

    // en-tête local : sa longueur varie, il faut la lire pour trouver les données
    const lNomLocal = dv.getUint16(offsetLocal + 26, true);
    const lExtraLocal = dv.getUint16(offsetLocal + 28, true);
    entrees.set(nom, { nom, methode, tailleCompressee, tailleBrute, debut: offsetLocal + 30 + lNomLocal + lExtraLocal });
    p += 46 + lNom + lExtra + lComm;
  }
  return entrees;
}

/** Décompresse une entrée et livre ses octets par morceaux. */
export async function* octetsDe(buffer: ArrayBuffer, entree: EntreeZip): AsyncGenerator<Uint8Array> {
  const brut = new Uint8Array(buffer, entree.debut, entree.tailleCompressee);
  if (entree.methode === 0) {
    yield brut;
    return;
  }
  if (entree.methode !== 8) throw new Error("Compression zip non gérée (méthode " + entree.methode + ").");
  const ds = new DecompressionStream("deflate-raw");
  const ecrivain = ds.writable.getWriter();
  void ecrivain.write(brut);
  void ecrivain.close();
  const lecteur = ds.readable.getReader();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) return;
    yield value;
  }
}
