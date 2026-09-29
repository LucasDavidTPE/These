"""Éléments finis 2D « pixel » en déformation plane généralisée, pour les modèles locaux de la
couche de surface (niveau 2 du module texture) :

  * T11 — entaille géométrique des rainures (hypothèse H6 du niveau 1) ;
  * T12 — hétérogénéité granulats / mortier bitumineux (hypothèse H7).

Cellule rectangulaire de largeur W (périodique en x) et de hauteur H (z vers le bas), maillée en
carrés de côté h (éléments Q4 bilinéaires, intégration de Gauss 2 x 2). Chaque pixel porte un
matériau isotrope (E, nu) ; E = 0 désigne un vide (rainure). Déplacement cherché :

    u = eps* . x + u_c ,   u_c périodique en x, u_c = 0 au fond (z = H),

où eps* est une déformation macroscopique uniforme imposée (exx0 dans le plan, eyy0 hors plan :
déformation plane généralisée). Charges : efforts de surface réels (pression p et frottement q sur
les faces supérieures libres). La déformation macroscopique entre dans le système par la
précontrainte  -int B^T C:eps*  (formulation « totale » : les faces des vides sont libres).

Option periodic_z : cellule périodique dans les deux directions (homogénéisation, T12) ; un nœud
est bloqué pour supprimer la translation.
"""
from __future__ import annotations

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
from scipy.ndimage import uniform_filter

_G = np.array([-1.0, 1.0]) / np.sqrt(3.0)


def _dN(xi, eta):
    """Dérivées des fonctions de forme sur le carré de référence (nœuds 0:(0,0) 1:(h,0) 2:(h,h) 3:(0,h))."""
    dxi = np.array([-(1 - eta), (1 - eta), (1 + eta), -(1 + eta)]) / 4
    deta = np.array([-(1 - xi), -(1 + xi), (1 + xi), (1 - xi)]) / 4
    return dxi, deta


def _B(xi, eta, h):
    dxi, deta = _dN(xi, eta)
    dx, dz = dxi * 2 / h, deta * 2 / h
    B = np.zeros((3, 8))
    B[0, 0::2] = dx
    B[1, 1::2] = dz
    B[2, 0::2] = dz
    B[2, 1::2] = dx
    return B


def plane_strain_D(E, nu):
    lam = E * nu / ((1 + nu) * (1 - 2 * nu))
    mu = E / (2 * (1 + nu))
    return np.array([[lam + 2 * mu, lam, 0], [lam, lam + 2 * mu, 0], [0, 0, mu]]), lam


