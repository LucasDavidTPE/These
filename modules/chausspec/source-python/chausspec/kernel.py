"""Noyau spectral du multicouche : résolution, pour chaque nombre d'onde, du système linéaire
qui raccorde les solutions générales couche par couche.

Notations (voir la notice, chapitre 3) :
  xi = |k| = sqrt(k1^2 + k2^2),  kappa = 3 - 4 nu = (lambda + 3 mu)/(lambda + mu)
  Déplacements transformés :  u_x = (i/xi)(k1 U - k2 V),  u_y = (i/xi)(k2 U + k1 V),  u_z = W
  Contraintes transformées :  sigma_zz = S,  sigma_xz = (i/xi)(k1 T - k2 R),
                              sigma_yz = (i/xi)(k2 T + k1 R)
  P-SV (U, W, T, S) et SH (V, R) sont découplés pour des couches isotropes.

Solution générale dans une couche d'épaisseur h, cote locale s in [0, h] :
  famille descendante (tau = xi s)       : W = (A + B tau) e^-tau,  U = (-A + kappa B - B tau) e^-tau
  famille montante    (t = xi (h - s))   : W = (C + D t) e^-t,      U = ( C - kappa D + D t) e^-t
  SH : V = a e^-tau + b e^-t
Toutes les exponentielles sont décroissantes : le système reste bien conditionné pour les
grandes valeurs de xi h (pas de dépassement de capacité).

Mise à l'échelle : les inconnues X sont les coefficients physiques multipliés par (mu_ref xi).
Les déplacements physiques valent donc poly(X) / (mu_ref xi) et les déformations poly(X)/mu_ref.
"""
from __future__ import annotations

import numpy as np

from .structure import Structure


# ----------------------------------------------------------------------------------------
# Fonctions de base
# ----------------------------------------------------------------------------------------
def _psv_basis(xi, s, h, kappa, halfspace):
    """Valeurs des fonctions de base P-SV en s. Renvoie U, W, dU, dW de forme (M, ncol).

    dU et dW sont les dérivées par rapport à tau = xi s (d/dz = xi d/dtau).
    """
    tau = xi * s
    e1 = np.exp(-tau)
    one = np.ones_like(xi)
    U = [-e1, (kappa - tau) * e1]
    W = [e1 * one, tau * e1]
    dU = [e1 * one, (-(1.0 + kappa) + tau) * e1]
    dW = [-e1 * one, (1.0 - tau) * e1]
    if not halfspace:
        t = xi * (h - s)
        e2 = np.exp(-t)
        U += [e2 * one, (-kappa + t) * e2]
        W += [e2 * one, t * e2]
        dU += [e2 * one, (-(1.0 + kappa) + t) * e2]
        dW += [e2 * one, (-1.0 + t) * e2]
    st = lambda L: np.stack(np.broadcast_arrays(*L), axis=-1).astype(complex)
    return st(U), st(W), st(dU), st(dW)


def _sh_basis(xi, s, h, halfspace):
    tau = xi * s
    e1 = np.exp(-tau)
    V = [e1]
    dV = [-e1]
    if not halfspace:
        e2 = np.exp(-xi * (h - s))
        V += [e2]
        dV += [e2]
    return np.stack(V, -1).astype(complex), np.stack(dV, -1).astype(complex)


