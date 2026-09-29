import argparse

from .io import run_case


def main():
    ap = argparse.ArgumentParser(prog="python -m chausspec",
                                 description="Calcul semi-analytique spectral d'une chaussée multicouche.")
    ap.add_argument("cas", help="fichier JSON décrivant le cas (structure, chargement, régime, grille, sorties)")
    ap.add_argument("--sans-figures", action="store_true", help="ne pas produire les PNG")
    a = ap.parse_args()
    run_case(a.cas, plot=not a.sans_figures)


if __name__ == "__main__":
    main()