class PixelCell:
    def __init__(self, E, nu, h, periodic_z=False):
        E = np.asarray(E, float)
        self.nz, self.nx = E.shape
        self.h = h
        self.E = E
        self.nu = np.broadcast_to(np.asarray(nu, float), E.shape).copy()
        self.periodic_z = periodic_z
        self.solid = E > 0
        nzn = self.nz if periodic_z else self.nz + 1
        self.nzn = nzn
        iz, ix = np.meshgrid(np.arange(self.nz), np.arange(self.nx), indexing="ij")
        n0 = iz * self.nx + ix
        n1 = iz * self.nx + (ix + 1) % self.nx
        izp = (iz + 1) % nzn
        n2 = izp * self.nx + (ix + 1) % self.nx
        n3 = izp * self.nx + ix
        self.conn = np.stack([n0, n1, n2, n3], -1).reshape(-1, 4)
        self.nnodes = nzn * self.nx
        # matrices élémentaires de référence (E = 1) par valeur de nu
        self.Bc = _B(0.0, 0.0, h)
        self.Bint = sum(_B(a, b, h) for a in _G for b in _G) * (h * h / 4)   # int B dA
        self._Ke = {}
        self._assemble()

    def _Kref(self, nu):
        if nu not in self._Ke:
            D, _ = plane_strain_D(1.0, nu)
            K = np.zeros((8, 8))
            for a in _G:
                for b in _G:
                    B = _B(a, b, self.h)
                    K += B.T @ D @ B * (self.h * self.h / 4)
            self._Ke[nu] = K
        return self._Ke[nu]

    def _edofs(self):
        c = self.conn
        return np.stack([2 * c, 2 * c + 1], -1).reshape(-1, 8)

    def _assemble(self):
        ed = self._edofs()
        Ev = self.E.ravel()
        nuv = self.nu.ravel()
        keep = Ev > 0
        rows, cols, vals = [], [], []
        for nu in np.unique(nuv[keep]):
            sel = keep & (nuv == nu)
            K = self._Kref(float(nu))
            e = ed[sel]
            rows.append(np.repeat(e, 8, axis=1).ravel())
            cols.append(np.tile(e, (1, 8)).ravel())
            vals.append((Ev[sel][:, None, None] * K[None]).ravel())
        ndof = 2 * self.nnodes
        K = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(ndof, ndof))
        # ddl actifs : nœuds touchant un élément solide, hors fond encastré
        touched = np.zeros(self.nnodes, bool)
        touched[self.conn[keep].ravel()] = True
        if not self.periodic_z:
            touched[self.nz * self.nx:] = False
        else:
            first = np.flatnonzero(touched)[0]
            touched[first] = False       # blocage de la translation
        self.free = np.flatnonzero(np.repeat(touched, 2))
        self.K = K
        self._solve = spla.factorized(K[self.free][:, self.free].tocsc())

    # ------------------------------------------------------------------------------------
    def load_vector(self, eps_in=(0.0, 0.0, 0.0), eyy0=0.0, top_p=None, top_q=None, load_depth=0.0):
        """Second membre. eps_in = (exx, ezz, gamma_xz) macroscopiques imposés ; eyy0 hors plan.
        top_p, top_q : pression et frottement (Pa) par colonne (nx,) appliqués sur la face
        supérieure de l'élément solide le plus haut de chaque colonne (surface de roulement). Les
        colonnes dont le premier solide est plus profond que load_depth ne sont pas chargées (fond
        de rainure, non touché par le pneu)."""
        f = np.zeros(2 * self.nnodes)
        ed = self._edofs()
        Ev, nuv = self.E.ravel(), self.nu.ravel()
        eps_in = np.asarray(eps_in, float)
        if np.any(eps_in) or eyy0:
            for nu in np.unique(nuv[Ev > 0]):
                sel = (Ev > 0) & (nuv == nu)
                D, lam = plane_strain_D(1.0, float(nu))
                s = D @ eps_in + lam * eyy0 * np.array([1.0, 1.0, 0.0])      # contrainte pour E = 1
                fe = -(self.Bint.T @ s)
                np.add.at(f, ed[sel].ravel(), (Ev[sel][:, None] * fe[None]).ravel())
        if top_p is not None or top_q is not None:
            p = np.zeros(self.nx) if top_p is None else np.asarray(top_p, float)
            q = np.zeros(self.nx) if top_q is None else np.asarray(top_q, float)
            first = np.argmax(self.solid, axis=0)
            loaded = first * self.h <= load_depth + 1e-12
            ix = np.flatnonzero(loaded)
            nL = first[ix] * self.nx + ix             # nœuds de la face supérieure du premier solide
            nR = first[ix] * self.nx + (ix + 1) % self.nx
            for nodes in (nL, nR):
                np.add.at(f, 2 * nodes, q[ix] * self.h / 2)
                np.add.at(f, 2 * nodes + 1, p[ix] * self.h / 2)
        return f

    def solve(self, f):
        u = np.zeros(2 * self.nnodes)
        u[self.free] = self._solve(f[self.free])
        return u

    def strains(self, u, eps_in=(0.0, 0.0, 0.0)):
        """Déformations au centre des éléments : dict exx, ezz, exz (tensorielle), tableaux (nz, nx)."""
        ue = u[self._edofs()]
        e = ue @ self.Bc.T + np.asarray(eps_in, float)[None]
        sh = (self.nz, self.nx)
        return dict(exx=e[:, 0].reshape(sh), ezz=e[:, 1].reshape(sh), exz=0.5 * e[:, 2].reshape(sh))

    def mean_stress(self, u, eps_in, eyy0=0.0):
        """Contrainte moyenne sur la cellule (vides compris, valeur nulle) : (sxx, szz, sxz)."""
        ue = u[self._edofs()]
        e = ue @ self.Bc.T + np.asarray(eps_in, float)[None]
        s = np.zeros_like(e)
        Ev, nuv = self.E.ravel(), self.nu.ravel()
        for nu in np.unique(nuv[Ev > 0]):
            sel = (Ev > 0) & (nuv == nu)
            D, lam = plane_strain_D(1.0, float(nu))
            s[sel] = Ev[sel][:, None] * (e[sel] @ D.T + lam * eyy0 * np.array([1.0, 1.0, 0.0]))
        return s.mean(0)


def principal_max(exx, eyy, ezz, exy, exz, eyz):
    """Déformation principale majeure (tableaux de même forme)."""
    T = np.stack([np.stack([exx, exy, exz], -1), np.stack([exy, eyy, eyz], -1),
                  np.stack([exz, eyz, ezz], -1)], -2)
    return np.linalg.eigvalsh(T)[..., 2]


def box_average(field, mask, n):
    """Moyenne glissante de côté n pixels sur les seuls pixels de mask (périodique en x)."""
    if n <= 1:
        return np.where(mask, field, np.nan)
    num = uniform_filter(np.where(mask, field, 0.0), size=n, mode=("nearest", "wrap"))
    den = uniform_filter(mask.astype(float), size=n, mode=("nearest", "wrap"))
    return np.where(mask & (den > 0), num / np.maximum(den, 1e-12), np.nan)
