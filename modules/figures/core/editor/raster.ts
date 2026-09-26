/** Taille en pixels d'un export PNG (SPEC §7 : 300 ou 600 dpi). */
export function pixelSize(widthMm: number, heightMm: number, dpi: number): { width: number; height: number } {
  if (!(dpi > 0)) throw new RangeError("Résolution invalide.");
  const px = (mm: number) => Math.max(1, Math.round((mm / 25.4) * dpi));
  return { width: px(widthMm), height: px(heightMm) };
}

/** Ajoute (ou remplace) le bloc pHYs d'un PNG pour y inscrire la résolution (Word, LaTeX la lisent). */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 33 || !sig.every((b, i) => png[i] === b)) throw new Error("PNG invalide.");
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, ppm);
  dv.setUint32(4, ppm);
  data[8] = 1; // unité : mètre
  const chunk = makeChunk("pHYs", data);
  // Parcours des blocs : on retire un pHYs existant, on insère le nôtre après IHDR.
  const out: Uint8Array[] = [png.slice(0, 8)];
  let pos = 8;
  while (pos < png.length) {
    const len = new DataView(png.buffer, png.byteOffset + pos, 4).getUint32(0);
    const type = String.fromCharCode(...png.slice(pos + 4, pos + 8));
    const end = pos + 12 + len;
    if (type !== "pHYs") out.push(png.slice(pos, end));
    if (type === "IHDR") out.push(chunk);
    pos = end;
  }
  const total = out.reduce((s, a) => s + a.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const a of out) {
    res.set(a, o);
    o += a.length;
  }
  return res;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.slice(4, 8 + data.length)));
  return out;
}
