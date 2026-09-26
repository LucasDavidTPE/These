/**
 * Assemblage de l'interface.
 *
 * L'état tient dans un objet unique : une liste d'essais, chacun portant ses
 * données brutes, sa matrice de campagne, ses résultats et son calage. Tout
 * l'affichage se redessine à partir de cet état, sans autre mécanique.
 */
import { construireDonnees, VOIES, CORRESPONDANCE_PAR_DEFAUT, UNITES_AXIALES } from './coeur/donnees.js';
import { traiterPalier } from './coeur/traitement.js';
import { detecterCampagne } from './coeur/campagne.js';
import { synthetiser } from './coeur/synthese.js';
import { MODELES, modele, parametresInitiaux } from './coeur/modeles/index.js';
import { identifierGKV, moduleGKV } from './coeur/modeles/gkv.js';
import {
  aTwlf, calerWLF, recalerIsothermes, calerModule, calerPoisson, calageConjoint, ecarts
} from './coeur/calage.js';
import { uniques, minimum, maximum } from './coeur/nombres.js';
import { lireFichier } from './io/lecture.js';
import { ecrireXlsx } from './io/xlsx-ecriture.js';
import { tracer, rendreInterrogeable, couleurTemperature } from './ui/graphiques.js';
import { nb, freq, entier, puissance } from './ui/format.js';
import { signalDemo, pointsDemo, CONSTANTES_DEMO, WLF_DEMO } from './demo.js';

const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

const COULEURS_ESSAI = ['#0b5f5c', '#a4522a', '#3a5ba0', '#7a3f7e', '#5c7a2a', '#9a3b3b'];

/* ══════════════════════════════════════════════════════ état */

const S = { essais: [], actif: 0, stat: '', palier: 0, cycle: 0 };
const actif = () => S.essais[S.actif];

function nouvelEssai(nom) {
  const m = modele('2s2p1d');
  return {
    id: 'e' + Date.now() + Math.random().toString(36).slice(2, 6),
    nom, table: null, entetes: [],
    correspondance: { ...CORRESPONDANCE_PAR_DEFAUT },
    uniteAxiale: 'mm/mm',
    meta: { diametre: 75, hauteur: 149, hCalcul: 1, cycleInitial: 1, a1: 0.001, b1: 0, a2: 0.001, b2: 0 },
    voiesAx: [true, true, true], voiesRad: [true, true, false, false],
    temperatures: [15], frequences: [0.003], nbCycles: [[3]],
    mode: 'excel', paliers: [], synthese: [],
    // Cycles écartés du calcul, repérés par « T|f|cycle » : la clé survit à un
    // nouveau traitement, à un changement de mode et à la sauvegarde du projet.
    exclus: new Set(), motifs: {},
    modeleId: '2s2p1d', p: parametresInitiaux(m),
    aT: {}, Tref: 15, C1: 25, C2: 180,
    couleur: COULEURS_ESSAI[S.essais.length % COULEURS_ESSAI.length],
    visible: true, demo: false
  };
}

/* ══════════════════════════════════════════════════════ voile */

let tDernier = 0;
function occupe(texte, part) {
  $('voileTexte').textContent = texte;
  $('voileJauge').style.width = (Math.max(0, Math.min(1, part || 0)) * 100) + '%';
  $('voile').hidden = false;
}
function libre() { $('voile').hidden = true; }
const souffler = () => new Promise(r => setTimeout(r, 0));

/* ══════════════════════════════════════════════════════ étape 01 */

const LIBELLES_VOIES = [
  ['cycle', 'Compteur de cycles', 0], ['temps', 'Temps (s)', 0], ['position', 'Position (mm)', 1],
  ['charge', 'Charge (kN)', 0], ['defM', 'Moy pilotage', 1], ['defA', 'Axial 1', 0],
  ['defB', 'Axial 2', 1], ['defC', 'Axial 3', 1],
  ['lion1', 'Radial 1', 1], ['lion2', 'Radial 2', 1], ['lion3', 'Radial 3', 1],
  ['lion4', 'Radial 4', 1], ['pt100', 'Température (°C)', 0]
];

function rendreCorrespondance() {
  const e = actif(), boite = $('correspondance');
  boite.innerHTML = '';
  const n = Math.max(11, e.entetes.length, e.table ? e.table.colonnes.length : 0);
  for (const [cle, libelle, facultatif] of LIBELLES_VOIES) {
    const champ = el('div', 'champ');
    const lab = el('label', null, libelle); lab.htmlFor = 'voie_' + cle;
    const sel = el('select'); sel.id = 'voie_' + cle;
    if (facultatif) { const o = el('option', null, '— non utilisée'); o.value = -1; sel.appendChild(o); }
    for (let i = 0; i < n; i++) {
      const o = el('option', null, (i + 1) + (e.entetes[i] ? ' · ' + e.entetes[i].trim().slice(0, 28) : ''));
      o.value = i; sel.appendChild(o);
    }
    sel.value = e.correspondance[cle];
    sel.onchange = () => {
      e.correspondance[cle] = +sel.value;
      if (/^lion/.test(cle)) e.voiesRad[+cle.slice(4) - 1] = +sel.value >= 0;
      if (/^def[ABC]$/.test(cle)) e.voiesAx['ABC'.indexOf(cle[3])] = +sel.value >= 0;
      rendreVoies();
    };
    champ.append(lab, sel); boite.appendChild(champ);
  }
  const champU = el('div', 'champ');
  const labU = el('label', null, 'Unité des extensomètres'); labU.htmlFor = 'uniteAx';
  const selU = el('select'); selU.id = 'uniteAx';
  for (const u of Object.keys(UNITES_AXIALES).filter(x => ['mm/mm', '%', 'µm/m'].includes(x))) {
    const o = el('option', null, u); o.value = u; selU.appendChild(o);
  }
  selU.value = e.uniteAxiale;
  selU.onchange = () => { e.uniteAxiale = selU.value; };
  champU.append(labU, selU); boite.appendChild(champU);
}

function rendreVoies() {
  const e = actif(), boite = $('voies');
  boite.innerHTML = '';
  const paires = [
    ['Axial 1', 'voiesAx', 0, 'defA'], ['Axial 2', 'voiesAx', 1, 'defB'], ['Axial 3', 'voiesAx', 2, 'defC'],
    ['Radial 1', 'voiesRad', 0, 'lion1'], ['Radial 2', 'voiesRad', 1, 'lion2'],
    ['Radial 3', 'voiesRad', 2, 'lion3'], ['Radial 4', 'voiesRad', 3, 'lion4']
  ];
  let aucune = true;
  for (const [nom, champ, i, cle] of paires) {
    if (e.correspondance[cle] < 0) continue;
    aucune = false;
    const b = el('button', 'btn', nom);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!!e[champ][i]));
    b.title = 'colonne ' + (e.correspondance[cle] + 1);
    b.onclick = () => {
      e[champ][i] = !e[champ][i];
      if (!e.voiesAx.some(Boolean)) e.voiesAx[i] = true;
      if (!e.voiesRad.some(Boolean)) e.voiesRad[i] = true;
      rendreVoies();
    };
    boite.appendChild(b);
  }
  if (aucune) boite.appendChild(el('span', 'note', 'Aucune voie de mesure reconnue dans ce fichier.'));
}

function rendreEprouvette() {
  const e = actif();
  $('pNom').value = e.nom;
  $('pDiam').value = e.meta.diametre;
  $('pHaut').value = e.meta.hauteur;
  $('pHcal').value = e.meta.hCalcul;
  $('pCycle').value = e.meta.cycleInitial;
  $('cA1').value = e.meta.a1; $('cB1').value = e.meta.b1;
  $('cA2').value = e.meta.a2; $('cB2').value = e.meta.b2;
  $('vSurface').textContent = nb(Math.PI * (e.meta.diametre / 1000) ** 2 / 4 * 1e4, 2) + ' cm²';
  $('vLignes').textContent = e.table ? entier(e.table.n) : '—';
}

function lierEprouvette() {
  const liens = [
    ['pNom', 'nom', false], ['pDiam', 'diametre', true], ['pHaut', 'hauteur', true],
    ['pHcal', 'hCalcul', true], ['pCycle', 'cycleInitial', true],
    ['cA1', 'a1', true], ['cB1', 'b1', true], ['cA2', 'a2', true], ['cB2', 'b2', true]
  ];
  for (const [id, cle, num] of liens) {
    $(id).oninput = () => {
      const e = actif();
      if (cle === 'nom') { e.nom = $(id).value; rendreSelecteurEssais(); }
      else e.meta[cle] = num ? parseFloat($(id).value) : $(id).value;
      rendreEprouvette();
      rendreEtat();
    };
  }
}

