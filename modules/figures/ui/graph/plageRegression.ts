/** Série dont on tire la plage de régression sur l'aperçu (null : aucune). Partagé entre le panneau et l'aperçu. */
import { create } from "zustand";

export const usePlageRegression = create<{ serie: number | null }>(() => ({ serie: null }));
