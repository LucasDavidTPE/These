import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { pistes } from "./comsolPistes";

const lire = (n: string, nom = n) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    nom,
  );

describe("pistes", () => {
  it("d'après les fichiers : vue d'ensemble, instants, maillage, critères, signaux, rapport", () => {
    const es = [
      lire("grille_XZ_EL_het.txt", "c_EL_het.txt"),
      lire("grille_XZ_EL_het.txt", "c_EL-fin_het.txt"),
      lire("grille_XZ_VE_instants.txt", "c_VE_het.txt"),
      lire("table_temps_VE.txt"),
    ];
    const p = pistes(es, {
      legende: (e) => e.nom.replace(/\.txt$/, ""),
      longueur: "mm",
    });
    expect(p.map((x) => x.libelle)).toEqual([
      "Vue d'ensemble",
      "Carte d'une coupe",
      "Convergence du maillage",
      "Bassin de déflexion",
      "Critères",
      "Signal dans le temps",
      "Rapport LaTeX",
    ]);
    expect(p[0]!.texte).toBe(
      "3 coupes (EL / EL-fin / VE) : toutes d'un coup, à la même échelle",
    );
    expect(p[2]!.texte).toBe("1 paire maillage grossier / fin (c_EL-fin_het)");
    expect(pistes([], { legende: () => "", longueur: "mm" })).toEqual([]);
  });
});
