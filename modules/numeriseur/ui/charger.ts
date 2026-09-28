/** Mise en place d'une nouvelle image (fichier, collage, exemple) ou d'un projet enregistré. */
import { projetVide, type Projet } from "../core/projet";
import { useNumeriseur } from "./etat";
import { decoder } from "./image";

export async function chargerImage(octets: Uint8Array, ext: string, nom: string, projet?: Projet): Promise<void> {
  const image = await decoder(octets, ext);
  const p = projet ?? { ...projetVide(), mode: useNumeriseur.getState().projet.mode };
  useNumeriseur.setState({
    image,
    projet: { ...p, image: `${nom}.${image.ext}` },
    nom,
    modifie: !projet,
    outil: projet ? null : "x1",
    serie: 0,
    selection: null,
    coupeA: null,
    gamme: null,
    champ: null,
    cellules: null,
    message: projet ? null : { niveau: "info", texte: "Image chargée : placer les points d'étalonnage des axes (X1, X2, Y1, Y2) et saisir leurs valeurs." },
  });
}
