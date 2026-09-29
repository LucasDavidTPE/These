"""Assemblage des multiplicateurs spectraux : noyau x chargement -> composantes transformées."""
from __future__ import annotations

from typing import Dict, Iterable, Sequence

import numpy as np

from .kernel import LayeredKernel
from .structure import Structure

DISP = ("ux", "uy", "uz")
STRAIN = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
STRESS = ("sxx", "syy", "szz", "sxy", "sxz", "syz")
ALL = DISP + STRAIN + STRESS


def layer_moduli(structure: Structure, omega):
    lam, mu = [], []
    for L in structure.layers:
        l, m = L.material.lame(omega)
        lam.append(l)
        mu.append(m)
    return lam, mu


def components_from_amplitudes(amp, xi, c1, c2, p, T0, R0, comps: Iterable[str]):
    """Transformées de Fourier des composantes demandées à une profondeur.

    amp : dict renvoyé par LayeredKernel.at_depth ; p = p^ ; T0, R0 : décomposition
    P-SV / SH des efforts tangentiels de surface (ou None).
    """
    mr = amp["mu_ref"]
    Un, Wn, dUn, dWn = amp["n"]
    U = Un * p
    W = Wn * p
    dU = dUn * p
    dW = dWn * p
    V = 0.0
    dV = 0.0
    if T0 is not None:
        Ut, Wt, dUt, dWt = amp["t"]
        U = U + Ut * T0
        W = W + Wt * T0
        dU = dU + dUt * T0
        dW = dW + dWt * T0
        Vs, dVs = amp["sh"]
        V = Vs * R0
        dV = dVs * R0
    out: Dict[str, np.ndarray] = {}
    need = set(comps)
    e = {}
    if need & set(STRAIN + STRESS):
        e["exx"] = -c1 * (c1 * U - c2 * V) / mr
        e["eyy"] = -c2 * (c2 * U + c1 * V) / mr
        e["ezz"] = dW / mr
        e["exy"] = -(c1 * c2 * U + 0.5 * (c1**2 - c2**2) * V) / mr
        e["exz"] = 0.5j * (c1 * (dU + W) - c2 * dV) / mr
        e["eyz"] = 0.5j * (c2 * (dU + W) + c1 * dV) / mr
    for c in comps:
        if c == "ux":
            out[c] = 1j * (c1 * U - c2 * V) / (mr * xi)
        elif c == "uy":
            out[c] = 1j * (c2 * U + c1 * V) / (mr * xi)
        elif c == "uz":
            out[c] = W / (mr * xi)
        elif c in STRAIN:
            out[c] = e[c]
    if need & set(STRESS):
        lam = amp["lam"]
        mu = amp["mu"]
        tr = e["exx"] + e["eyy"] + e["ezz"]
        for c in comps:
            if c in ("sxx", "syy", "szz"):
                out[c] = lam * tr + 2 * mu * e["e" + c[1:]]
            elif c in ("sxy", "sxz", "syz"):
                out[c] = 2 * mu * e["e" + c[1:]]
    return out


def tangential_decomposition(c1, c2, qx, qy):
    """(T0, R0) tels que sigma_xz(0) = -qx et sigma_yz(0) = -qy (voir notice §3.4)."""
    if qx is None and qy is None:
        return None, None
    qx = 0.0 if qx is None else qx
    qy = 0.0 if qy is None else qy
    T0 = 1j * (c1 * qx + c2 * qy)
    R0 = 1j * (-c2 * qx + c1 * qy)
    return T0, R0


def spectral_fields(structure, regime, loading, k1, k2, depths, comps, side="above", filter_width=0.0,
                    k1_shift=0.0):
    """Calcule, pour un paquet de nombres d'onde (tableaux de même forme), les transformées
    des composantes demandées à chaque profondeur. Renvoie dict[(comp, z)] -> tableau.

    k1_shift : décalage du nombre d'onde « géométrique ». Le noyau est évalué en k1 + k1_shift
    alors que la pulsation (regime.omega) et le spectre de chargement le sont en k1. Sert aux
    chargements p0(x - Vt) exp(i k_n x) (texture fixe sous une enveloppe roulante, notice texture §4).
    """
    k1, k2 = np.broadcast_arrays(np.asarray(k1, float), np.asarray(k2, float))
    shape = k1.shape
    a = k1.ravel()
    b = k2.ravel()
    ag = a + k1_shift
    xi = np.hypot(ag, b)
    if np.any(xi == 0):
        raise ValueError("xi = 0 doit être traité par moyenne de cellule.")
    c1 = ag / xi
    c2 = b / xi
    omega = regime.omega(a, b)
    lam, mu = layer_moduli(structure, omega)
    p, qx, qy = loading.ft(k1, k2)
    p = np.asarray(p).ravel()
    if filter_width > 0:
        p = p * np.exp(-0.5 * (xi * filter_width) ** 2)
    if qx is not None:
        qx = np.asarray(qx).ravel()
    if qy is not None:
        qy = np.asarray(qy).ravel()
    T0, R0 = tangential_decomposition(c1, c2, qx, qy)
    K = LayeredKernel(structure, xi, lam, mu, tangential=T0 is not None)
    out = {}
    for z in depths:
        amp = K.at_depth(z, side)
        comp = components_from_amplitudes(amp, xi, c1, c2, p, T0, R0, comps)
        for c, v in comp.items():
            out[(c, z)] = v.reshape(shape)
    return out