function rendreMatrice() {
  const e = actif(), t = $('matrice');
  t.innerHTML = '';
  const thead = el('thead'), tr = el('tr');
  const th0 = el('th', null, 'f (Hz) \\ T (°C)'); th0.scope = 'col'; tr.appendChild(th0);
  e.temperatures.forEach((T, i) => {
    const th = el('th'); th.scope = 'col';
    const inp = el('input'); inp.type = 'number'; inp.step = 'any'; inp.value = T;
    inp.setAttribute('aria-label', `Température ${i + 1}`);
    inp.oninput = () => { e.temperatures[i] = parseFloat(inp.value); };
    th.appendChild(inp); tr.appendChild(th);
  });
  thead.appendChild(tr); t.appendChild(thead);

  const tb = el('tbody');
  e.frequences.forEach((f, j) => {
    const r = el('tr'), th = el('th'); th.scope = 'row';
    const fi = el('input'); fi.type = 'number'; fi.step = 'any'; fi.value = f;
    fi.setAttribute('aria-label', `Fréquence ${j + 1}`);
    fi.oninput = () => { e.frequences[j] = parseFloat(fi.value); };
    th.appendChild(fi); r.appendChild(th);
    e.temperatures.forEach((T, i) => {
      const td = el('td');
      const ci = el('input'); ci.type = 'number'; ci.step = '1'; ci.min = '0';
      ci.value = e.nbCycles[j]?.[i] ?? 0;
      ci.setAttribute('aria-label', `Cycles à ${f} Hz et ${T} °C`);
      ci.oninput = () => { (e.nbCycles[j] ||= [])[i] = parseInt(ci.value, 10) || 0; };
      td.appendChild(ci); r.appendChild(td);
    });
    tb.appendChild(r);
  });
  t.appendChild(tb);
}

/* ══════════════════════════════════════════════════════ chargement */

async function chargerFichiers(liste) {
  for (const f of liste) {
    try {
      occupe('Lecture de ' + f.name + '…', 0);
      await souffler();
      const r = await lireFichier(f, (etape, part) => occupe(`${f.name} — ${etape}`, part));
      const e = nouvelEssai(f.name.replace(/\.[^.]+$/, ''));
      e.table = r.table;
      e.entetes = r.entetes;
      e.correspondance = r.correspondance;
      e.uniteAxiale = r.uniteAxiale;
      for (let q = 0; q < 4; q++) e.voiesRad[q] = e.correspondance['lion' + (q + 1)] >= 0;
      e.voiesAx = [e.correspondance.defA >= 0, e.correspondance.defB >= 0, e.correspondance.defC >= 0];
      const cCyc = e.table.colonne(e.correspondance.cycle);
      if (cCyc) e.meta.cycleInitial = minimum(cCyc);
      S.essais.push(e);
      S.actif = S.essais.length - 1;
      $('infoFichier').innerHTML =
        `<b>${f.name}</b> — ${entier(r.table.n)} lignes, ` +
        `${r.table.colonnes.length} colonnes, extensomètres lus en <b>${r.uniteAxiale}</b>.`;
      detecter(true);
      await traiter();
    } catch (err) {
      libre();
      $('infoFichier').innerHTML =
        `<b>Lecture impossible.</b> ${err.message} — vérifie qu'il s'agit bien d'un export de la machine.`;
      return;
    }
  }
  libre();
  toutRedessiner();
}

function detecter(silencieux) {
  const e = actif();
  if (!e.table || e.table.n < 200) return;
  let d = null;
  try { d = detecterCampagne(e.table, e.correspondance); } catch { d = null; }
  if (!d) {
    if (!silencieux) $('infoDetection').textContent =
      'Découpage introuvable — renseigne la matrice à la main, ou vérifie les colonnes « compteur de cycles » et « temps ».';
    return;
  }
  e.temperatures = d.temperatures;
  e.frequences = d.frequences;
  e.nbCycles = d.nbCycles;
  e.meta.cycleInitial = d.cycleInitial;
  e.Tref = d.temperatures.includes(15) ? 15 : d.temperatures[Math.floor(d.temperatures.length / 2)];

  const absents = [];
  d.nbCycles.forEach((ligne, j) => ligne.forEach((v, i) => {
    if (!v) absents.push(`${freq(d.frequences[j])} Hz à ${d.temperatures[i]} °C`);
  }));
  let total = 0;
  for (const l of d.nbCycles) for (const v of l) total += v;
  $('infoDetection').innerHTML =
    `<b>${d.temperatures.length} paliers de température × ${d.frequences.length} fréquences</b>, ` +
    `${entier(total)} cycles à partir du cycle ${d.cycleInitial}. Fréquences déduites de la durée ` +
    `des cycles, températures de la sonde.` +
    (absents.length ? ` <b>Absents du fichier :</b> ${absents.join(', ')}.` : '');
  rendreMatrice();
}

/* ══════════════════════════════════════════════════════ traitement */

function bornesCycles(table, colonne) {
  const c = table.colonne(colonne);
  const index = new Map();
  let prec = null, debut = 0;
  for (let i = 0; i < table.n; i++) {
    const v = c[i];
    if (v !== prec) {
      if (prec !== null) index.set(prec, [debut, i - 1]);
      prec = v; debut = i;
    }
  }
  if (prec !== null) index.set(prec, [debut, table.n - 1]);
  return index;
}

async function traiter() {
  const e = actif();
  if (!e.table) return;
  occupe('Traitement de la campagne…', 0);
  await souffler();

  const index = bornesCycles(e.table, e.correspondance.cycle);
  const paliers = [];
  let fin = e.meta.cycleInitial - 1;
  const total = e.temperatures.length * e.frequences.length;
  let fait = 0;

  for (let i = 0; i < e.temperatures.length; i++) {
    for (let j = 0; j < e.frequences.length; j++) {
      fait++;
      const nbc = e.nbCycles[j]?.[i] || 0;
      if (!nbc) continue;
      const debut = fin + 1; fin += nbc;
      let lo = null, hi = null;
      for (let c = debut; c <= fin; c++) {
        const b = index.get(c);
        if (b) { if (lo === null) lo = b[0]; hi = b[1]; }
      }
      if (lo === null || hi - lo < 10) continue;
      const tranche = e.table.tranche(lo, hi);
      const donnees = construireDonnees(tranche, {
        correspondance: e.correspondance,
        uniteAxiale: e.uniteAxiale,
        etalonnage: e.meta,
        voiesAxiales: e.voiesAx,
        voiesRadiales: e.voiesRad
      });
      const lignes = traiterPalier(donnees, {
        freq: e.frequences[j], diametre: e.meta.diametre, hCalcul: e.meta.hCalcul,
        temperature: e.temperatures[i], exact: e.mode === 'excel'
      });
      paliers.push({
        T: e.temperatures[i], f: e.frequences[j], de: debut, a: fin,
        lignes, donnees, nLignes: hi - lo + 1,
        libelle: `${e.temperatures[i]} °C · ${freq(e.frequences[j])} Hz · cycles ${debut}–${fin}`
      });
      if ((fait & 7) === 0) { occupe('Traitement de la campagne…', fait / total); await souffler(); }
    }
  }
  e.paliers = paliers;
  recalculerSynthese(e);
  S.palier = 0; S.cycle = 0;
  initialiserAT(e);
  libre();
}

/* ─────────────────────── cycles écartés ─────────────────────── */

/** Un cycle est repéré par son palier et son numéro, pas par sa position. */
const cleCycle = l => `${l.T}|${l.f}|${l.cycle}`;
const retenu = (e, l) => !e.exclus.has(cleCycle(l));

/** La synthèse — et donc tout le calage — ne voit que les cycles retenus. */
function recalculerSynthese(e) {
  const toutes = [];
  for (const p of e.paliers) for (const l of p.lignes) toutes.push(l);
  e.synthese = synthetiser(toutes, l => retenu(e, l));
}

function basculerCycle(e, l, motif) {
  const cle = cleCycle(l);
  if (e.exclus.has(cle)) { e.exclus.delete(cle); delete e.motifs[cle]; }
  else { e.exclus.add(cle); e.motifs[cle] = motif || 'écarté à la main'; }
}

function lignesEcartees(e) {
  const out = [];
  for (const p of e.paliers) {
    for (const l of p.lignes) if (!retenu(e, l)) out.push({ palier: p, ligne: l, motif: e.motifs[cleCycle(l)] });
  }
  return out;
}

/** Après tout changement d'exclusion : synthèse, tableaux et graphiques. */
function appliquerExclusions() {
  const e = actif();
  recalculerSynthese(e);
  initialiserAT(e);
  rendreTableCycles();
  rendreEcartes();
  rendreSynthese();
  rendreTref();
  rafraichirCalage();
  rendreEtat();
}

function initialiserAT(e) {
  const ts = uniques(pointsCalage(e).map(p => p.T));
  if (!ts.length) return;
  if (!ts.includes(e.Tref)) e.Tref = ts[Math.floor(ts.length / 2)];
  for (const T of ts) if (!Number.isFinite(e.aT[T])) e.aT[T] = aTwlf(T, e.Tref, e.C1, e.C2);
}

const pointsCalage = e => (e.demo ? e.pointsDemo : e.synthese);

/* ══════════════════════════════════════════════════════ étape 02 */

