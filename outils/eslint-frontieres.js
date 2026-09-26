/**
 * Règle ESLint locale « these/frontieres » (SPEC §3) : chaque dossier n'importe que ce
 * qu'il a le droit d'importer.
 *
 * - packages/noyau      → lui-même (TypeScript pur)
 * - packages/interface  → lui-même, le noyau
 * - modules/<m>         → lui-même, le noyau, l'interface — jamais un autre module
 * - app                 → tout (c'est la coquille qui assemble)
 *
 * Les alias `@noyau/…` et `@interface/…` sont traduits avant la vérification.
 */
import path from "node:path";

const ALIAS = { "@noyau/": "packages/noyau/src/", "@interface/": "packages/interface/src/" };

/** Zone d'un fichier (chemin relatif à la racine du dépôt, séparateur « / »), ou null. */
export function zone(rel) {
  const m = /^modules\/([^/]+)\//.exec(rel);
  if (m) return { nom: `modules/${m[1]}`, autorise: [`modules/${m[1]}/`, "packages/noyau/", "packages/interface/"] };
  if (rel.startsWith("packages/noyau/")) return { nom: "packages/noyau", autorise: ["packages/noyau/"] };
  if (rel.startsWith("packages/interface/")) return { nom: "packages/interface", autorise: ["packages/interface/", "packages/noyau/"] };
  return null;
}

/** Cible d'un import, relative à la racine ; null pour un paquet npm. */
export function cible(source, fichierRel) {
  for (const [alias, dossier] of Object.entries(ALIAS)) if (source.startsWith(alias)) return dossier + source.slice(alias.length);
  if (source.startsWith("/")) return source.slice(1);
  if (source.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(fichierRel), source));
  return null;
}

const regle = {
  meta: { type: "problem", messages: { interdit: "{{zone}} ne peut pas importer « {{source}} » : {{raison}}" }, schema: [] },
  create(context) {
    const racine = context.cwd;
    const rel = path.relative(racine, context.filename).split(path.sep).join("/");
    const z = zone(rel);
    if (!z) return {};
    function verifier(node) {
      const source = node.source && node.source.value;
      if (typeof source !== "string") return;
      const c = cible(source, rel);
      if (c === null) return; // paquet npm : les règles « no-restricted-imports » s'en chargent
      if (z.autorise.some((a) => c.startsWith(a))) return;
      const raison = c.startsWith("modules/")
        ? "un module ne dépend jamais d'un autre module ; passez par une action du registre"
        : "hors des dépendances permises de cette zone";
      context.report({ node: node.source, messageId: "interdit", data: { zone: z.nom, source, raison } });
    }
    return { ImportDeclaration: verifier, ExportNamedDeclaration: verifier, ExportAllDeclaration: verifier, ImportExpression: verifier };
  },
};

export default { rules: { frontieres: regle } };
