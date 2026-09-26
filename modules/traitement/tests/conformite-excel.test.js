/**
 * Conformité au classeur Excel.
 *
 * Les deux fichiers de test/reference/ ne sont pas des valeurs écrites à la
 * main : ce sont les cellules Info!D7:BL7 de Calcul.xlsx, rempli exactement
 * comme le fait la macro VBA avec des mesures réelles, puis recalculé par un
 * vrai moteur de tableur (outils/construire-reference.py).
 *
 * Chaque grandeur doit coïncider à 1e-9 près en relatif. En pratique l'écart
 * observé est de l'ordre de 5e-11, soit la limite d'affichage d'Excel.
 *
 *   node --test test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { TableBrute, construireDonnees } from '../statique/src/coeur/donnees.js';
import { traiterPalier } from '../statique/src/coeur/traitement.js';

const ici = dirname(fileURLToPath(import.meta.url));

const JEUX = [
  ['palier-0003hz.json', 'palier à 0,003 Hz — 447 points demandés, 410 utilisés'],
  ['palier-0003hz-sous-echantillonne.json', 'même palier sous-échantillonné — aucune troncature']
];

for (const [fichier, titre] of JEUX) {
  test(titre, () => {
    const R = JSON.parse(readFileSync(join(ici, 'reference', fichier), 'utf8'));
    const P = R.params;

    const table = TableBrute.depuisLignes(R.raw);
    const donnees = construireDonnees(table, {
      etalonnage: { a1: P.a1, b1: P.b1, a2: P.a2, b2: P.b2 },
      voiesAxiales: [true, true, true],
      voiesRadiales: [true, true, false, false]
    });
    const lignes = traiterPalier(donnees, {
      freq: P.freq, diametre: P.diam, hCalcul: 1, temperature: P.temp, exact: true
    });

    // le classeur nomme « Emod » ce que le code nomme « module »
    const alias = { Emod: 'module', sonde2: 'sonde' };
    let pire = { ecart: 0 };
    let comparaisons = 0;

    for (let i = 0; i < R.ref.length; i++) {
      const attendu = R.ref[i], obtenu = lignes[i];
      assert.ok(obtenu, `cycle ${i + 1} absent du résultat`);
      for (const [cle, a] of Object.entries(attendu)) {
        if (typeof a !== 'number' || !Number.isFinite(a)) continue;
        const b = obtenu[alias[cle] ?? cle];
        const ecart = Math.abs(b - a) / Math.max(Math.abs(a), 1e-12);
        if (ecart > pire.ecart) pire = { ecart, cle, cycle: i + 1, a, b };
        comparaisons++;
      }
    }

    assert.ok(comparaisons > 200, `trop peu de comparaisons (${comparaisons})`);
    assert.ok(
      pire.ecart < 1e-9,
      `écart de ${pire.ecart.toExponential(2)} sur « ${pire.cle} » au cycle ${pire.cycle} ` +
      `(Excel ${pire.a}, calculé ${pire.b})`
    );
    console.log(`  ${comparaisons} grandeurs · écart maximal ${pire.ecart.toExponential(2)}`);
  });
}

test('le mode corrigé lève bien la troncature à 410 points', () => {
  const R = JSON.parse(readFileSync(join(ici, 'reference', JEUX[0][0]), 'utf8'));
  const P = R.params;
  const donnees = construireDonnees(TableBrute.depuisLignes(R.raw), {
    etalonnage: { a1: P.a1, b1: P.b1, a2: P.a2, b2: P.b2 }
  });
  const commun = { freq: P.freq, diametre: P.diam, hCalcul: 1, temperature: P.temp };
  const exact = traiterPalier(donnees, { ...commun, exact: true });
  const corrige = traiterPalier(donnees, { ...commun, exact: false });

  assert.equal(exact[0].nPoints, 410, 'le mode Excel doit plafonner à 410 points');
  assert.ok(exact[0].tronque, 'la troncature doit être signalée');
  assert.equal(corrige[0].nPoints, corrige[0].nCycle, 'le mode corrigé traite le cycle entier');
  assert.ok(!corrige[0].tronque);
  assert.ok(Math.abs(corrige[0].module - exact[0].module) > 1e-6,
    'les deux modes doivent donner des modules différents sur ce palier');
});

test('un cycle écarté sort de la synthèse et y revient tel quel', async () => {
  const { synthetiser } = await import('../statique/src/coeur/synthese.js');
  const R = JSON.parse(readFileSync(join(ici, 'reference', JEUX[0][0]), 'utf8'));
  const P = R.params;
  const donnees = construireDonnees(TableBrute.depuisLignes(R.raw), {
    etalonnage: { a1: P.a1, b1: P.b1, a2: P.a2, b2: P.b2 }
  });
  const lignes = traiterPalier(donnees, {
    freq: P.freq, diametre: P.diam, hCalcul: 1, temperature: P.temp, exact: true
  });

  const tout = synthetiser(lignes)[0];
  assert.equal(tout.n, lignes.length);
  assert.equal(tout.ecartes, 0);

  const ecarte = l => l.cycle !== lignes[0].cycle;          // on retire le premier cycle
  const partiel = synthetiser(lignes, ecarte)[0];
  assert.equal(partiel.n, lignes.length - 1);
  assert.equal(partiel.ecartes, 1);
  assert.notEqual(partiel.module, tout.module, 'la moyenne doit changer');

  // remise en place : on retrouve exactement les mêmes chiffres
  const remis = synthetiser(lignes, () => true)[0];
  for (const champ of ['module', 'phi', 'nu', 'sigma0', 'module_et']) {
    assert.equal(remis[champ], tout[champ], `« ${champ} » doit être identique après remise`);
  }
});