const COLONNES_CYCLES = [
  ['cycle', 'Cycle', 0], ['sigma0', 'σ₀ (MPa)', 4], ['eoax', 'ε₀ ax (µm/m)', 2],
  ['phi', 'φ (°)', 2], ['eorad', 'ε₀ rad (µm/m)', 2], ['nu', 'ν', 4],
  ['phiNu', 'φ(ax−rad) (°)', 2], ['module', '|E*| (MPa)', 1], ['E1', 'E₁ (MPa)', 1], ['E2', 'E₂ (MPa)', 1],
  ['qMC', 'Iq (%)', 2], ['ecA1', 'Δ A1 (%)', 2], ['ecA2', 'Δ A2 (%)', 2], ['ecA3', 'Δ A3 (%)', 2],
  ['ecR1', 'Δ R1 (%)', 2], ['ecR2', 'Δ R2 (%)', 2], ['ecR3', 'Δ R3 (%)', 2], ['ecR4', 'Δ R4 (%)', 2],
  ['sonde', 'T sonde (°C)', 2], ['nPoints', 'pts', 0]
];

function colonnesCycles() {
  const e = actif();
  const ax = { ecA1: 0, ecA2: 1, ecA3: 2 }, rad = { ecR1: 0, ecR2: 1, ecR3: 2, ecR4: 3 };
  return COLONNES_CYCLES.filter(c =>
    ax[c[0]] !== undefined ? e.voiesAx[ax[c[0]]]
      : rad[c[0]] !== undefined ? e.voiesRad[rad[c[0]]] : true);
}

function rendreCycles() {
  const e = actif(), sel = $('selPalier');
  sel.innerHTML = '';
  e.paliers.forEach((p, i) => { const o = el('option', null, p.libelle); o.value = i; sel.appendChild(o); });
  sel.value = String(Math.min(S.palier, e.paliers.length - 1));
  sel.onchange = () => { S.palier = +sel.value; S.cycle = 0; rendreTableCycles(); };

  const sv = $('selVoie');
  if (!sv.options.length) {
    for (const v of VOIES) { const o = el('option', null, v.nom); o.value = v.cle; sv.appendChild(o); }
    sv.value = 'mc';
    sv.onchange = tracerSignal;
  }
  rendreTableCycles();
}

function rendreTableCycles() {
  const e = actif(), p = e.paliers[S.palier], t = $('tabCycles');
  t.innerHTML = '';
  if (!p) { $('statsPalier').textContent = ''; return; }
  const tronques = p.lignes.filter(l => l.tronque).length;
  const horsCalcul = p.lignes.filter(l => !retenu(e, l)).length;
  $('statsPalier').innerHTML =
    `<span class="pastille">${entier(p.nLignes)} lignes</span>` +
    `<span class="pastille">${p.lignes.length - horsCalcul} / ${p.lignes.length} cycles retenus</span>` +
    (tronques ? `<span class="pastille alerte">${tronques} tronqués à 410 points</span>` : '') +
    (horsCalcul === p.lignes.length ? `<span class="pastille grave">palier entièrement écarté</span>` : '');

  const cols = colonnesCycles();
  const thead = el('thead'), tr = el('tr');
  const thR = el('th', null, 'Retenu'); thR.scope = 'col'; tr.appendChild(thR);
  for (const c of cols) { const th = el('th', null, c[1]); th.scope = 'col'; tr.appendChild(th); }
  thead.appendChild(tr); t.appendChild(thead);

  const tb = el('tbody');
  p.lignes.forEach((l, i) => {
    const r = el('tr');
    const dedans = retenu(e, l);
    if (!dedans) r.className = 'ecarte';
    if (i === S.cycle) r.setAttribute('aria-selected', 'true');

    const tdR = el('td');
    const chk = el('input');
    chk.type = 'checkbox'; chk.checked = dedans; chk.style.width = 'auto';
    chk.setAttribute('aria-label', `Retenir le cycle ${l.cycle} du palier ${p.libelle}`);
    chk.onclick = ev => ev.stopPropagation();
    chk.onchange = () => { basculerCycle(e, l); appliquerExclusions(); };
    tdR.appendChild(chk); r.appendChild(tdR);

    for (const c of cols) {
      const brut = c[0] === 'cycle' || c[0] === 'nPoints';
      const td = el('td', null, brut ? String(l[c[0]]) : nb(l[c[0]], c[2]));
      if (/^ec/.test(c[0])) {
        const a = Math.abs(l[c[0]]);
        if (a > 25) td.className = 'grave'; else if (a > 10) td.className = 'alerte';
      }
      if (c[0] === 'qMC') { if (l.qMC > 15) td.className = 'grave'; else if (l.qMC > 5) td.className = 'alerte'; }
      r.appendChild(td);
    }
    r.tabIndex = 0;
    r.onclick = () => { S.cycle = i; rendreTableCycles(); };
    r.onkeydown = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); S.cycle = i; rendreTableCycles(); }
      if (ev.key === 'x' || ev.key === 'X') { ev.preventDefault(); basculerCycle(e, l); appliquerExclusions(); }
    };
    tb.appendChild(r);
  });
  t.appendChild(tb);
  tracerSignal(); tracerEcarts();
}

/* ─────────── proposition automatique et revue des cycles écartés ─────────── */

function proposerEcarts() {
  const e = actif();
  const seuilIq = parseFloat($('seuilIq').value);
  const seuilEcart = parseFloat($('seuilEcart').value);
  const voies = ['ecA1', 'ecA2', 'ecA3', 'ecR1', 'ecR2', 'ecR3', 'ecR4'];
  const actives = [
    ...e.voiesAx.map((v, i) => v ? voies[i] : null),
    ...e.voiesRad.map((v, i) => v ? voies[3 + i] : null)
  ].filter(Boolean);

  let ajoutes = 0;
  for (const p of e.paliers) {
    for (const l of p.lignes) {
      if (!retenu(e, l)) continue;
      const motifs = [];
      if (Number.isFinite(seuilIq) && l.qMC > seuilIq) motifs.push(`indice de qualité ${nb(l.qMC, 1)} %`);
      if (Number.isFinite(seuilEcart)) {
        for (const v of actives) {
          if (Math.abs(l[v]) > seuilEcart) { motifs.push(`${v.slice(2)} à ${nb(l[v], 1)} %`); break; }
        }
      }
      if (motifs.length) { basculerCycle(e, l, motifs.join(', ')); ajoutes++; }
    }
  }
  appliquerExclusions();
  flash(ajoutes ? `${ajoutes} cycle${ajoutes > 1 ? 's' : ''} proposé${ajoutes > 1 ? 's' : ''} à l'écart — à vérifier avant d'aller plus loin`
    : 'aucun cycle ne dépasse ces seuils', ajoutes ? 'alerte' : 'ok');
}

function rendreEcartes() {
  const e = actif(), t = $('tabEcartes'), liste = lignesEcartees(e);
  const total = e.paliers.reduce((a, p) => a + p.lignes.length, 0);
  const pluriel = liste.length > 1;
  $('resumeEcartes').innerHTML = liste.length
    ? `<b>${liste.length} cycle${pluriel ? 's' : ''} écarté${pluriel ? 's' : ''}</b> sur ${total}. ` +
      `${pluriel ? 'Ils restent' : 'Il reste'} dans le tableau, barré${pluriel ? 's' : ''}, ` +
      `et peu${pluriel ? 'vent' : 't'} être remis à tout moment. Le choix est enregistré avec le projet.`
    : `Aucun cycle écarté : la synthèse porte sur les ${total} cycles.`;
  $('btnToutRetablir').disabled = !liste.length;

  t.innerHTML = '';
  if (!liste.length) return;
  const thead = el('thead'), tr = el('tr');
  for (const h of ['', 'Palier', 'Cycle', '|E*| (MPa)', 'φ (°)', 'Iq (%)', 'Motif']) {
    const th = el('th', null, h); th.scope = 'col'; tr.appendChild(th);
  }
  thead.appendChild(tr); t.appendChild(thead);
  const tb = el('tbody');
  for (const { palier, ligne, motif } of liste) {
    const r = el('tr');
    const td0 = el('td');
    const b = el('button', 'btn', 'remettre');
    b.onclick = () => { basculerCycle(e, ligne); appliquerExclusions(); };
    td0.appendChild(b); r.appendChild(td0);
    const th = el('th', null, `${palier.T} °C · ${freq(palier.f)} Hz`); th.scope = 'row'; r.appendChild(th);
    for (const v of [String(ligne.cycle), nb(ligne.module, 1), nb(ligne.phi, 2), nb(ligne.qMC, 2)]) {
      r.appendChild(el('td', null, v));
    }
    const tdM = el('td', null, motif || '—');
    tdM.style.textAlign = 'left'; tdM.style.fontFamily = 'var(--police-ui)';
    r.appendChild(tdM);
    tb.appendChild(r);
  }
  t.appendChild(tb);
}

