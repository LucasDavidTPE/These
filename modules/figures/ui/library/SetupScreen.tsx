import { useEffect, useState } from "react";
import { proposedRoot } from "../../core/settings";
import { useLibrary } from "./useLibrary";

/** Premier lancement : choix de la racine de la bibliothèque (SPEC §11). */
export function SetupScreen() {
  const backend = useLibrary((s) => s.backend);
  const setRoot = useLibrary((s) => s.setRoot);
  const error = useLibrary((s) => s.error);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [choice, setChoice] = useState("");

  useEffect(() => {
    backend?.oneDriveCandidates().then((list) => {
      const proposals = list.map(proposedRoot);
      setCandidates(proposals);
      if (proposals[0]) setChoice((c) => c || proposals[0]!);
    });
  }, [backend]);

  const browse = async () => {
    const picked = await backend?.pickFolder(choice || undefined);
    if (picked) setChoice(picked);
  };

  return (
    <section className="page setup">
      <h1>Bienvenue dans Figurine</h1>
      <p>
        Choisissez le dossier de la bibliothèque. Placez-le dans OneDrive pour retrouver vos figures sur vos deux
        PC ; ce choix est mémorisé sur ce poste uniquement.
      </p>
      {candidates.length > 0 ? (
        <fieldset>
          <legend>Dossiers OneDrive détectés</legend>
          {candidates.map((c) => (
            <label key={c} className="radio">
              <input type="radio" name="root" checked={choice === c} onChange={() => setChoice(c)} />
              <code>{c}</code>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted">Aucun dossier OneDrive détecté sur ce poste.</p>
      )}
      <div className="row">
        <input className="grow" value={choice} onChange={(e) => setChoice(e.target.value)} placeholder="C:\…\Figurine" />
        <button type="button" onClick={browse}>
          Parcourir…
        </button>
      </div>
      <p className="muted">Le dossier est créé s'il n'existe pas.</p>
      {error && <p className="error">{error}</p>}
      <button type="button" className="primary" disabled={!choice.trim()} onClick={() => setRoot(choice.trim(), true)}>
        Utiliser ce dossier
      </button>
    </section>
  );
}