# ----------------------------------------------------------------------------------------
class DenseKernel:
    """Résolution « directe » : un seul système dense de 4n inconnues (coefficients de toutes les
    couches). Conservée comme référence de vérification ; le solveur par défaut est
    StiffnessKernel (même résultat, 5 à 10 fois plus rapide).

    Parameters
    ----------
    structure : Structure
    xi : (M,) nombres d'onde radiaux > 0 [rad/m]
    lam, mu : listes (une entrée par couche) de tableaux (M,) complexes [Pa]
    tangential : si True, résout aussi les cas de charge tangentielle (P-SV et SH).
    """

    def __init__(self, structure: Structure, xi, lam, mu, tangential: bool = False):
        self.st = structure
        self.xi = np.asarray(xi, float)
        if np.any(self.xi <= 0):
            raise ValueError("xi doit être strictement positif (le mode xi = 0 est traité à part).")
        M = self.xi.size
        n = structure.n
        self.lam = [np.broadcast_to(np.asarray(l, complex), (M,)) for l in lam]
        self.mu = [np.broadcast_to(np.asarray(m, complex), (M,)) for m in mu]
        self.kappa = [(l + 3 * m) / (l + m) for l, m in zip(self.lam, self.mu)]
        self.mu_ref = np.abs(self.mu[0])
        self.h = structure.thicknesses
        self.half = structure.bottom == "halfspace"
        # nombre de colonnes par couche
        self.ncol = [4] * n
        self.ncol_sh = [2] * n
        if self.half:
            self.ncol[-1] = 2
            self.ncol_sh[-1] = 1
        self.off = np.concatenate([[0], np.cumsum(self.ncol)])
        self.off_sh = np.concatenate([[0], np.cumsum(self.ncol_sh)])
        self.tangential = tangential
        self._solve_psv()
        if tangential:
            self._solve_sh()

    # ------------------------------------------------------------------------------
    def _layer_quantities(self, j, s):
        """U, W, T, S (et dU, dW) par colonne pour la couche j en s (P-SV)."""
        last_half = self.half and j == self.st.n - 1
        U, W, dU, dW = _psv_basis(self.xi, s, self.h[j], self.kappa[j], last_half)
        lam = self.lam[j][:, None]
        mu = self.mu[j][:, None]
        mr = self.mu_ref[:, None]
        T = mu / mr * (dU + W)
        S = ((lam + 2 * mu) * dW - lam * U) / mr
        return U, W, dU, dW, T, S

    def _solve_psv(self):
        st = self.st
        n = st.n
        M = self.xi.size
        N = self.off[-1]
        A = np.zeros((M, N, N), complex)
        rhs = np.zeros((M, N, 2 if self.tangential else 1), complex)
        r = 0
        # --- surface : S(0) = -p (cas normal, p = 1) ; T(0) = 1 (cas tangentiel) ---------
        U, W, dU, dW, T, S = self._layer_quantities(0, 0.0)
        c0, c1 = self.off[0], self.off[1]
        A[:, r, c0:c1] = S
        rhs[:, r, 0] = -1.0
        r += 1
        A[:, r, c0:c1] = T
        if self.tangential:
            rhs[:, r, 1] = 1.0
        r += 1
        # --- interfaces ---------------------------------------------------------------------
        for i in range(n - 1):
            Ua, Wa, _, _, Ta, Sa = self._layer_quantities(i, self.h[i])
            Ub, Wb, _, _, Tb, Sb = self._layer_quantities(i + 1, 0.0)
            ca = slice(self.off[i], self.off[i + 1])
            cb = slice(self.off[i + 1], self.off[i + 2])
            if st.interfaces[i] == "bonded":
                for qa, qb in ((Ua, Ub), (Wa, Wb), (Ta, Tb), (Sa, Sb)):
                    A[:, r, ca] = qa
                    A[:, r, cb] = -qb
                    r += 1
            else:  # glissement parfait
                for qa, qb in ((Wa, Wb), (Sa, Sb)):
                    A[:, r, ca] = qa
                    A[:, r, cb] = -qb
                    r += 1
                A[:, r, ca] = Ta
                r += 1
                A[:, r, cb] = Tb
                r += 1
        # --- fond ------------------------------------------------------------------------------
        if not self.half:
            j = n - 1
            U, W, _, _, T, S = self._layer_quantities(j, self.h[j])
            cj = slice(self.off[j], self.off[j + 1])
            if st.bottom == "rigid_bonded":
                A[:, r, cj] = U
                r += 1
                A[:, r, cj] = W
                r += 1
            else:  # rigid_smooth
                A[:, r, cj] = W
                r += 1
                A[:, r, cj] = T
                r += 1
        assert r == N, (r, N)
        self.X = np.linalg.solve(A, rhs)  # (M, N, nrhs)

    def _solve_sh(self):
        st = self.st
        n = st.n
        M = self.xi.size
        N = self.off_sh[-1]
        A = np.zeros((M, N, N), complex)
        rhs = np.zeros((M, N, 1), complex)

        def q(j, s):
            last_half = self.half and j == n - 1
            V, dV = _sh_basis(self.xi, s, self.h[j], last_half)
            R = self.mu[j][:, None] / self.mu_ref[:, None] * dV
            return V, dV, R

        r = 0
        V, dV, R = q(0, 0.0)
        A[:, r, self.off_sh[0]:self.off_sh[1]] = R
        rhs[:, r, 0] = 1.0
        r += 1
        for i in range(n - 1):
            Va, _, Ra = q(i, self.h[i])
            Vb, _, Rb = q(i + 1, 0.0)
            ca = slice(self.off_sh[i], self.off_sh[i + 1])
            cb = slice(self.off_sh[i + 1], self.off_sh[i + 2])
            if st.interfaces[i] == "bonded":
                A[:, r, ca] = Va
                A[:, r, cb] = -Vb
                r += 1
                A[:, r, ca] = Ra
                A[:, r, cb] = -Rb
                r += 1
            else:
                A[:, r, ca] = Ra
                r += 1
                A[:, r, cb] = Rb
                r += 1
        if not self.half:
            j = n - 1
            V, _, R = q(j, self.h[j])
            cj = slice(self.off_sh[j], self.off_sh[j + 1])
            A[:, r, cj] = V if st.bottom == "rigid_bonded" else R
            r += 1
        assert r == N
        self.Xsh = np.linalg.solve(A, rhs)

    # ------------------------------------------------------------------------------
    def at_depth(self, z: float, side: str = "above"):
        """Amplitudes (réduites) à la profondeur z pour charges unitaires.

        Renvoie un dict :
          'n'  : (U, W, dU, dW) pour une pression normale unitaire (p = 1 Pa, vers le bas) ;
          't'  : (U, W, dU, dW) pour T(0) = 1 (P-SV tangentiel) si tangential ;
          'sh' : (V, dV) pour R(0) = 1 si tangential ;
          'lam', 'mu' : modules de la couche ; 'mu_ref'.
        Les grandeurs sont « réduites » : déplacement physique = valeur / (mu_ref xi),
        dérivée d/dz physique = valeur / mu_ref.
        """
        j, s = self.st.locate(z, side)
        last_half = self.half and j == self.st.n - 1
        U, W, dU, dW = _psv_basis(self.xi, s, self.h[j], self.kappa[j], last_half)
        cj = slice(self.off[j], self.off[j + 1])
        X = self.X[:, cj, :]
        out = {
            "n": tuple(np.einsum("mc,mc->m", B, X[:, :, 0]) for B in (U, W, dU, dW)),
            "lam": self.lam[j],
            "mu": self.mu[j],
            "mu_ref": self.mu_ref,
            "layer": j,
        }
        if self.tangential:
            out["t"] = tuple(np.einsum("mc,mc->m", B, X[:, :, 1]) for B in (U, W, dU, dW))
            V, dV = _sh_basis(self.xi, s, self.h[j], last_half)
            cs = slice(self.off_sh[j], self.off_sh[j + 1])
            Xs = self.Xsh[:, cs, 0]
            out["sh"] = (np.einsum("mc,mc->m", V, Xs), np.einsum("mc,mc->m", dV, Xs))
        return out