function tracerSignal() {
  const e = actif(), p = e.paliers[S.palier];
  if (!p) return;
  const l = p.lignes[S.cycle];
  if (!l) return;
  const cle = $('selVoie').value || 'mc';
  const aj = l._aj[cle];
  const mesure = [], ajuste = [];
  const w = 2 * Math.PI * p.f;
  const t0 = p.donnees.t[l._debut];
  for (let i = 0; i < l._n; i++) {
    const k = l._debut + i;
    if (k >= p.donnees.n) break;
    const t = p.donnees.t[k];
    mesure.push([t - t0, p.donnees.voies[cle][k] - aj.moyenne]);
    ajuste.push([t - t0, aj.amplitude * Math.sin(w * t + aj.phase / 180 * Math.PI)]);
  }
  $('sousSignal').textContent =
    `cycle ${l.cycle} · ${l.nPoints} points · amplitude ${nb(aj.amplitude, 6)} · ` +
    `phase ${nb(aj.phase, 2)} ° · indice de qualité ${nb(aj.indice, 2)} %`;
  tracer($('gSignal'), {
    series: [
      { points: mesure, mode: 'points', couleur: jetonEncre(), taille: 1.7, libelle: 'mesure' },
      { points: ajuste, mode: 'ligne', couleur: jetonAccent(), epaisseur: 1.6 }
    ],
    xTitre: 't (s)', yTitre: 'signal centré', zeroY: true,
    format: (x, y) => `t = ${nb(x, 1)} s · ${nb(y, 6)}`
  });
  rendreInterrogeable($('gSignal'), $('capSignal'));
}

function tracerEcarts() {
  const e = actif(), p = e.paliers[S.palier];
  if (!p) return;
  const cles = [
    ['ecA1', 'Axial 1', 'voiesAx', 0], ['ecA2', 'Axial 2', 'voiesAx', 1], ['ecA3', 'Axial 3', 'voiesAx', 2],
    ['ecR1', 'Radial 1', 'voiesRad', 0], ['ecR2', 'Radial 2', 'voiesRad', 1],
    ['ecR3', 'Radial 3', 'voiesRad', 2], ['ecR4', 'Radial 4', 'voiesRad', 3]
  ].filter(k => e[k[2]][k[3]]);
  const series = cles.map((k, i) => ({
    points: p.lignes.map(l => [l.cycle, l[k[0]]]),
    mode: 'ligne', couleur: couleurTemperature(i, cles.length), epaisseur: 1.5, libelle: k[1]
  }));
  for (const [i, k] of cles.entries()) {
    series.push({
      points: p.lignes.map(l => [l.cycle, l[k[0]]]),
      mode: 'points', couleur: couleurTemperature(i, cles.length), taille: 2, libelle: k[1]
    });
  }
  tracer($('gEcart'), {
    series, xTitre: 'cycle', yTitre: 'écart (%)', zeroY: true,
    format: (x, y) => `cycle ${Math.round(x)} · ${nb(y, 2)} %`
  });
  rendreInterrogeable($('gEcart'), $('capEcart'));
  const lg = $('legEcart'); lg.innerHTML = '';
  cles.forEach((k, i) => {
    const s = el('span');
    s.innerHTML = `<i style="background:${couleurTemperature(i, cles.length)}"></i>${k[1]}`;
    lg.appendChild(s);
  });
}

const jetonEncre = () => getComputedStyle(document.documentElement).getPropertyValue('--encre-3').trim();
const jetonAccent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

/* ══════════════════════════════════════════════════════ étape 03 */

const COLONNES_SYNTHESE = [
  ['T', 'T (°C)', 1], ['f', 'f (Hz)', 3], ['n', 'retenus', 0], ['ecartes', 'écartés', 0],
  ['sigma0', 'σ₀ (MPa)', 4], ['eoax', 'ε₀ ax (µm/m)', 2], ['phi', 'φ (°)', 2],
  ['eorad', 'ε₀ rad (µm/m)', 2], ['nu', 'ν', 4], ['phiNu', 'φν (°)', 2],
  ['module', '|E*| (MPa)', 1], ['E1', 'E₁ (MPa)', 1], ['E2', 'E₂ (MPa)', 1], ['sonde', 'T mesurée (°C)', 2]
];

function rendreSynthese() {
  const e = actif(), t = $('tabSynthese');
  t.innerHTML = '';
  const thead = el('thead'), tr = el('tr');
  for (const c of COLONNES_SYNTHESE) { const th = el('th', null, c[1]); th.scope = 'col'; tr.appendChild(th); }
  thead.appendChild(tr); t.appendChild(thead);
  const tb = el('tbody');
  for (const a of e.synthese) {
    const r = el('tr');
    for (const c of COLONNES_SYNTHESE) {
      const cle = ['T', 'f', 'n', 'ecartes'].includes(c[0]) ? c[0] : c[0] + S.stat;
      r.appendChild(el('td', null, c[0] === 'f' ? freq(a.f) : nb(a[cle], c[2])));
    }
    tb.appendChild(r);
  }
  t.appendChild(tb);

  const parT = {};
  for (const a of e.synthese) (parT[a.T] ||= []).push(a);
  const ts = uniques(Object.keys(parT).map(Number));
  const sE = [], sP = [], lg = $('legSyn');
  lg.innerHTML = '';
  ts.forEach((T, i) => {
    const c = couleurTemperature(i, ts.length);
    const pts = parT[T].slice().sort((x, y) => x.f - y.f);
    sE.push({ points: pts.map(a => [a.f, a.module]), mode: 'ligne', couleur: c, epaisseur: 1.4 });
    sE.push({ points: pts.map(a => [a.f, a.module]), mode: 'points', couleur: c, libelle: T + ' °C' });
    sP.push({ points: pts.map(a => [a.f, a.phi]), mode: 'ligne', couleur: c, epaisseur: 1.4 });
    sP.push({ points: pts.map(a => [a.f, a.phi]), mode: 'points', couleur: c, libelle: T + ' °C' });
    const s = el('span'); s.innerHTML = `<i style="background:${c}"></i>${T} °C`;
    lg.appendChild(s);
  });
  tracer($('gSynE'), { series: sE, xLog: true, yLog: true, xTitre: 'f (Hz)', yTitre: '|E*| (MPa)',
    format: (x, y) => `${freq(x)} Hz · ${nb(y, 0)} MPa` });
  tracer($('gSynP'), { series: sP, xLog: true, xTitre: 'f (Hz)', yTitre: 'φ (°)',
    format: (x, y) => `${freq(x)} Hz · ${nb(y, 2)} °` });
  rendreInterrogeable($('gSynE'), $('capSynE'));
  rendreInterrogeable($('gSynP'), $('capSynP'));
}

/* ══════════════════════════════════════════════════════ étape 04 */

function rendreParametres() {
  const e = actif(), m = modele(e.modeleId);
  for (const groupe of ['module', 'poisson']) {
    const boite = $(groupe === 'module' ? 'paramsModule' : 'paramsPoisson');
    boite.innerHTML = '';
    const params = m.parametres.filter(p => p.groupe === groupe);
    for (const d of params) {
      const ligne = el('div', 'ligne-param');
      const lab = el('label', null, d.label + (d.unite ? ` (${d.unite})` : ''));
      lab.htmlFor = 'p_' + d.cle;
      const rg = el('input'); rg.type = 'range';
      rg.min = d.min; rg.max = d.max; rg.step = d.pas;
      rg.setAttribute('aria-label', d.label);
      const nbi = el('input'); nbi.type = 'number'; nbi.step = 'any'; nbi.id = 'p_' + d.cle;
      const arrondi = v => Number.isFinite(v) ? +v.toPrecision(6) : v;
      const majAffichage = () => {
        if (document.activeElement !== nbi) nbi.value = arrondi(e.p[d.cle]);
        rg.value = d.log ? Math.log10(e.p[d.cle]) : e.p[d.cle];
      };
      rg.oninput = () => { e.p[d.cle] = d.log ? 10 ** +rg.value : +rg.value; nbi.value = e.p[d.cle]; rafraichirCalage(); };
      nbi.oninput = () => {
        const v = parseFloat(nbi.value);
        if (Number.isFinite(v)) { e.p[d.cle] = v; rg.value = d.log ? Math.log10(v) : v; rafraichirCalage(); }
      };
      ligne.append(lab, rg, nbi); boite.appendChild(ligne);
      majAffichage();
      (boite._maj ||= []).push(majAffichage);
    }
    if (!params.length) boite.appendChild(el('p', 'note', 'Ce modèle découle du modèle continu calé : rien à régler ici.'));
  }
  $('blocPoisson').hidden = !m.poisson;
}

function synchroniserParametres() {
  for (const id of ['paramsModule', 'paramsPoisson']) {
    for (const f of $(id)._maj || []) f();
  }
  const e = actif();
  const a6 = v => Number.isFinite(v) ? +v.toPrecision(6) : v;
  if (document.activeElement !== $('nC1')) $('nC1').value = a6(e.C1);
  if (document.activeElement !== $('nC2')) $('nC2').value = a6(e.C2);
  $('rC1').value = e.C1; $('rC2').value = e.C2;
}

function chaineGKV(e) {
  const m = modele(e.modeleId);
  if (m.id !== 'gkv') return null;
  const source = modele('2s2p1d');
  return identifierGKV(source, e.p, {
    nElements: Math.round(e.p.nElements), fMin: e.p.fMin, fMax: e.p.fMax
  });
}

function moduleCourant(e) {
  const m = modele(e.modeleId);
  if (m.id !== 'gkv') return (f, p) => m.module(f, p);
  const ch = chaineGKV(e);
  return () => null && ch;   // remplacé plus bas
}

function evaluer(e, f) {
  const m = modele(e.modeleId);
  if (m.id === 'gkv') {
    e._chaine ||= chaineGKV(e);
    return moduleGKV(f, e._chaine);
  }
  return m.module(f, e.p);
}

