import type { Plateforme } from "@interface/plateforme";

let courante: Promise<Plateforme> | null = null;

/** Tauri dans l'application, démonstration en mémoire dans un navigateur. */
export function plateforme(): Promise<Plateforme> {
  courante ??= (async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { plateformeTauri } = await import("./tauri");
      return plateformeTauri();
    }
    const { plateformeDemo } = await import("./demo");
    return plateformeDemo(new URLSearchParams(window.location.search).get("scenario"));
  })();
  return courante;
}
