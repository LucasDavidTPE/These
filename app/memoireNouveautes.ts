/** Dernière version dont « Quoi de neuf » a été vu, sur ce poste seulement (comme les sections repliées du menu). */
const MEMOIRE = "these.nouveautes.vue";

export function versionVue(): string | null {
  try {
    return localStorage.getItem(MEMOIRE);
  } catch {
    return null;
  }
}

export function marquerVue(version: string) {
  try {
    localStorage.setItem(MEMOIRE, version);
  } catch {
    // stockage indisponible : le panneau reviendra au prochain lancement, sans gravité
  }
}