function rafraichirCalage() {
  const e = actif();
  const m = modele(e.modeleId);
  e._chaine = m.id === 'gkv' ? chaineGKV(e) : null;
  const points = pointsCalage(e);
  const ts = uniques(points.map(p => p.T));
  const parT = {};
  for (const p of points) (parT[p.T] ||= []).push(p);

  const courbeE = [], courbeP = [], courbeCole = [], courbeBlack = [], courbeNu = [];
  for (let lf = -8; lf <= 10; lf += 0.05) {
    const f = 10 ** lf;
    const v = evaluer(e, f);
    courbeE.push([f, v.norme]); courbeP.push([f, v.phase]);
    courbeCole.push([v.re, v.im]); courbeBlack.push([v.phase, v.norme]);
    if (m.poisson) { const n = m.poisson(f, e.p); courbeNu.push([f, n.norme]); }
  }

  const acc = jetonAccent();
  const expE = [], expP = [], expCole = [], expBlack = [], expNu = [];
  const lg = $('legTemps'); lg.innerHTML = '';
  ts.forEach((T, i) => {
    const c = couleurTemperature(i, ts.length), a = e.aT[T] || 1;
    const g = parT[T].slice().sort((x, y) => x.f - y.f);
    expE.push({ points: g.map(p => [p.f * a, p.module, p]), mode: 'points', couleur: c, libelle: T + ' °C' });
    expP.push({ points: g.map(p => [p.f * a, p.phi, p]), mode: 'points', couleur: c, libelle: T + ' °C' });
    expCole.push({ points: g.map(p => [p.E1, p.E2, p]), mode: 'points', couleur: c, libelle: T + ' °C' });
    expBlack.push({ points: g.map(p => [p.phi, p.module, p]), mode: 'points', couleur: c, libelle: T + ' °C' });
    expNu.push({ points: g.map(p => [p.f * a, p.nu, p]), mode: 'points', couleur: c, libelle: T + ' °C' });
    const s = el('span'); s.innerHTML = `<i style="background:${c}"></i>${T} °C`;
    lg.appendChild(s);
  });
  const ligne = pts => ({ points: pts, mode: 'ligne', couleur: acc, epaisseur: 1.8 });
  const fmtMaitre = (x, y, p) => (p ? `${p.T} °C · ${freq(p.f)} Hz — ` : '') + `f·a_T = ${nb(x)} Hz · ${nb(y)}`;

  tracer($('gCole'), { series: [...expCole, ligne(courbeCole)], xTitre: 'E₁ (MPa)', yTitre: 'E₂ (MPa)', zeroY: true,
    format: (x, y, p) => (p ? `${p.T} °C · ${freq(p.f)} Hz — ` : '') + `E₁ ${nb(x, 0)} · E₂ ${nb(y, 0)} MPa` });
  tracer($('gBlack'), { series: [...expBlack, ligne(courbeBlack)], yLog: true, xTitre: 'φ (°)', yTitre: '|E*| (MPa)',
    format: (x, y, p) => (p ? `${p.T} °C · ${freq(p.f)} Hz — ` : '') + `φ ${nb(x, 2)} ° · ${nb(y, 0)} MPa` });
  tracer($('gMaitreE'), { series: [...expE, ligne(courbeE)], xLog: true, yLog: true, xTitre: 'f·a_T (Hz)', yTitre: '|E*| (MPa)', format: fmtMaitre });
  tracer($('gMaitreP'), { series: [...expP, ligne(courbeP)], xLog: true, xTitre: 'f·a_T (Hz)', yTitre: 'φ (°)', format: fmtMaitre });
  tracer($('gNu'), { series: courbeNu.length ? [...expNu, ligne(courbeNu)] : expNu, xLog: true, xTitre: 'f·a_T (Hz)', yTitre: '|ν*|', format: fmtMaitre });

  const wlf = [];
  if (ts.length) {
    const t1 = minimum(ts) - 5, t2 = maximum(ts) + 5;
    for (let T = t1; T <= t2; T += 0.5) wlf.push([T, aTwlf(T, e.Tref, e.C1, e.C2)]);
  }
  tracer($('gAT'), {
    series: [
      { points: ts.map(T => [T, e.aT[T]]), mode: 'points', couleur: jetonEncre(), taille: 3.4, libelle: 'mesuré' },
      { points: wlf, mode: 'ligne', couleur: acc, epaisseur: 1.8 }
    ],
    yLog: true, xTitre: 'T (°C)', yTitre: 'a_T',
    format: (x, y) => `${nb(x, 1)} °C · a_T = ${nb(y)}`
  });
  for (const [c, cap] of [['gCole', 'capCole'], ['gBlack', 'capBlack'], ['gMaitreE', 'capMaitreE'],
    ['gMaitreP', 'capMaitreP'], ['gNu', 'capNu'], ['gAT', 'capAT']]) {
    rendreInterrogeable($(c), $(cap));
  }

  const ec = ecarts({ module: (f) => evaluer(e, f) }, points, e.aT, e.p);
  $('vPoints').textContent = points.length;
  $('vEcartE').textContent = Number.isFinite(ec.module) ? nb(ec.module, 2) + ' %' : '—';
  $('vEcartP').textContent = Number.isFinite(ec.phase) ? nb(ec.phase, 2) + ' °' : '—';

  rendreAT(ts);
  synchroniserParametres();
}

function rendreAT(ts) {
  const e = actif(), t = $('tabAT');
  t.innerHTML = '';
  const thead = el('thead'), tr = el('tr');
  for (const h of ['T (°C)', 'a_T', 'log a_T', 'a_T WLF', 'τE(T) (s)']) {
    const th = el('th', null, h); th.scope = 'col'; tr.appendChild(th);
  }
  thead.appendChild(tr); t.appendChild(thead);
  const tb = el('tbody');
  for (const T of ts) {
    const r = el('tr');
    const th = el('th', null, String(T)); th.scope = 'row'; r.appendChild(th);
    const td = el('td');
    const inp = el('input'); inp.type = 'number'; inp.step = 'any'; inp.value = e.aT[T];
    inp.style.cssText = 'width:118px;font-size:11.5px;padding:2px 4px';
    inp.setAttribute('aria-label', `a_T à ${T} °C`);
    inp.oninput = () => { const v = parseFloat(inp.value); if (v > 0) { e.aT[T] = v; rafraichirCalage(); } };
    td.appendChild(inp); r.appendChild(td);
    r.appendChild(el('td', null, nb(Math.log10(e.aT[T]), 3)));
    r.appendChild(el('td', null, nb(aTwlf(T, e.Tref, e.C1, e.C2), 4)));
    r.appendChild(el('td', null, nb(e.p.tauE / e.aT[T], 6)));
    tb.appendChild(r);
  }
  t.appendChild(tb);
}

/* ══════════════════════════════════════════════════════ étape 05 */

function rendreComparaison() {
  const t = $('tabEssais');
  t.innerHTML = '';
  const thead = el('thead'), tr = el('tr');
  for (const h of ['', 'Essai', 'Ø (mm)', 'Paliers', 'Cycles', 'Modèle', 'Tref (°C)', 'Écart |E*|', '']) {
    const th = el('th', null, h); th.scope = 'col'; tr.appendChild(th);
  }
  thead.appendChild(tr); t.appendChild(thead);
  const tb = el('tbody');
  S.essais.forEach((e, i) => {
    const r = el('tr');
    const tdC = el('td');
    const chk = el('input'); chk.type = 'checkbox'; chk.checked = e.visible;
    chk.style.width = 'auto';
    chk.setAttribute('aria-label', 'Afficher ' + e.nom);
    chk.onchange = () => { e.visible = chk.checked; tracerComparaison(); };
    tdC.appendChild(chk); r.appendChild(tdC);
    const th = el('th'); th.scope = 'row';
    th.innerHTML = `<span class="pastille" style="border-color:${e.couleur};color:${e.couleur}">${e.nom}</span>`;
    r.appendChild(th);
    const cycles = e.paliers.reduce((a, p) => a + p.lignes.length, 0);
    const ec = ecarts({ module: f => evaluer(e, f) }, pointsCalage(e), e.aT, e.p);
    for (const v of [nb(e.meta.diametre, 2), String(e.paliers.length), String(cycles),
      modele(e.modeleId).nom, String(e.Tref), Number.isFinite(ec.module) ? nb(ec.module, 2) + ' %' : '—']) {
      r.appendChild(el('td', null, v));
    }
    const tdA = el('td');
    const b = el('button', 'btn', i === S.actif ? 'courant' : 'ouvrir');
    b.disabled = i === S.actif;
    b.onclick = () => { S.actif = i; toutRedessiner(); };
    tdA.appendChild(b); r.appendChild(tdA);
    tb.appendChild(r);
  });
  t.appendChild(tb);
  tracerComparaison();
  rendreConstantes();
}

