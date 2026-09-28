/**
 * Régimes de sollicitation : ils fixent la pulsation vue par le matériau pour chaque nombre
 * d'onde (regimes.py).
 *
 * - Static()      : omega = 0  (module statique ; E00 pour un 2S2P1D, fluage long terme) ;
 * - Harmonic(f)   : charge fixe p(x, y) exp(i 2 pi f t)  -> omega = 2 pi f pour tout k ;
 *                   les champs obtenus sont des amplitudes complexes (HWD en fréquentiel) ;
 * - Moving(V)     : charge se déplaçant à vitesse constante V selon +x, régime permanent
 *                   (quasi-stationnaire, inertie négligée). Dans le repère mobile X = x - V t,
 *                   le mode exp(i k1 X) est vu par un point matériel comme exp(-i k1 V t),
 *                   donc omega = -k1 V.
 *
 * MovingEnvelope (texture sous enveloppe roulante) n'est pas porté.
 */

export interface Regime {
  /** K(-k) = conj K(k) -> champs réels. */
  readonly hermitian: boolean;
  omega(k1: Float64Array, k2: Float64Array): Float64Array;
  /** Pour l'affichage et les métadonnées (repr du Python). */
  toString(): string;
}

export class Static implements Regime {
  readonly hermitian = true;
  omega(k1: Float64Array): Float64Array {
    return new Float64Array(k1.length);
  }
  toString(): string {
    return "Static()";
  }
}

export class Harmonic implements Regime {
  readonly hermitian = false;
  constructor(readonly freqHz: number) {}
  omega(k1: Float64Array): Float64Array {
    return new Float64Array(k1.length).fill(2 * Math.PI * this.freqHz);
  }
  toString(): string {
    return `Harmonic(freq_hz=${this.freqHz})`;
  }
}

export class Moving implements Regime {
  readonly hermitian = true;
  /** m/s, sens +x. */
  constructor(readonly speed: number) {}
  omega(k1: Float64Array): Float64Array {
    return k1.map((k) => -k * this.speed);
  }
  toString(): string {
    return `Moving(speed=${this.speed})`;
  }
}
