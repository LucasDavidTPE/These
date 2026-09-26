/**
 * Écriture .xlsx minimale, sans bibliothèque.
 *
 * Un .xlsx est une archive zip de quelques fichiers XML. On n'a besoin que
 * de nombres et de texte brut, donc six entrées suffisent. La compression
 * passe par CompressionStream quand le navigateur la fournit, sinon les
 * entrées sont stockées telles quelles — Excel accepte les deux.
 */

const enc = new TextEncoder();

function echapper(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');   // caractères interdits en XML
}

function reference(c, l) {
  let s = '';
  c += 1;
  while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = (c - r - 1) / 26; }
  return s + l;
}

function feuilleXML(lignes) {
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i] || [];
    out.push('<row r="' + (i + 1) + '">');
    for (let c = 0; c < l.length; c++) {
      const v = l[c];
      if (v === null || v === undefined || v === '') continue;
      const r = reference(c, i + 1);
      if (typeof v === 'number') {
        if (Number.isFinite(v)) out.push('<c r="' + r + '"><v>' + v + '</v></c>');
      } else {
        out.push('<c r="' + r + '" t="inlineStr"><is><t xml:space="preserve">' +
          echapper(v) + '</t></is></c>');
      }
    }
    out.push('</row>');
  }
  out.push('</sheetData></worksheet>');
  return enc.encode(out.join(''));
}

/* ------------------------------------------------------------------ zip */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function comprimer(u8) {
  if (typeof CompressionStream === 'undefined') return { data: u8, methode: 0 };
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(u8); w.close();
  const morceaux = [];
  const r = cs.readable.getReader();
  let taille = 0;
  while (true) {
    const { done, value } = await r.read();
    if (done) break;
    morceaux.push(value); taille += value.length;
  }
  const data = new Uint8Array(taille);
  let p = 0;
  for (const m of morceaux) { data.set(m, p); p += m.length; }
  return data.length < u8.length ? { data, methode: 8 } : { data: u8, methode: 0 };
}

async function zipper(fichiers) {
  const entrees = [];
  let offset = 0;
  const morceaux = [];

  for (const [nom, contenu] of fichiers) {
    const nomOctets = enc.encode(nom);
    const { data, methode } = await comprimer(contenu);
    const crc = crc32(contenu);
    const local = new Uint8Array(30 + nomOctets.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); dv.setUint16(6, 0, true);
    dv.setUint16(8, methode, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0x2821, true);   // date fixe
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, contenu.length, true);
    dv.setUint16(26, nomOctets.length, true); dv.setUint16(28, 0, true);
    local.set(nomOctets, 30);
    morceaux.push(local, data);
    entrees.push({ nomOctets, methode, crc, compressee: data.length, brute: contenu.length, offset });
    offset += local.length + data.length;
  }

  const central = [];
  let tailleCentral = 0;
  for (const e of entrees) {
    const b = new Uint8Array(46 + e.nomOctets.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true); dv.setUint16(10, e.methode, true);
    dv.setUint16(12, 0, true); dv.setUint16(14, 0x2821, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.compressee, true);
    dv.setUint32(24, e.brute, true);
    dv.setUint16(28, e.nomOctets.length, true);
    dv.setUint32(42, e.offset, true);
    b.set(e.nomOctets, 46);
    central.push(b); tailleCentral += b.length;
  }
  const fin = new Uint8Array(22);
  const dvf = new DataView(fin.buffer);
  dvf.setUint32(0, 0x06054b50, true);
  dvf.setUint16(8, entrees.length, true); dvf.setUint16(10, entrees.length, true);
  dvf.setUint32(12, tailleCentral, true);
  dvf.setUint32(16, offset, true);

  return new Blob([...morceaux, ...central, fin],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * @param {Array<{nom:string, lignes:Array<Array>}>} feuilles
 * @returns {Promise<Blob>}
 */
export function ecrireXlsx(feuilles) {
  const n = feuilles.length;
  const onglets = feuilles.map((f, i) =>
    `<sheet name="${echapper(f.nom).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const rels = feuilles.map((f, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const types = feuilles.map((f, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');

  const fichiers = [
    ['[Content_Types].xml', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      types + '</Types>')],
    ['_rels/.rels', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>')],
    ['xl/workbook.xml', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + onglets + '</sheets></workbook>')],
    ['xl/_rels/workbook.xml.rels', enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels + '</Relationships>')]
  ];
  feuilles.forEach((f, i) => fichiers.push(['xl/worksheets/sheet' + (i + 1) + '.xml', feuilleXML(f.lignes)]));
  return zipper(fichiers);
}