function tracerComparaison() {
  const visibles = S.essais.filter(e => e.visible && pointsCalage(e).length);
  const sE = [], sCole = [], sBlack = [], sAT = [], lg = $('legCmp');
  lg.innerHTML = '';
  for (const e of visibles) {
    const pts = pointsCalage(e);
    const courbe = [];
    for (let lf = -8; lf <= 10; lf += 0.08) {
      const f = 10 ** lf;
      courbe.push([f, evaluer(e, f).norme]);
    }
    sE.push({ points: courbe, mode: 'ligne', couleur: e.couleur, epaisseur: 1.6 });
    sE.push({ points: pts.map(p => [p.f * (e.aT[p.T] || 1), p.module, p]), mode: 'points', couleur: e.couleur, libelle: e.nom });
    sCole.push({ points: pts.map(p => [p.E1, p.E2, p]), mode: 'points', couleur: e.couleur, libelle: e.nom });
    sBlack.push({ points: pts.map(p => [p.phi, p.module, p]), mode: 'points', couleur: e.couleur, libelle: e.nom });
    const ts = uniques(pts.map(p => p.T));
    sAT.push({ points: ts.map(T => [T, e.aT[T]]), mode: 'points', couleur: e.couleur, taille: 3.2, libelle: e.nom });
    sAT.push({ points: ts.map(T => [T, e.aT[T]]).sort((a, b) => a[0] - b[0]), mode: 'ligne', couleur: e.couleur, epaisseur: 1.2 });
    const s = el('span'); s.innerHTML = `<i style="background:${e.couleur}"></i>${e.nom}`;
    lg.appendChild(s);
  }
  const fmt = (x, y, p) => (p ? `${p.T} °C · ${freq(p.f)} Hz — ` : '') + `${nb(x)} · ${nb(y)}`;
  tracer($('gCmpE'), { series: sE, xLog: true, yLog: true, xTitre: 'f·a_T (Hz)', yTitre: '|E*| (MPa)', format: fmt });
  tracer($('gCmpCole'), { series: sCole, xTitre: 'E₁ (MPa)', yTitre: 'E₂ (MPa)', zeroY: true, format: fmt });
  tracer($('gCmpBlack'), { series: sBlack, yLog: true, xTitre: 'φ (°)', yTitre: '|E*| (MPa)', format: fmt });
  tracer($('gCmpAT'), { series: sAT, yLog: true, xTitre: 'T (°C)', yTitre: 'a_T', format: (x, y) => `${nb(x, 1)} °C · ${nb(y)}` });
  for (const [c, cap] of [['gCmpE', 'capCmpE'], ['gCmpCole', 'capCmpCole'], ['gCmpBlack', 'capCmpBlack'], ['gCmpAT', 'capCmpAT']]) {
    rendreInterrogeable($(c), $(cap));
  }
}

function rendreConstantes() {
  const t = $('tabConstantes');
  t.innerHTML = '';
  const cles = [];
  for (const e of S.essais) for (const p of modele(e.modeleId).parametres) if (!cles.includes(p.cle)) cles.push(p.cle);
  cles.push('C1', 'C2', 'Tref');
  const thead = el('thead'), tr = el('tr');
  const th0 = el('th', null, 'Essai'); th0.scope = 'col'; tr.appendChild(th0);
  for (const c of cles) { const th = el('th', null, c); th.scope = 'col'; tr.appendChild(th); }
  thead.appendChild(tr); t.appendChild(thead);
  const tb = el('tbody');
  for (const e of S.essais) {
    const r = el('tr');
    const th = el('th', null, e.nom); th.scope = 'row'; r.appendChild(th);
    for (const c of cles) {
      const v = c === 'C1' ? e.C1 : c === 'C2' ? e.C2 : c === 'Tref' ? e.Tref : e.p[c];
      r.appendChild(el('td', null, Number.isFinite(v) ? nb(v, v > 1000 ? 0 : 4) : '—'));
    }
    tb.appendChild(r);
  }
  t.appendChild(tb);
}

/* ══════════════════════════════════════════════════════ étape 06 */

function rendreEcartsModes() {
  const e = actif(), t = $('tabEcarts');
  t.innerHTML = '';
  const p = e.paliers[0];
  if (!p) { t.innerHTML = '<tbody><tr><td>Aucun palier traité.</td></tr></tbody>'; return; }
  const commun = { freq: p.f, diametre: e.meta.diametre, hCalcul: e.meta.hCalcul, temperature: p.T };
  const exact = traiterPalier(p.donnees, { ...commun, exact: true });
  const corrige = traiterPalier(p.donnees, { ...commun, exact: false });

  const cols = [['module', '|E*| (MPa)', 1], ['phi', 'φ (°)', 2], ['eoax', 'ε₀ ax (µm/m)', 2],
    ['sigma0', 'σ₀ (MPa)', 4], ['nu', 'ν', 4], ['ecA1', 'Δ Axial1 (%)', 2], ['qMC', 'Iq (%)', 2]];
  const thead = el('thead'), r1 = el('tr');
  const c0 = el('th'); c0.scope = 'col'; r1.appendChild(c0);
  for (const c of cols) { const th = el('th', 'groupe', c[1]); th.colSpan = 3; th.scope = 'colgroup'; r1.appendChild(th); }
  const r2 = el('tr');
  const c1 = el('th', null, 'Cycle'); c1.scope = 'col'; r2.appendChild(c1);
  for (const _ of cols) for (const h of ['Excel', 'corrigé', 'écart']) {
    const th = el('th', null, h); th.scope = 'col'; r2.appendChild(th);
  }
  thead.append(r1, r2); t.appendChild(thead);

  const tb = el('tbody');
  for (let i = 0; i < Math.min(exact.length, corrige.length); i++) {
    const r = el('tr');
    const th = el('th', null, String(exact[i].cycle)); th.scope = 'row'; r.appendChild(th);
    for (const c of cols) {
      const a = exact[i][c[0]], b = corrige[i][c[0]];
      r.appendChild(el('td', null, nb(a, c[2])));
      r.appendChild(el('td', null, nb(b, c[2])));
      const d = (b - a) / Math.abs(a) * 100;
      const td = el('td', null, Number.isFinite(d) ? (d >= 0 ? '+' : '') + nb(d, 2) + ' %' : '—');
      if (Math.abs(d) > 5) td.className = 'grave'; else if (Math.abs(d) > 1) td.className = 'alerte';
      r.appendChild(td);
    }
    tb.appendChild(r);
  }
  t.appendChild(tb);
}

/* ══════════════════════════════════════════════════════ exports */

const COLONNES_DATA = [
  ['T', 'T (°C)'], ['f', 'f (Hz)'], ['cycle', 'Cycle'], ['sigma0', 'so (MPa)'],
  ['eoax', 'eoax (µm/m)'], ['phi', 'j0ax (°)'], ['eorad', 'eorad (µm/m)'], ['nu', 'n'],
  ['phiNu', 'j(ax-rad) (°)'], ['module', 'E (MPa)'], ['E1', 'E1 (MPa)'], ['E2', 'E2 (MPa)'],
  ['ampF', 'Force (kN)'], ['ampPos', 'Déplacement piston (mm)'], ['ampPil', 'Moy pilotage (µm/m)'],
  ['ampA1', 'Axial1 (µm/m)'], ['ampA2', 'Axial2 (µm/m)'], ['ampA3', 'Axial3 (µm/m)'],
  ['ampR1', 'Radial1 (µm/m)'], ['ampR2', 'Radial2 (µm/m)'], ['ampR3', 'Radial3 (µm/m)'],
  ['ampR4', 'Radial4 (µm/m)'], ['ampMC', 'Moy calcul (µm/m)'], ['ampMR', 'Moy radiales (µm/m)'],
  ['ecA1', 'Écart Axial1'], ['ecA2', 'Écart Axial2'], ['ecA3', 'Écart Axial3'],
  ['ecR1', 'Écart Radial1'], ['ecR2', 'Écart Radial2'], ['ecR3', 'Écart Radial3'], ['ecR4', 'Écart Radial4'],
  ['qF', 'Iq Force'], ['qPos', 'Iq Déplacement'], ['qPil', 'Iq Moy pilotage'],
  ['qA1', 'Iq Axial1'], ['qA2', 'Iq Axial2'], ['qA3', 'Iq Axial3'],
  ['qR1', 'Iq Radial1'], ['qR2', 'Iq Radial2'], ['qR3', 'Iq Radial3'], ['qR4', 'Iq Radial4'],
  ['qMC', 'Iq Moy calcul'], ['qMR', 'Iq Moy radiales'],
  ['sigmaMoy', 'Contrainte moyenne (MPa)'], ['moyPil', 'Moy pilotage calcul'],
  ['moyA1', 'Moy Axial1'], ['moyA2', 'Moy Axial2'], ['moyA3', 'Moy Axial3'],
  ['moyR1', 'Moy Radial1'], ['moyR2', 'Moy Radial2'], ['moyMR', 'Moy radiales'],
  ['sonde', 'Sonde (°C)'], ['phF', 'Phase Force'], ['phPos', 'Phase Déplacement'],
  ['phPil', 'Phase Moy pilotage'], ['phA1', 'Phase Axial1'], ['phA2', 'Phase Axial2'],
  ['phA3', 'Phase Axial3'], ['phR1', 'Phase Radial1'], ['phR2', 'Phase Radial2'],
  ['phMC', 'Phase Moy calcul'], ['phMR', 'Phase Moy radiales'], ['nPoints', 'Points']
];

