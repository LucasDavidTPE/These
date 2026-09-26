interface Props {
  title: string;
  description: string;
}

/** Page vide en attendant l'implémentation du module (voir docs/ROADMAP.md). */
export function PlaceholderPage({ title, description }: Props) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="muted">{description}</p>
      <p className="muted">Module pas encore disponible.</p>
    </section>
  );
}
