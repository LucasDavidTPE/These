"""Régimes de sollicitation : ils fixent la pulsation vue par le matériau pour chaque nombre d'onde.

- Static()          : omega = 0  (module statique ; E00 pour un 2S2P1D, fluage long terme) ;
- Harmonic(f)       : charge fixe p(x, y) exp(i 2 pi f t)  -> omega = 2 pi f pour tout k ;
                      les champs obtenus sont des amplitudes complexes (HWD en fréquentiel) ;
- Moving(V)         : charge se déplaçant à vitesse constante V selon +x, régime permanent
                      (quasi-stationnaire, inertie négligée). Dans le repère mobile X = x - V t,
                      le mode exp(i k1 X) est vu par un point matériel comme exp(-i k1 V t),
                      donc omega = -k1 V.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


class Regime:
    hermitian = True  # K(-k) = conj K(k) -> champs réels

    def omega(self, k1, k2):  # pragma: no cover
        raise NotImplementedError


@dataclass
class Static(Regime):
    def omega(self, k1, k2):
        return np.zeros(np.broadcast(k1, k2).shape)


@dataclass
class Harmonic(Regime):
    freq_hz: float
    hermitian = False

    def omega(self, k1, k2):
        return np.full(np.broadcast(k1, k2).shape, 2 * np.pi * self.freq_hz)


@dataclass
class Moving(Regime):
    speed: float  # m/s, sens +x

    def omega(self, k1, k2):
        k1, k2 = np.broadcast_arrays(k1, k2)
        return -k1 * self.speed


@dataclass
class MovingEnvelope(Regime):
    """Enveloppe roulante modulée par une onde fixe exp(i k_n x) : omega = -k1 V où k1 est le
    nombre d'onde de l'enveloppe (utilisé avec spectral_fields(..., k1_shift=k_n)).
    Le champ obtenu n'est pas réel (hermitian = False) : on somme les harmoniques +/- n."""

    speed: float
    hermitian = False

    def omega(self, k1, k2):
        k1, k2 = np.broadcast_arrays(k1, k2)
        return -k1 * self.speed