# ========================================================================================
# Solveur par matrices de rigidité de couche (méthode par défaut)
# ========================================================================================
def _mm(A, B):
    """Produit de petites matrices empilées (M, p, q) x (M, q, r) par opérations élément par
    élément (bien plus rapide que matmul pour des blocs 2x2 ou 4x4)."""
    out = A[:, :, 0, None] * B[:, None, 0, :]
    for k in range(1, A.shape[2]):
        out = out + A[:, :, k, None] * B[:, None, k, :]
    return out


def _inv2(A):
    """Inverse de matrices 2x2 empilées (M, 2, 2)."""
    a, b, c, d = A[:, 0, 0], A[:, 0, 1], A[:, 1, 0], A[:, 1, 1]
    det = a * d - b * c
    out = np.empty_like(A)
    out[:, 0, 0] = d / det
    out[:, 0, 1] = -b / det
    out[:, 1, 0] = -c / det
    out[:, 1, 1] = a / det
    return out


def _inv4_blocks(D):
    """Inverse de matrices 4x4 empilées par blocs 2x2 (complément de Schur) : D = [[P, Q], [R, S]].
    P (base descendante au toit) et S (base montante à la base) sont toujours inversibles
    (det = -kappa et kappa)."""
    P, Q, R, S = D[:, :2, :2], D[:, :2, 2:], D[:, 2:, :2], D[:, 2:, 2:]
    Pi = _inv2(P)
    Sc = S - _mm(_mm(R, Pi), Q)
    Sci = _inv2(Sc)
    out = np.empty_like(D)
    PiQ = _mm(Pi, Q)
    RPi = _mm(R, Pi)
    out[:, :2, :2] = Pi + _mm(_mm(PiQ, Sci), RPi)
    out[:, :2, 2:] = -_mm(PiQ, Sci)
    out[:, 2:, :2] = -_mm(Sci, RPi)
    out[:, 2:, 2:] = Sci
    return out


