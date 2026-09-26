import { useEffect, useState } from "react";
import { describeIssue, type ConflictCopy, type LibraryIssue } from "../../core/library";
import { useLibrary } from "./useLibrary";

/** Liste des problèmes détectés par le scan, avec les actions de résolution. */
export function IssuesPanel({ onClose }: { onClose: () => void }) {
  const index = useLibrary((s) => s.index);
  const [comparing, setComparing] = useState<{ folder: string; conflict: ConflictCopy } | null>(null);
  if (!index) return null;
  const issues = index.issues;

  return (
    <aside className="panel">
      <div className="panel-head">
        <strong>À régler ({issues.length + index.rootConflicts.length})</strong>
        <button type="button" className="link" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      {comparing ? (
        <ConflictCompare {...comparing} onDone={() => setComparing(null)} />
      ) : (
        <ul className="issues">
          {index.rootConflicts.map((c) => (
            <li key={c.copy}>
              Deux versions des préférences partagées (<code>{c.copy}</code>).
              <IssueAction onClick={() => setComparing({ folder: "", conflict: c })}>Comparer</IssueAction>
            </li>
          ))}
          {issues.map((issue, i) => (
            <li key={i}>
              {describeIssue(issue)}
              <Actions issue={issue} onCompare={setComparing} />
            </li>
          ))}
          {issues.length + index.rootConflicts.length === 0 && <li className="muted">Rien à signaler.</li>}
        </ul>
      )}
    </aside>
  );
}

function IssueAction(props: { onClick: () => void; children: string }) {
  return (
    <button type="button" className="small-btn" onClick={props.onClick}>
      {props.children}
    </button>
  );
}

function Actions({
  issue,
  onCompare,
}: {
  issue: LibraryIssue;
  onCompare: (c: { folder: string; conflict: ConflictCopy }) => void;
}) {
  const index = useLibrary((s) => s.index);
  const renumber = useLibrary((s) => s.renumber);
  const cleanTemp = useLibrary((s) => s.cleanTemp);
  const select = useLibrary((s) => s.select);

  switch (issue.type) {
    case "conflict-copy":
      return <IssueAction onClick={() => onCompare({ folder: issue.folder, conflict: issue.conflict })}>Comparer</IssueAction>;
    case "interrupted-write":
      return <IssueAction onClick={() => cleanTemp(issue.folder, issue.file)}>Supprimer le fichier temporaire</IssueAction>;
    case "duplicate-id": {
      // On renumérote la figure la plus récemment créée ; l'autre garde son ID.
      const entries = index!.figures.filter((f) => issue.folders.includes(f.folder) && f.meta);
      const newest = [...entries].sort((a, b) => Date.parse(b.meta!.created) - Date.parse(a.meta!.created))[0];
      return newest ? (
        <IssueAction onClick={() => renumber(newest)}>{`Renuméroter ${newest.folder}`}</IssueAction>
      ) : null;
    }
    default:
      return "folder" in issue ? <IssueAction onClick={() => select(issue.folder)}>Voir</IssueAction> : null;
  }
}

function ConflictCompare({ folder, conflict, onDone }: { folder: string; conflict: ConflictCopy; onDone: () => void }) {
  const readText = useLibrary((s) => s.readText);
  const imageUrl = useLibrary((s) => s.imageUrl);
  const resolve = useLibrary((s) => s.resolveConflict);
  const isImage = /\.(png|svg)$/i.test(conflict.original);
  const pathOf = (name: string) => (folder ? `${folder}/${name}` : name);
  const [texts, setTexts] = useState<[string, string] | null>(null);

  useEffect(() => {
    if (isImage) return;
    Promise.all([readText(pathOf(conflict.original)), readText(pathOf(conflict.copy))]).then(
      (t) => setTexts(t),
      (e) => setTexts([String(e), ""]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, conflict]);

  const side = (name: string, keep: "original" | "copy", label: string) => (
    <div className="version">
      <div className="version-head">
        <b>{label}</b> <code>{name}</code>
      </div>
      {isImage ? (
        <img src={imageUrl(pathOf(name))} alt="" />
      ) : (
        <pre>{texts ? texts[keep === "original" ? 0 : 1] : "Chargement…"}</pre>
      )}
      <button
        type="button"
        className="primary"
        onClick={async () => {
          await resolve(folder, conflict, keep);
          onDone();
        }}
      >
        Garder cette version
      </button>
    </div>
  );

  return (
    <div className="compare">
      <p>
        Choisissez la version à garder. L'autre est rangée dans <code>.conflits/</code>, rien n'est supprimé.
      </p>
      <div className="versions">
        {side(conflict.original, "original", "Version actuelle")}
        {side(conflict.copy, "copy", `Copie de ${conflict.tag}`)}
      </div>
      <button type="button" onClick={onDone}>
        Retour
      </button>
    </div>
  );
}
