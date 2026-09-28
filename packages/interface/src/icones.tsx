/**
 * Pictogrammes au trait, 24 × 24, couleur du texte : un par module et quelques usages communs.
 */
import type { ReactNode } from "react";

function Trace({ taille = 20, children }: { taille?: number; children: ReactNode }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { taille?: number };

export const IconeAccueil = (p: P) => (
  <Trace {...p}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
    <path d="M10 19.5v-5h4v5" />
  </Trace>
);

export const IconeFigures = (p: P) => (
  <Trace {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 16l5-5 4 4 3-3 6 6" />
    <circle cx="16" cy="8.5" r="1.5" />
  </Trace>
);

export const IconeTraitement = (p: P) => (
  <Trace {...p}>
    <path d="M3 12c1.5-6 3.5-6 5 0s3.5 6 5 0 3.5-6 5 0" />
    <path d="M3 20h18" />
  </Trace>
);

export const IconeCampagnes = (p: P) => (
  <Trace {...p}>
    <path d="M9 3h6" />
    <path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
    <path d="M7 15h10" />
  </Trace>
);

export const IconeBibliotheque = (p: P) => (
  <Trace {...p}>
    <path d="M4 4h4v16H4z" />
    <path d="M9.5 4h4v16h-4z" />
    <path d="m15 5.2 3.8-1 3.2 15-3.8 1z" />
  </Trace>
);

export const IconePlanning = (p: P) => (
  <Trace {...p}>
    <path d="M4 5h9" />
    <path d="M8 10h9" />
    <path d="M11 15h9" />
    <path d="M6 20h6" />
    <path d="M3 3v18" />
  </Trace>
);

export const IconeReglages = (p: P) => (
  <Trace {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Trace>
);

export const IconeDiagnostic = (p: P) => (
  <Trace {...p}>
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </Trace>
);

export const IconeDossier = (p: P) => (
  <Trace {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Trace>
);

export const IconeAttention = (p: P) => (
  <Trace {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Trace>
);

export const IconeEtudes = (p: P) => (
  <Trace {...p}>
    <path d="M8 5 3 12l5 7" />
    <path d="m16 5 5 7-5 7" />
    <path d="m13.5 4-3 16" />
  </Trace>
);

export const IconeViscoCompare = (p: P) => (
  <Trace {...p}>
    <path d="M3 20h18" />
    <path d="M3 8c3 0 4 8 9 8s6-8 9-8" />
    <path d="M3 11c3 0 4 6 9 6s6-6 9-6" strokeDasharray="2 2.5" />
  </Trace>
);

export const IconeManuscrits = (p: P) => (
  <Trace {...p}>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
    <path d="M10 13h6M10 17h6" />
  </Trace>
);
