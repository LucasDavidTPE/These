/**
 * Registre des modèles rhéologiques.
 *
 * Ajouter un modèle : écrire un fichier voisin qui exporte par défaut un
 * objet de la même forme, puis l'ajouter à la liste ci-dessous. Rien d'autre
 * dans l'application n'a besoin d'être touché — l'interface construit ses
 * curseurs, l'optimiseur choisit ses inconnues et les exports leurs
 * en-têtes à partir de cette déclaration.
 *
 * Forme attendue :
 *   id, nom, resume, reference
 *   parametres[]  { cle, label, unite?, min, max, pas, log?, groupe }
 *   defauts       valeurs de départ
 *   bornes        { cle: [min, max] } respectées par l'optimiseur
 *   ajustables[]  clés calées sur |E*| et φ
 *   ajustablesPoisson[]  clés calées sur ν*
 *   module(f, p)  → { re, im, norme, phase }
 *   poisson(f, p) → idem, facultatif
 *   derive        true si le modèle découle d'un autre au lieu d'être calé
 */
import m2s2p1d from './2s2p1d.js';
import huetSayegh from './huet-sayegh.js';
import gkv from './gkv.js';

export const MODELES = [m2s2p1d, huetSayegh, gkv];

export function modele(id) {
  return MODELES.find(m => m.id === id) || MODELES[0];
}

/** Constantes de départ d'un modèle, éventuellement reprises d'un autre. */
export function parametresInitiaux(m, precedents = {}) {
  const p = { ...m.defauts };
  for (const cle of Object.keys(p)) {
    if (Number.isFinite(precedents[cle])) p[cle] = precedents[cle];
  }
  return p;
}
