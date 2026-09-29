"""Lois de comportement linéaires (élastique, viscoélastiques) dans le domaine fréquentiel.

Convention : une sollicitation harmonique s'écrit eps(t) = Re[eps0 * exp(i*omega*t)] et la
contrainte sigma(t) = Re[E*(omega) * eps0 * exp(i*omega*t)], avec Im(E*) >= 0 pour omega > 0.
Pour omega < 0 on utilise la symétrie hermitienne E*(-omega) = conj(E*(omega)), qui traduit le
fait que la réponse temporelle est réelle.

Toutes les lois renvoient les modules en Pa. Les paramètres sont saisis en MPa (unités usuelles
des chaussées) sauf indication contraire.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Sequence

import numpy as np

MPA = 1.0e6


def _hermitian(fun, omega):
    """Évalue fun(|omega|) (définie pour omega >= 0) et applique E(-w) = conj(E(w))."""
    omega = np.asarray(omega, dtype=float)
    val = fun(np.abs(omega))
    return np.where(omega < 0, np.conj(val), val)


class Material:
    """Classe de base. Sous-classes : Elastic, TwoS2P1D, GeneralizedKelvinVoigt, GeneralizedMaxwell."""

    name: str = "matériau"

    # -- à surcharger ---------------------------------------------------------------
    def young(self, omega):  # pragma: no cover - interface
        raise NotImplementedError

    def poisson(self, omega):
        return np.full(np.shape(omega), self.nu, dtype=complex)

    # -- dérivés ------------------------------------------------------------------------
    def lame(self, omega):
        """Renvoie (lambda*, mu*) en Pa, complexes, de même forme que omega."""
        E = self.young(omega)
        nu = self.poisson(omega)
        mu = E / (2.0 * (1.0 + nu))
        lam = E * nu / ((1.0 + nu) * (1.0 - 2.0 * nu))
        return lam, mu

    @property
    def is_viscous(self) -> bool:
        return False


@dataclass
class Elastic(Material):
    """Élastique linéaire isotrope. E en MPa."""

    E: float
    nu: float = 0.35
    name: str = "élastique"

    def young(self, omega):
        return np.full(np.shape(omega), self.E * MPA, dtype=complex)


@dataclass
class TwoS2P1D(Material):
    """Modèle 2S2P1D (Olard & Di Benedetto, 2003).

    E*(w) = E00 + (E0 - E00) / (1 + delta (i w tau)^-k + (i w tau)^-h + (i w beta tau)^-1)

    E00 : module statique (w -> 0) [MPa]      E0 : module vitreux (w -> inf) [MPa]
    k, h : exposants (0 < k < h < 1)          delta : constante
    tau_ref : temps caractéristique à la température de référence T_ref [s]
    beta : paramètre de l'amortisseur linéaire (np.inf = pas d'amortisseur)
    Équivalence temps-température : WLF (C1, C2) ou table/fonction de décalage a_T.
    Coefficient de Poisson : constant (nu) ou 2S2P1D (nu00, nu0) si nu00 est renseigné :
        nu*(w) = nu00 + (nu0 - nu00) (E*(w) - E00) / (E0 - E00)
    """

    E00: float
    E0: float
    k: float
    h: float
    delta: float
    tau_ref: float
    beta: float = np.inf
    T_ref: float = 15.0
    C1: Optional[float] = None
    C2: Optional[float] = None
    T: Optional[float] = None
    nu: float = 0.35
    nu00: Optional[float] = None
    nu0: Optional[float] = None
    name: str = "2S2P1D"

    # -- temps-température ------------------------------------------------------------
    def shift_factor(self, T: Optional[float] = None) -> float:
        """a_T(T) par WLF : log10 a_T = -C1 (T - Tref) / (C2 + T - Tref)."""
        T = self.T if T is None else T
        if T is None or T == self.T_ref:
            return 1.0
        if self.C1 is None or self.C2 is None:
            raise ValueError("Température différente de T_ref mais C1/C2 (WLF) non renseignés.")
        dT = T - self.T_ref
        return 10.0 ** (-self.C1 * dT / (self.C2 + dT))

    def tau(self, T: Optional[float] = None) -> float:
        return self.tau_ref * self.shift_factor(T)

    def at_temperature(self, T: float) -> "TwoS2P1D":
        new = TwoS2P1D(**{**self.__dict__})
        new.T = T
        return new

    # -- modules --------------------------------------------------------------------------
    def _E_pos(self, w):
        w = np.asarray(w, dtype=float)
        out = np.empty(w.shape, dtype=complex)
        zero = w == 0
        out[zero] = self.E00
        wp = w[~zero]
        iwt = 1j * wp * self.tau()
        den = 1.0 + self.delta * iwt ** (-self.k) + iwt ** (-self.h)
        if np.isfinite(self.beta):
            den = den + 1.0 / (iwt * self.beta)
        out[~zero] = self.E00 + (self.E0 - self.E00) / den
        return out * MPA

    def young(self, omega):
        return _hermitian(self._E_pos, omega)

    def poisson(self, omega):
        if self.nu00 is None:
            return np.full(np.shape(omega), self.nu, dtype=complex)
        E = self.young(omega) / MPA
        return self.nu00 + (self.nu0 - self.nu00) * (E - self.E00) / (self.E0 - self.E00)

    @property
    def is_viscous(self) -> bool:
        return True


@dataclass
class GeneralizedKelvinVoigt(Material):
    """Kelvin-Voigt généralisé (KVG) : ressort E0 en série avec n cellules (E_i, tau_i).

    J*(w) = 1/E0 + sum_i 1 / (E_i (1 + i w tau_i)) ;  E* = 1/J*.  Modules en MPa.
    C'est la forme utilisée dans le TFE (Tableau 7) pour approcher le 2S2P1D dans COMSOL.
    """

    E0: float
    Ei: Sequence[float]
    taui: Sequence[float]
    nu: float = 0.35
    name: str = "KVG"

    def _E_pos(self, w):
        w = np.asarray(w, dtype=float)[..., None]
        Ei = np.asarray(self.Ei, float)
        ti = np.asarray(self.taui, float)
        J = 1.0 / self.E0 + np.sum(1.0 / (Ei * (1.0 + 1j * w * ti)), axis=-1)
        return MPA / J

    def young(self, omega):
        return _hermitian(self._E_pos, omega)

    @property
    def is_viscous(self) -> bool:
        return True


@dataclass
class GeneralizedMaxwell(Material):
    """Maxwell généralisé (série de Prony) : E*(w) = E_inf + sum_i E_i i w tau_i / (1 + i w tau_i). MPa."""

    E_inf: float
    Ei: Sequence[float]
    taui: Sequence[float]
    nu: float = 0.35
    name: str = "Maxwell généralisé"

    def _E_pos(self, w):
        w = np.asarray(w, dtype=float)[..., None]
        Ei = np.asarray(self.Ei, float)
        ti = np.asarray(self.taui, float)
        iwt = 1j * w * ti
        return (self.E_inf + np.sum(Ei * iwt / (1.0 + iwt), axis=-1)) * MPA

    def young(self, omega):
        return _hermitian(self._E_pos, omega)

    @property
    def is_viscous(self) -> bool:
        return True


@dataclass
class FrozenModulus(Material):
    """Matériau élastique dont le module est |E*| (ou E*) d'une autre loi à une fréquence donnée.

    Sert à reproduire l'approche « module équivalent » (ex. |E*(1 Hz)| dans le TFE).
    """

    source: Material
    freq_hz: float
    use_norm: bool = True
    name: str = "module figé"

    def __post_init__(self):
        w = np.array([2 * np.pi * self.freq_hz])
        E = self.source.young(w)[0]
        self._E = abs(E) if self.use_norm else E
        self.nu = float(np.real(self.source.poisson(w)[0]))

    def young(self, omega):
        return np.full(np.shape(omega), self._E, dtype=complex)
