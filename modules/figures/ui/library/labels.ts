import type { FigureKind, SourceType } from "../../core/library";

export const KIND_LABELS: Record<FigureKind, string> = {
  schema: "Schéma",
  image: "Image",
  graph: "Graphe",
  crop: "Recadrage",
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  own: "Personnelle",
  web: "Web",
  article: "Article",
  other: "Autre",
};
