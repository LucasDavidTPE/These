import { useLibrary } from "./useLibrary";

/** Réglages propres à ce poste (hors OneDrive). */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const host = useLibrary((s) => s.host);
  const root = useLibrary((s) => s.root);
  const backend = useLibrary((s) => s.backend);
  const setRoot = useLibrary((s) => s.setRoot);

  const change = async () => {
    const picked = await backend?.pickFolder(root ?? undefined);
    if (picked) await setRoot(picked, false);
  };

  return (
    <aside className="panel">
      <div className="panel-head">
        <strong>Réglages de ce poste</strong>
        <button type="button" className="link" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      <dl>
        <dt>Nom du poste</dt>
        <dd>{host}</dd>
        <dt>Bibliothèque</dt>
        <dd>
          <code>{root}</code>
        </dd>
      </dl>
      <button type="button" onClick={change}>
        Changer de dossier…
      </button>
      <p className="muted small">
        Ces réglages restent sur ce PC (dossier de configuration de l'appli), pas dans OneDrive.
        {backend?.kind === "demo" && " Mode démonstration : aucune donnée n'est enregistrée."}
      </p>
    </aside>
  );
}
