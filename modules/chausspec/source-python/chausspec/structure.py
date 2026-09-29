"""Description de la structure multicouche."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Sequence

import numpy as np

from .materials import Material

BOTTOMS = ("halfspace", "rigid_bonded", "rigid_smooth")
INTERFACES = ("bonded", "slip")


@dataclass
class Layer:
    """Couche horizontale. thickness en m (np.inf pour le massif semi-infini de fond)."""

    material: Material
    thickness: float
    name: str = ""


@dataclass
class Structure:
    """Empilement de couches, de la surface (z = 0) vers le bas (z > 0).

    bottom :
      - "halfspace"     : la dernière couche est semi-infinie (épaisseur ignorée) ;
      - "rigid_bonded"  : la dernière couche repose sur un substratum rigide collé (u = 0) ;
      - "rigid_smooth"  : substratum rigide glissant (u_z = 0, cisaillement nul) — c'est la
                          condition « déplacement vertical bloqué » du modèle COMSOL du TFE.
    interfaces : liste de len(layers)-1 éléments "bonded" (collée) ou "slip" (glissante).
    """

    layers: List[Layer]
    bottom: str = "halfspace"
    interfaces: Optional[Sequence[str]] = None

    def __post_init__(self):
        if self.bottom not in BOTTOMS:
            raise ValueError(f"bottom doit être dans {BOTTOMS}")
        n = len(self.layers)
        if self.interfaces is None:
            self.interfaces = ["bonded"] * (n - 1)
        if len(self.interfaces) != n - 1:
            raise ValueError("Il faut len(layers)-1 conditions d'interface.")
        for c in self.interfaces:
            if c not in INTERFACES:
                raise ValueError(f"interface inconnue : {c}")
        for i, L in enumerate(self.layers):
            last = i == n - 1
            if not (last and self.bottom == "halfspace"):
                if not np.isfinite(L.thickness) or L.thickness <= 0:
                    raise ValueError(f"Épaisseur invalide pour la couche {i} ({L.name}).")

    # ------------------------------------------------------------------------------
    @property
    def n(self) -> int:
        return len(self.layers)

    @property
    def thicknesses(self) -> np.ndarray:
        h = np.array([L.thickness for L in self.layers], float)
        if self.bottom == "halfspace":
            h[-1] = np.inf
        return h

    @property
    def tops(self) -> np.ndarray:
        """Cote du toit de chaque couche."""
        h = self.thicknesses
        return np.concatenate([[0.0], np.cumsum(h[:-1])])

    def locate(self, z: float, side: str = "above"):
        """Renvoie (indice de couche, cote locale s) pour la profondeur z.

        Si z tombe exactement sur une interface, side="above" choisit la couche du dessus
        (utile pour la « base de couche liée »), side="below" celle du dessous.
        """
        tops = self.tops
        h = self.thicknesses
        bots = tops + h
        if z < 0:
            raise ValueError("z doit être >= 0 (axe z vers le bas).")
        tol = 1e-12
        for j in range(self.n):
            if side == "above":
                if tops[j] - tol <= z <= bots[j] + tol:
                    return j, min(max(z - tops[j], 0.0), h[j])
            else:
                if tops[j] - tol <= z < bots[j] - tol or (j == self.n - 1 and z <= bots[j] + tol):
                    return j, max(z - tops[j], 0.0)
        raise ValueError(f"z = {z} m est sous le fond de la structure.")

    def describe(self) -> str:
        lines = []
        z = 0.0
        for i, L in enumerate(self.layers):
            h = L.thickness if not (i == self.n - 1 and self.bottom == "halfspace") else np.inf
            lines.append(f"  [{i}] {L.name or '-':<14s} h = {h:>6} m  loi = {L.material.name}")
            if i < self.n - 1:
                lines.append(f"      interface : {self.interfaces[i]}")
        lines.append(f"  fond : {self.bottom}")
        return "\n".join(lines)
