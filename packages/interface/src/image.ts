/**
 * SVG → PNG, pour « Enregistrer dans Figures » et les exports d'images : les modules
 * produisent un SVG autonome (styles en ligne, fond blanc), rendu ici par le navigateur.
 */

/** SVG autonome (styles en ligne, `width` et `height` en pixels) → PNG, résolution doublée. */
export async function svgTexteEnPng(svg: string, echelle = 2): Promise<Uint8Array> {
  const dim = (nom: string) => Number(new RegExp(`<svg[^>]*\\s${nom}="([\\d.]+)"`).exec(svg)?.[1] ?? 0);
  const [largeur, hauteur] = [dim("width"), dim("height")];
  if (!largeur || !hauteur) throw new Error("SVG sans largeur ni hauteur.");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("Rendu de l'image impossible."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(largeur * echelle);
    canvas.height = Math.round(hauteur * echelle);
    const c = canvas.getContext("2d")!;
    c.scale(echelle, echelle);
    c.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("Encodage PNG impossible.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
