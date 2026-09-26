/**
 * SVG affichés → PNG, pour « Enregistrer dans Figures ». Les styles venus des feuilles CSS
 * sont recopiés dans le SVG (sinon le PNG perd couleurs et polices), les panneaux sont
 * empilés, fond blanc, résolution doublée.
 */
const PROPRIETES = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-family", "font-weight"];

function recopierStyles(source: Element, copie: Element) {
  const s = getComputedStyle(source);
  (copie as SVGElement).setAttribute("style", PROPRIETES.map((p) => `${p}:${s.getPropertyValue(p)}`).join(";"));
  for (let i = 0; i < source.children.length; i++) recopierStyles(source.children[i]!, copie.children[i]!);
}

export async function svgEnPng(svgs: SVGSVGElement[], titre = ""): Promise<Uint8Array> {
  const marge = 12;
  const hTitre = titre ? 26 : 0;
  const largeur = Math.max(...svgs.map((s) => s.width.baseVal.value));
  const hauteur = svgs.reduce((h, s) => h + s.height.baseVal.value, 0) + hTitre + marge * 2;
  const racine = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  racine.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  racine.setAttribute("width", String(largeur + marge * 2));
  racine.setAttribute("height", String(hauteur));
  const fond = document.createElementNS(racine.namespaceURI, "rect");
  fond.setAttribute("width", "100%");
  fond.setAttribute("height", "100%");
  fond.setAttribute("fill", "#ffffff");
  racine.appendChild(fond);
  if (titre) {
    const t = document.createElementNS(racine.namespaceURI, "text");
    t.setAttribute("x", String(marge));
    t.setAttribute("y", String(marge + 16));
    t.setAttribute("style", "font: 600 15px 'Segoe UI', sans-serif; fill: #1d1d1b");
    t.textContent = titre;
    racine.appendChild(t);
  }
  let y = marge + hTitre;
  for (const s of svgs) {
    const copie = s.cloneNode(true) as SVGSVGElement;
    recopierStyles(s, copie);
    copie.setAttribute("x", String(marge));
    copie.setAttribute("y", String(y));
    racine.appendChild(copie);
    y += s.height.baseVal.value;
  }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(racine)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("Rendu de l'image impossible."));
      img.src = url;
    });
    const echelle = 2;
    const canvas = document.createElement("canvas");
    canvas.width = (largeur + marge * 2) * echelle;
    canvas.height = hauteur * echelle;
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
