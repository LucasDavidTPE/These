"""chausspec — calcul semi-analytique spectral de chaussées multicouches (visco)élastiques
sous chargements de surface quelconques (empreintes hétérogènes, charges roulantes, HWD).

Auteur : Lucas DAVID (LTDS / ENTPE — thèse STAC), 2026.
"""
from .materials import (Elastic, TwoS2P1D, GeneralizedKelvinVoigt, GeneralizedMaxwell,
                        FrozenModulus, MPA)
from .structure import Layer, Structure
from .loads import (UniformRect, UniformCircle, Separable, PressureMap, Scaled, Box1D,
                    HalfEllipse1D, GaussianPairs1D, Tabulated1D, Wheel, Loading)
from .regimes import Static, Harmonic, Moving
from .grid import solve_grid, GridResult
from .axisym import solve_axisym

__version__ = "0.4.0"
