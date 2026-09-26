/**
 * La règle d'architecture qui rend possibles les installeurs d'un seul module (SPEC §3) :
 * un module n'importe jamais un autre module. Vérifiée ici sur de vrais exemples.
 */
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const racine = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd: racine });

async function erreurs(fichier: string, code: string): Promise<string[]> {
  const [r] = await eslint.lintText(code, { filePath: `${racine}/${fichier}` });
  return (r?.messages ?? []).filter((m) => m.ruleId === "these/frontieres").map((m) => m.message);
}

describe("frontières entre dossiers", () => {
  it("un module ne peut pas importer un autre module", async () => {
    const e = await erreurs("modules/campagnes/ui/X.tsx", 'import traitement from "../../traitement/manifeste";\nexport const t = traitement;\n');
    expect(e).toHaveLength(1);
    expect(e[0]).toContain("un module ne dépend jamais d'un autre module");
    expect(await erreurs("modules/campagnes/ui/X.tsx", 'import x from "/modules/figures/manifeste.tsx";\nexport const t = x;\n')).toHaveLength(1);
  });

  it("un module peut importer le noyau, l'interface et ses propres fichiers", async () => {
    const code = 'import { joindre } from "@noyau/stockage";\nimport { Page } from "@interface/composants";\nimport { a } from "./a";\nimport { b } from "../core/b";\nexport const t = [joindre, Page, a, b];\n';
    expect(await erreurs("modules/campagnes/ui/X.tsx", code)).toEqual([]);
  });

  it("le noyau n'importe ni l'interface ni les modules ; l'interface n'importe pas les modules", async () => {
    expect(await erreurs("packages/noyau/src/x.ts", 'import { Page } from "@interface/composants";\nexport const t = Page;\n')).toHaveLength(1);
    expect(await erreurs("packages/interface/src/x.ts", 'import m from "../../../modules/accueil/manifeste";\nexport const t = m;\n')).toHaveLength(1);
    expect(await erreurs("packages/interface/src/x.ts", 'import { joindre } from "@noyau/stockage";\nexport const t = joindre;\n')).toEqual([]);
  });
});
