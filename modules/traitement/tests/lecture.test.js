import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lireFichier } from '../statique/src/io/lecture.js';

const fichier = (name, texte) => ({ name, text: async () => texte });

test('export WaveMatrix (.steps.tracking.csv) : « ; », en-têtes entre guillemets', async () => {
  const l = ['"Nombre total de cycles";"Temps total (s)";"Force(8800 (0,1):Charge) (kN)";' +
    '"Personnalisée(103 (0,3):Lion171144) (µm)";"Personnalisée(103 (0,5):Défini par utilisateur) (°C)";'];
  for (let i = 0; i < 300; i++) l.push([Math.floor(i / 20) + 1, i * 30, '1,5', '2', '20', ''].join(';'));
  const r = await lireFichier(fichier('Essai1.steps.tracking.csv', l.join('\n')));
  assert.equal(r.table.n, 300);
  assert.equal(r.entetes[0], 'Nombre total de cycles');
  assert.equal(r.correspondance.cycle, 0);
  assert.equal(r.correspondance.charge, 2);
  assert.equal(r.correspondance.lion1, 3);
  assert.equal(r.correspondance.pt100, 4);
  assert.equal(r.table.colonne(2)[0], 1.5);
});