function tableauData(e) {
  // La colonne « Retenu » garde la trace du tri : un cycle écarté reste dans
  // l'export, marqué, avec le motif — sinon la décision serait invisible.
  const out = [['Retenu', 'Motif de mise à l\'écart', ...COLONNES_DATA.map(c => c[1])]];
  for (const p of e.paliers) {
    for (const l of p.lignes) {
      const dedans = retenu(e, l);
      out.push([dedans ? 'oui' : 'non', dedans ? '' : (e.motifs[cleCycle(l)] || 'écarté à la main'),
        ...COLONNES_DATA.map(c => l[c[0]])]);
    }
  }
  return out;
}
function tableauCalcul(e) {
  const out = [['T (°C)', 'f (Hz)', 'cycles retenus', 'cycles écartés', '|E*| (MPa)', 'φ (°)', '|ν|', 'φν (°)', 'σ (MPa)', 'ε1 (µm/m)', 'ε2 (µm/m)']];
  for (const [nom, suffixe] of [['moyenne', ''], ['maximum', '_max'], ['minimum', '_min'], ['écart-type', '_et']]) {
    out.push([], [nom]);
    for (const a of e.synthese) {
      out.push([a.T, a.f, a.n, a.ecartes || 0, a['module' + suffixe], a['phi' + suffixe], a['nu' + suffixe],
        a['phiNu' + suffixe], a['sigma0' + suffixe], a['eoax' + suffixe], a['eorad' + suffixe]]);
    }
  }
  return out;
}
function tableauModele(e) {
  const m = modele(e.modeleId);
  const out = [['Modèle', m.nom], ['Référence', m.reference], []];
  for (const p of m.parametres) out.push([p.label + (p.unite ? ` (${p.unite})` : ''), e.p[p.cle]]);
  out.push([], ['WLF'], ['Tref (°C)', e.Tref], ['C1', e.C1], ['C2', e.C2], [], ['T (°C)', 'a_T']);
  for (const T of uniques(pointsCalage(e).map(p => p.T))) out.push([T, e.aT[T]]);
  return out;
}

