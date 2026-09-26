import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODELES, modele } from '../statique/src/coeur/modeles/index.js';
import { identifierGKV, moduleGKV } from '../statique/src/coeur/modeles/gkv.js';
import { aTwlf, calerWLF, recalerIsothermes, calerModule, calageConjoint, ecarts } from '../statique/src/coeur/calage.js';

const P = {
  E00: 120, E0: 41000, k: 0.175, h: 0.60, delta: 2.05, tauE: 0.32, beta: 180,
  nu00: 0.18, nu0: 0.44, tauNu: 1.024
};

test('chaque modèle déclare ce dont l’interface a besoin', () => {
  for (const m of MODELES) {
    assert.ok(m.id && m.nom && m.resume, `${m.id} : identité incomplète`);
    assert.ok(Array.isArray(m.parametres) && m.parametres.length, `${m.id} : aucun paramètre`);
    for (const p of m.parametres) {
      assert.ok(p.cle && p.label, `${m.id} : paramètre mal déclaré`);
      assert.ok(Number.isFinite(m.defauts[p.cle]), `${m.id} : pas de valeur par défaut pour ${p.cle}`);
    }
    for (const cle of m.ajustables) {
      assert.ok(m.bornes[cle], `${m.id} : ${cle} est ajustable mais sans bornes`);
    }
  }
});

test('Huet-Sayegh est le 2S2P1D quand β tend vers l’infini', () => {
  const hs = modele('huet-sayegh'), s2 = modele('2s2p1d');
  for (const f of [1e-4, 1e-2, 1, 100]) {
    const a = hs.module(f, P);
    const b = s2.module(f, { ...P, beta: 1e12 });
    assert.ok(Math.abs(a.norme - b.norme) / b.norme < 1e-6,
      `écart à ${f} Hz : ${a.norme} contre ${b.norme}`);
  }
  // et il s’en écarte franchement aux très basses fréquences avec un β réaliste
  const bas = 1e-6;
  const ecart = Math.abs(hs.module(bas, P).norme - s2.module(bas, P).norme) / hs.module(bas, P).norme;
  assert.ok(ecart > 0.05, 'sans amortisseur, le comportement doit différer aux basses fréquences');
});

test('la chaîne Kelvin-Voigt reproduit le modèle dont elle est tirée', () => {
  const source = modele('2s2p1d');
  const chaine = identifierGKV(source, P, { nElements: 40, fMin: 1e-6, fMax: 1e12 });
  assert.equal(chaine.E.length, 40);
  assert.ok(chaine.E.every(e => e > 0), 'toutes les raideurs doivent être positives');

  let pire = 0;
  for (let lf = -4; lf <= 6; lf += 0.5) {
    const f = 10 ** lf;
    const a = source.module(f, P).norme;
    const b = moduleGKV(f, chaine).norme;
    pire = Math.max(pire, Math.abs(b - a) / a);
  }
  assert.ok(pire < 0.05, `écart maximal de ${(pire * 100).toFixed(1)} % sur dix décades`);
});

test('la loi WLF est retrouvée à partir de facteurs de translation exacts', () => {
  const Tref = 15, C1 = 25, C2 = 180;
  const temperatures = [-25, -15, -5, 5, 15, 25, 35, 45];
  const aTs = temperatures.map(T => aTwlf(T, Tref, C1, C2));
  const r = calerWLF(temperatures, aTs, Tref);
  assert.ok(Math.abs(r.C1 - C1) < 0.5, `C1 retrouvé : ${r.C1}`);
  assert.ok(Math.abs(r.C2 - C2) < 5, `C2 retrouvé : ${r.C2}`);
});

test('le recalage des isothermes et le calage retrouvent les constantes de départ', () => {
  const Tref = 15, C1 = 25, C2 = 180;
  const temperatures = [-25, -15, -5, 5, 15, 25, 35];
  const frequences = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10];
  const s2 = modele('2s2p1d');

  const points = [], parTemperature = {};
  for (const T of temperatures) {
    parTemperature[T] = [];
    for (const f of frequences) {
      const m = s2.module(f * aTwlf(T, Tref, C1, C2), P);
      const pt = { T, f, module: m.norme, phi: m.phase, nu: NaN };
      points.push(pt); parTemperature[T].push(pt);
    }
  }

  // le recalage géométrique place bien les isothermes qui portent de
  // l'information ; les plus froides sont sur l'asymptote vitreuse et restent
  // indéterminées à ce stade
  const geo = recalerIsothermes(parTemperature, Tref);
  for (const T of temperatures.filter(t => t >= -5)) {
    const ecartDecades = Math.abs(Math.log10(geo[T]) - Math.log10(aTwlf(T, Tref, C1, C2)));
    assert.ok(ecartDecades < 0.15, `a_T à ${T} °C après recalage : ${ecartDecades.toFixed(3)} décade`);
  }

  // le calage conjoint les remet toutes en place
  const depart = { ...P, E0: 30000, k: 0.25, h: 0.7, delta: 3, tauE: 1, beta: 400 };
  const r = calageConjoint(s2, parTemperature, Tref, depart, geo);
  for (const T of temperatures) {
    const ecartDecades = Math.abs(Math.log10(r.aT[T]) - Math.log10(aTwlf(T, Tref, C1, C2)));
    assert.ok(ecartDecades < 0.12,
      `a_T à ${T} °C après calage conjoint : ${ecartDecades.toFixed(3)} décade`);
  }
  const e = ecarts(s2, points, r.aT, r.parametres);
  assert.ok(e.module < 1, `écart sur |E*| après calage : ${e.module.toFixed(2)} %`);
  assert.ok(e.phase < 0.5, `écart sur φ après calage : ${e.phase.toFixed(2)} °`);
  console.log(`  écart final : ${e.module.toFixed(3)} % sur |E*|, ${e.phase.toFixed(3)} ° sur φ`);
});