class StiffnessKernel(DenseKernel):
    """Même problème que DenseKernel, résolu par assemblage des matrices de rigidité de couche.

    Pour chaque couche finie, la relation contraintes-déplacements des deux faces s'écrit
    [T_t, S_t, T_b, S_b] = K_j [U_t, W_t, U_b, W_b], avec K_j = Q_j D_j^-1 construite à partir
    de la base stable (exponentielles décroissantes). L'équilibre des faces conduit à un système
    tridiagonal par blocs 2x2 (un bloc par face), résolu par l'algorithme de Thomas vectorisé.
    Interfaces glissantes : condensation statique du déplacement horizontal de la face (T = 0),
    remplacé par une inconnue muette.
    """

    def __init__(self, structure: Structure, xi, lam, mu, tangential: bool = False):
        self.st = structure
        self.xi = np.asarray(xi, float)
        if np.any(self.xi <= 0):
            raise ValueError("xi doit être strictement positif (le mode xi = 0 est traité à part).")
        M = self.xi.size
        self.lam = [np.broadcast_to(np.asarray(l, complex), (M,)) for l in lam]
        self.mu = [np.broadcast_to(np.asarray(m, complex), (M,)) for m in mu]
        self.kappa = [(l + 3 * m) / (l + m) for l, m in zip(self.lam, self.mu)]
        self.mu_ref = np.abs(self.mu[0])
        self.h = structure.thicknesses
        self.half = structure.bottom == "halfspace"
        self.tangential = tangential
        self._solve_psv_stiff()
        if tangential:
            self._solve_sh_stiff()

    # ------------------------------------------------------------------------------------
    def _slip_faces(self, j):
        """Faces (0 = toit, 1 = base) de la couche j bordées par une interface glissante."""
        n = self.st.n
        top = j > 0 and self.st.interfaces[j - 1] == "slip"
        bot = j < n - 1 and self.st.interfaces[j] == "slip"
        return top, bot

    def _layer_DQ(self, j):
        """Matrices D (déplacements) et Q (contraintes) des faces de la couche j."""
        U0, W0, _, _, T0, S0 = self._layer_quantities(j, 0.0)
        last_half = self.half and j == self.st.n - 1
        if last_half:
            D = np.stack([U0, W0], 1)
            Q = np.stack([T0, S0], 1)
            return D, Q
        Uh, Wh, _, _, Th, Sh = self._layer_quantities(j, self.h[j])
        D = np.stack([U0, W0, Uh, Wh], 1)
        Q = np.stack([T0, S0, Th, Sh], 1)
        return D, Q

    def _solve_psv_stiff(self):
        st = self.st
        n = st.n
        M = self.xi.size
        nf = n if self.half else n + 1          # nombre de faces portant des inconnues
        A = np.zeros((nf, M, 2, 2), complex)    # blocs diagonaux
        B = np.zeros((nf, M, 2, 2), complex)    # blocs (f, f+1)
        C = np.zeros((nf, M, 2, 2), complex)    # blocs (f+1, f)
        self._cond = {}
        for j in range(n):
            D, Q = self._layer_DQ(j)
            if self.half and j == n - 1:
                Kt = -_mm(Q, _inv2(D))
                top, _ = self._slip_faces(j)
                if top:  # condensation de U_t (T_t = 0)
                    G = -Kt[:, 0:1, 1:2] / Kt[:, 0:1, 0:1]
                    self._cond[j] = ("hs", G)
                    Kt = Kt.copy()
                    Kt[:, 1, 1] = Kt[:, 1, 1] - Kt[:, 1, 0] * Kt[:, 0, 1] / Kt[:, 0, 0]
                    Kt[:, 0, :] = 0
                    Kt[:, :, 0] = 0
                A[j] += Kt
                continue
            K = _mm(Q, _inv4_blocks(D))
            Kt = K * np.array([-1, -1, 1, 1])[None, :, None]
            top, bot = self._slip_faces(j)
            cidx = [i for i, flag in ((0, top), (2, bot)) if flag]
            if cidx:
                ridx = [i for i in range(4) if i not in cidx]
                Kcc = Kt[:, cidx][:, :, cidx]
                Kcr = Kt[:, cidx][:, :, ridx]
                Krc = Kt[:, ridx][:, :, cidx]
                Krr = Kt[:, ridx][:, :, ridx]
                G = -np.linalg.solve(Kcc, Kcr)               # u_c = G u_r
                Kred = Krr + _mm(Krc, G)
                Kt = np.zeros_like(Kt)
                Kt[np.ix_(np.arange(M), ridx, ridx)] = Kred
                self._cond[j] = (cidx, ridx, G)
            A[j] += Kt[:, 0:2, 0:2]
            B[j] += Kt[:, 0:2, 2:4]
            C[j] += Kt[:, 2:4, 0:2]
            A[j + 1] += Kt[:, 2:4, 2:4]
        # inconnues muettes (U aux interfaces glissantes)
        for i, c in enumerate(st.interfaces):
            if c == "slip":
                A[i + 1][:, 0, 0] += 1.0
        # fond rigide
        fixed = []
        if st.bottom == "rigid_bonded":
            fixed = [(n, 0), (n, 1)]
        elif st.bottom == "rigid_smooth":
            fixed = [(n, 1)]
        for f, d in fixed:
            A[f][:, d, :] = 0
            A[f][:, :, d] = 0
            A[f][:, d, d] = 1
            C[f - 1][:, d, :] = 0
            B[f - 1][:, :, d] = 0
        # second membre : traction de surface = -(T, S)
        nr = 2 if self.tangential else 1
        F = np.zeros((nf, M, 2, nr), complex)
        F[0][:, 1, 0] = 1.0            # S(0) = -1  (pression unitaire)
        if self.tangential:
            F[0][:, 0, 1] = -1.0       # T(0) = +1
        # Thomas par blocs
        Ah = [None] * nf
        Fh = [None] * nf
        Ah[0] = A[0]
        Fh[0] = F[0]
        for f in range(1, nf):
            L = _mm(C[f - 1], _inv2(Ah[f - 1]))
            Ah[f] = A[f] - _mm(L, B[f - 1])
            Fh[f] = F[f] - _mm(L, Fh[f - 1])
        d = [None] * nf
        d[nf - 1] = _mm(_inv2(Ah[nf - 1]), Fh[nf - 1])
        for f in range(nf - 2, -1, -1):
            d[f] = _mm(_inv2(Ah[f]), Fh[f] - _mm(B[f], d[f + 1]))
        self.face_disp = d          # liste (M, 2, nr) : (U, W) réduits par face

    def _layer_face_values(self, j):
        """Déplacements réels (U_t, W_t[, U_b, W_b]) de la couche j : (M, 4 ou 2, nr)."""
        top = self.face_disp[j]
        if self.half and j == self.st.n - 1:
            u = top.copy()
            if j in self._cond:
                G = self._cond[j][1]
                u[:, 0:1, :] = _mm(G, u[:, 1:2, :])
            return u
        bot = self.face_disp[j + 1]
        u = np.concatenate([top, bot], 1)
        if j in self._cond:
            cidx, ridx, G = self._cond[j]
            u[:, cidx, :] = _mm(G, u[:, ridx, :])
        return u

    def _coefficients(self, j):
        D, _ = self._layer_DQ(j)
        Di = _inv2(D) if D.shape[1] == 2 else _inv4_blocks(D)
        return _mm(Di, self._layer_face_values(j))

    # ------------------------------------------------------------------------------------
    def _solve_sh_stiff(self):
        st = self.st
        n = st.n
        M = self.xi.size
        nf = n if self.half else n + 1
        a = np.zeros((nf, M), complex)
        b = np.zeros((nf, M), complex)
        c = np.zeros((nf, M), complex)
        self._cond_sh = {}

        def VR(j, s):
            last_half = self.half and j == n - 1
            V, dV = _sh_basis(self.xi, s, self.h[j], last_half)
            return V, self.mu[j][:, None] / self.mu_ref[:, None] * dV

        for j in range(n):
            last_half = self.half and j == n - 1
            top, bot = self._slip_faces(j)
            V0, R0 = VR(j, 0.0)
            if last_half:
                kt = -R0[:, 0] / V0[:, 0]
                if top:
                    kt = np.zeros(M, complex)
                a[j] += kt
                continue
            Vh, Rh = VR(j, self.h[j])
            D = np.stack([V0, Vh], 1)
            Q = np.stack([R0, Rh], 1)
            K = _mm(Q, _inv2(D))
            Kt = K * np.array([-1, 1])[None, :, None]
            if top and bot:
                Kt = np.zeros_like(Kt)
            elif top:   # face du toit libre : condensation
                Kt2 = np.zeros_like(Kt)
                Kt2[:, 1, 1] = Kt[:, 1, 1] - Kt[:, 1, 0] * Kt[:, 0, 1] / Kt[:, 0, 0]
                self._cond_sh[j] = ("top", -Kt[:, 0, 1] / Kt[:, 0, 0])
                Kt = Kt2
            elif bot:
                Kt2 = np.zeros_like(Kt)
                Kt2[:, 0, 0] = Kt[:, 0, 0] - Kt[:, 0, 1] * Kt[:, 1, 0] / Kt[:, 1, 1]
                self._cond_sh[j] = ("bot", -Kt[:, 1, 0] / Kt[:, 1, 1])
                Kt = Kt2
            if top and bot:
                self._cond_sh[j] = ("both", None)
            a[j] += Kt[:, 0, 0]
            b[j] += Kt[:, 0, 1]
            c[j] += Kt[:, 1, 0]
            a[j + 1] += Kt[:, 1, 1]
        for i, cc in enumerate(st.interfaces):
            if cc == "slip":
                a[i + 1] += 1.0
        if st.bottom == "rigid_bonded":
            a[n] = 1.0
            c[n - 1] = 0.0
            b[n - 1] = 0.0
        F = np.zeros((nf, M), complex)
        F[0] = -1.0                     # R(0) = +1
        ah = [None] * nf
        fh = [None] * nf
        ah[0], fh[0] = a[0], F[0]
        for f in range(1, nf):
            L = c[f - 1] / ah[f - 1]
            ah[f] = a[f] - L * b[f - 1]
            fh[f] = F[f] - L * fh[f - 1]
        d = [None] * nf
        d[-1] = fh[-1] / ah[-1]
        for f in range(nf - 2, -1, -1):
            d[f] = (fh[f] - b[f] * d[f + 1]) / ah[f]
        self.face_disp_sh = d

    def _coefficients_sh(self, j):
        n = self.st.n
        last_half = self.half and j == n - 1
        V0, _ = _sh_basis(self.xi, 0.0, self.h[j], last_half)
        top = self.face_disp_sh[j]
        if last_half:
            return (top / V0[:, 0])[:, None]
        Vh, _ = _sh_basis(self.xi, self.h[j], self.h[j], last_half)
        bot = self.face_disp_sh[j + 1]
        if j in self._cond_sh:
            kind, g = self._cond_sh[j]
            if kind == "both":
                # couche entre deux interfaces glissantes : aucun effort SH ne la traverse
                return np.zeros((self.xi.size, 2), complex)
            if kind == "top":
                top = g * bot
            else:
                bot = g * top
        D = np.stack([V0, Vh], 1)
        return _mm(_inv2(D), np.stack([top, bot], 1)[:, :, None])[:, :, 0]

    # ------------------------------------------------------------------------------------
    def at_depth(self, z: float, side: str = "above"):
        j, s = self.st.locate(z, side)
        last_half = self.half and j == self.st.n - 1
        U, W, dU, dW = _psv_basis(self.xi, s, self.h[j], self.kappa[j], last_half)
        X = self._coefficients(j)
        out = {
            "n": tuple(np.einsum("mc,mc->m", Bb, X[:, :, 0]) for Bb in (U, W, dU, dW)),
            "lam": self.lam[j], "mu": self.mu[j], "mu_ref": self.mu_ref, "layer": j,
        }
        if self.tangential:
            out["t"] = tuple(np.einsum("mc,mc->m", Bb, X[:, :, 1]) for Bb in (U, W, dU, dW))
            V, dV = _sh_basis(self.xi, s, self.h[j], last_half)
            Xs = self._coefficients_sh(j)
            out["sh"] = (np.einsum("mc,mc->m", V, Xs), np.einsum("mc,mc->m", dV, Xs))
        return out


LayeredKernel = StiffnessKernel