function csv(lignes) {
  return '﻿' + lignes.map(l => l.map(v => {
    if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
    return '"' + String(v ?? '').replace(/"/g, '""') + '"';
  }).join(';')).join('\r\n');
}

function projetJSON() {
  return JSON.stringify({
    version: 2,
    essais: S.essais.map(e => ({
      nom: e.nom, meta: e.meta, correspondance: e.correspondance, uniteAxiale: e.uniteAxiale,
      temperatures: e.temperatures, frequences: e.frequences, nbCycles: e.nbCycles,
      voiesAx: e.voiesAx, voiesRad: e.voiesRad, mode: e.mode,
      modeleId: e.modeleId, p: e.p, aT: e.aT, Tref: e.Tref, C1: e.C1, C2: e.C2, couleur: e.couleur,
      exclus: [...e.exclus], motifs: e.motifs
    }))
  }, null, 2);
}

let telechargement = null;
async function enregistrer(nom, blob) {
  // Dans l'application Thèse, la page est intégrée au module Traitement : la boîte
  // « Enregistrer sous » de Windows remplace le téléchargement du navigateur.
  const hote = window.parent !== window ? window.parent.theseEnregistrer : undefined;
  if (typeof hote === 'function') {
    try { if (await hote(nom, blob)) flash(nom + ' enregistré'); }
    catch { flash('Enregistrement impossible', 'grave'); }
    return;
  }
  if (telechargement === null && globalThis.claude?.use) {
    try { telechargement = await globalThis.claude.use('downloads'); } catch { telechargement = false; }
  }
  if (telechargement) {
    try { await telechargement.save({ filename: nom, data: blob }); flash(nom + ' enregistré'); }
    catch (err) { if (err?.code !== 'declined') flash('Enregistrement impossible', 'grave'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  flash(nom + ' téléchargé');
}
function flash(texte, type = 'ok') {
  const m = $('msgCopie');
  m.textContent = texte; m.className = 'pastille ' + type; m.hidden = false;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { m.hidden = true; }, 3000);
}

/* ══════════════════════════════════════════════════════ chef d'orchestre */

function rendreSelecteurEssais() {
  const sel = $('selEssai');
  sel.innerHTML = '';
  S.essais.forEach((e, i) => {
    const o = el('option', null, e.nom + (e.demo ? ' (démonstration)' : ''));
    o.value = i; sel.appendChild(o);
  });
  sel.value = String(S.actif);
  sel.onchange = () => { S.actif = +sel.value; toutRedessiner(); };
}

function rendreEtat() {
  const e = actif();
  const cycles = e.paliers.reduce((a, p) => a + p.lignes.length, 0);
  const tronques = e.paliers.reduce((a, p) => a + p.lignes.filter(l => l.tronque).length, 0);
  const ecartes = e.exclus.size;
  $('etat').innerHTML =
    `<span>${e.nom}</span><span class="sep">·</span>` +
    `<span>Ø ${nb(e.meta.diametre, 2)} mm</span><span class="sep">·</span>` +
    `<span>${e.table ? entier(e.table.n) : 0} lignes brutes</span><span class="sep">·</span>` +
    `<span>${e.paliers.length} paliers · ${cycles} cycles</span><span class="sep">·</span>` +
    `<span>mode ${e.mode === 'excel' ? "Excel à l'identique" : 'corrigé'}</span>` +
    (ecartes ? `<span class="sep">·</span><span class="pastille alerte">${ecartes} cycle${ecartes > 1 ? 's' : ''} écarté${ecartes > 1 ? 's' : ''}</span>` : '') +
    (tronques ? `<span class="sep">·</span><span class="pastille alerte">${tronques} cycles tronqués à 410 points</span>` : '') +
    (S.essais.length > 1 ? `<span class="sep">·</span><span>${S.essais.length} essais chargés</span>` : '');
  $('modeExcel').setAttribute('aria-pressed', String(e.mode === 'excel'));
  $('modeCorrige').setAttribute('aria-pressed', String(e.mode !== 'excel'));
}

function toutRedessiner() {
  rendreSelecteurEssais();
  rendreCorrespondance(); rendreVoies(); rendreEprouvette(); rendreMatrice();
  rendreCycles(); rendreEcartes(); rendreSynthese();
  rendreModeleSelect(); rendreTref(); rendreParametres(); rafraichirCalage();
  rendreComparaison(); rendreEcartsModes(); rendreEtat();
}

function rendreModeleSelect() {
  const e = actif(), sel = $('selModele');
  sel.innerHTML = '';
  for (const m of MODELES) { const o = el('option', null, m.nom); o.value = m.id; sel.appendChild(o); }
  sel.value = e.modeleId;
  sel.onchange = () => {
    const m = modele(sel.value);
    e.modeleId = m.id;
    e.p = parametresInitiaux(m, e.p);
    e._chaine = null;
    rendreParametres(); rafraichirCalage(); rendreInfoModele();
  };
  rendreInfoModele();
}
function rendreInfoModele() {
  const m = modele(actif().modeleId);
  $('infoModele').innerHTML = `${m.resume} <em>${m.reference}</em>`;
}
function rendreTref() {
  const e = actif(), sel = $('selTref');
  const ts = uniques(pointsCalage(e).map(p => p.T));
  sel.innerHTML = '';
  for (const T of ts) { const o = el('option', null, T + ' °C'); o.value = T; sel.appendChild(o); }
  sel.value = String(e.Tref);
  sel.onchange = () => {
    const ancien = e.Tref;
    e.Tref = parseFloat(sel.value);
    const k = e.aT[e.Tref] || 1;
    for (const T of Object.keys(e.aT)) e.aT[T] /= k;
    e.p.tauE *= k; if (Number.isFinite(e.p.tauNu)) e.p.tauNu *= k;
    rafraichirCalage();
  };
}

/* ══════════════════════════════════════════════════════ démarrage */

function chargerDemo() {
  const e = nouvelEssai('démonstration');
  e.demo = true;
  e.table = signalDemo();
  e.entetes = e.table.lignesTexte[0];
  e.correspondance = { ...CORRESPONDANCE_PAR_DEFAUT };
  e.uniteAxiale = 'mm/mm';
  e.meta = { diametre: 75, hauteur: 149, hCalcul: 1, cycleInitial: 1, a1: 0.001, b1: 0, a2: 0.001, b2: 0 };
  e.temperatures = [15]; e.frequences = [0.003]; e.nbCycles = [[3]];
  e.pointsDemo = pointsDemo();
  e.p = { ...CONSTANTES_DEMO, E0: 34000, k: 0.21, h: 0.65, delta: 2.6, tauE: 0.8, beta: 300 };
  e.Tref = WLF_DEMO.Tref; e.C1 = WLF_DEMO.C1; e.C2 = WLF_DEMO.C2;
  S.essais.push(e);
  S.actif = 0;
}

function onglets() {
  const boutons = [...$('etapes').children];
  boutons.forEach((b, i) => {
    b.onclick = () => {
      boutons.forEach((x, j) => {
        x.setAttribute('aria-selected', String(i === j));
        $('etape' + j).hidden = i !== j;
      });
      if (i === 2) rendreSynthese();
      if (i === 3) rafraichirCalage();
      if (i === 4) rendreComparaison();
      if (i === 5) rendreEcartsModes();
    };
    b.onkeydown = ev => {
      const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      const k = (i + d + boutons.length) % boutons.length;
      boutons[k].focus(); boutons[k].click();
    };
  });
}

async function demarrer() {
  onglets(); lierEprouvette();
  chargerDemo();
  $('infoFichier').innerHTML =
    "Aucun fichier chargé — l'écran montre un essai de démonstration entièrement calculé " +
    "à l'ouverture, à partir de constantes connues. L'optimiseur doit les retrouver.";
  await traiter();
  toutRedessiner();

  // premier calage de la démonstration, pour ouvrir sur une courbe qui tient
  const e = actif();
  const r = calageConjoint(modele(e.modeleId), grouperParT(e), e.Tref, e.p, e.aT);
  e.p = r.parametres; e.aT = r.aT;
  const ts = uniques(pointsCalage(e).map(p => p.T));
  const w = calerWLF(ts, ts.map(T => e.aT[T]), e.Tref, [e.C1, e.C2]);
  e.C1 = w.C1; e.C2 = w.C2;
  const rp = calerPoisson(modele(e.modeleId), pointsCalage(e), e.aT, e.p);
  e.p = rp.parametres;
  rafraichirCalage();
  libre();
}

function grouperParT(e) {
  const g = {};
  for (const p of pointsCalage(e)) (g[p.T] ||= []).push(p);
  return g;
}

/* ══════════════════════════════════════════════════════ événements */

function brancher() {
  $('depot').onclick = () => $('fichier').click();
  $('fichier').onchange = ev => { if (ev.target.files.length) chargerFichiers([...ev.target.files]); };
  for (const t of ['dragenter', 'dragover']) {
    $('depot').addEventListener(t, ev => { ev.preventDefault(); $('depot').classList.add('survol'); });
  }
  for (const t of ['dragleave', 'drop']) {
    $('depot').addEventListener(t, ev => { ev.preventDefault(); $('depot').classList.remove('survol'); });
  }
  $('depot').addEventListener('drop', ev => {
    if (ev.dataTransfer.files.length) chargerFichiers([...ev.dataTransfer.files]);
  });

  $('btnProposer').onclick = () => proposerEcarts();
  $('btnToutRetablir').onclick = () => {
    const e = actif();
    e.exclus.clear(); e.motifs = {};
    appliquerExclusions();
    flash('tous les cycles sont de nouveau pris en compte');
  };

  $('btnDetecter').onclick = async () => { occupe('Analyse du découpage…', 0); await souffler(); detecter(false); libre(); };
  $('btnTraiter').onclick = async () => { await traiter(); toutRedessiner(); };
  $('btnAddT').onclick = () => {
    const e = actif();
    e.temperatures.push((e.temperatures.at(-1) || 0) + 10);
    for (const r of e.nbCycles) r.push(0);
    rendreMatrice();
  };
  $('btnDelT').onclick = () => {
    const e = actif();
    if (e.temperatures.length > 1) { e.temperatures.pop(); for (const r of e.nbCycles) r.pop(); rendreMatrice(); }
  };
  $('btnAddF').onclick = () => {
    const e = actif();
    e.frequences.push(1); e.nbCycles.push(e.temperatures.map(() => 0)); rendreMatrice();
  };
  $('btnDelF').onclick = () => {
    const e = actif();
    if (e.frequences.length > 1) { e.frequences.pop(); e.nbCycles.pop(); rendreMatrice(); }
  };

  const changerMode = async m => { actif().mode = m; await traiter(); toutRedessiner(); };
  $('modeExcel').onclick = () => changerMode('excel');
  $('modeCorrige').onclick = () => changerMode('corrige');

  $('btnTheme').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const sombre = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', sombre ? 'light' : 'dark');
    setTimeout(toutRedessiner, 20);
  };

  for (const b of document.querySelectorAll('[data-stat]')) {
    b.onclick = () => {
      S.stat = b.dataset.stat;
      for (const x of document.querySelectorAll('[data-stat]')) x.setAttribute('aria-pressed', String(x === b));
      rendreSynthese();
    };
  }

  for (const id of ['rC1', 'nC1']) $(id).oninput = () => { actif().C1 = parseFloat($(id).value); synchroniserParametres(); rafraichirCalage(); };
  for (const id of ['rC2', 'nC2']) $(id).oninput = () => { actif().C2 = parseFloat($(id).value); synchroniserParametres(); rafraichirCalage(); };

  $('btnCalerConjoint').onclick = async () => {
    const e = actif();
    occupe('Calage des constantes et des a_T…', 0.4); await souffler();
    const r = calageConjoint(modele(e.modeleId), grouperParT(e), e.Tref, e.p, e.aT);
    e.p = r.parametres; e.aT = r.aT;
    const ts = uniques(pointsCalage(e).map(p => p.T));
    const w = calerWLF(ts, ts.map(T => e.aT[T]), e.Tref, [e.C1, e.C2]);
    e.C1 = w.C1; e.C2 = w.C2;
    rafraichirCalage(); libre();
  };
  $('btnCalerModule').onclick = async () => {
    const e = actif();
    occupe('Calage des constantes…', 0.4); await souffler();
    e.p = calerModule(modele(e.modeleId), pointsCalage(e), e.aT, e.p).parametres;
    rafraichirCalage(); libre();
  };
  $('btnCalerNu').onclick = async () => {
    const e = actif();
    occupe('Ajustement de ν*…', 0.4); await souffler();
    e.p = calerPoisson(modele(e.modeleId), pointsCalage(e), e.aT, e.p).parametres;
    rafraichirCalage(); libre();
  };
  $('btnReinit').onclick = () => {
    const e = actif();
    e.p = parametresInitiaux(modele(e.modeleId));
    e._chaine = null; rafraichirCalage();
  };
  $('btnRecaler').onclick = async () => {
    const e = actif();
    occupe('Recalage des isothermes…', 0.4); await souffler();
    e.aT = recalerIsothermes(grouperParT(e), e.Tref);
    rafraichirCalage(); libre();
  };
  $('btnWLF').onclick = () => {
    const e = actif();
    const ts = uniques(pointsCalage(e).map(p => p.T));
    const r = calerWLF(ts, ts.map(T => e.aT[T]), e.Tref, [e.C1, e.C2]);
    e.C1 = r.C1; e.C2 = r.C2;
    synchroniserParametres(); rafraichirCalage();
  };

  $('expXlsx').onclick = async () => {
    const e = actif();
    const blob = await ecrireXlsx([
      { nom: 'Data', lignes: tableauData(e) },
      { nom: 'Calcul', lignes: tableauCalcul(e) },
      { nom: 'Modele', lignes: tableauModele(e) }
    ]);
    enregistrer(`${e.nom || 'synthese'}_Synt_Temp.xlsx`, blob);
  };
  $('expCycles').onclick = () => enregistrer(`${actif().nom}_cycles.csv`, new Blob([csv(tableauData(actif()))], { type: 'text/csv' }));
  $('expSynthese').onclick = () => enregistrer(`${actif().nom}_synthese.csv`, new Blob([csv(tableauCalcul(actif()))], { type: 'text/csv' }));
  $('expModele').onclick = () => {
    const e = actif();
    const lignes = [['T (°C)', 'f (Hz)', 'aT', 'f.aT', '|E*| exp', '|E*| modèle', 'φ exp', 'φ modèle', '|ν| exp']];
    for (const p of pointsCalage(e)) {
      const a = e.aT[p.T] || 1, v = evaluer(e, p.f * a);
      lignes.push([p.T, p.f, a, p.f * a, p.module, v.norme, p.phi, v.phase, p.nu]);
    }
    enregistrer(`${e.nom}_modele.csv`, new Blob([csv(lignes)], { type: 'text/csv' }));
  };
  $('expJson').onclick = () => enregistrer('projet-2s2p1d.json', new Blob([projetJSON()], { type: 'application/json' }));
  $('impJson').onclick = () => $('fichierJson').click();
  $('fichierJson').onchange = async ev => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      for (const [i, sauve] of (j.essais || []).entries()) {
        const e = S.essais[i];
        if (!e) continue;
        const exclus = sauve.exclus;
        Object.assign(e, sauve);
        e.exclus = new Set(exclus || []);
        e.motifs = sauve.motifs || {};
      }
      if (S.essais[0]) await traiter();
      toutRedessiner();
      flash('projet rechargé');
    } catch (err) { flash('Fichier projet illisible', 'grave'); }
  };

  const copier = (texte, message) => navigator.clipboard.writeText(texte)
    .then(() => flash(message), () => flash('Copie refusée par le navigateur', 'grave'));
  $('copSynthese').onclick = () => copier(csv(tableauCalcul(actif())), 'synthèse copiée');
  $('copProjet').onclick = () => copier(projetJSON(), 'projet copié');

  let minuteur;
  addEventListener('resize', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => { rendreSynthese(); rafraichirCalage(); rendreTableCycles(); tracerComparaison(); }, 200);
  });
}

document.getElementById('ouverture-locale')?.remove();
brancher();
demarrer();
