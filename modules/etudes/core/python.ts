/**
 * Les deux fichiers Python posés dans une nouvelle étude. `these_etude.py` n'a aucune
 * dépendance : il résout les références de données avec les racines du poste (lues dans
 * les réglages de l'application) et écrit, à chaque exécution, un dossier de sorties
 * horodaté avec `execution.json` — la trace que l'application affiche.
 */

export const OUTIL = `"""Outil des études de l'application Thèse (écrit par l'application, ne pas modifier).

    from these_etude import Etude
    etude = Etude(__file__)
    chemin = etude.donnees("recherche:Sergio CM test Bio B2C4 brutes/Essai1")
    figure = etude.sortie("deroulement.png")   # chemin où écrire un fichier produit

Chaque exécution écrit sorties/<horodatage>/ et execution.json : date, poste, version de
Python, données lues, fichiers produits, succès ou erreur.
"""
import atexit
import datetime as _dt
import json
import os
import platform
import socket
import sys
import traceback
from pathlib import Path

_IDENTIFIANTS = ("fr.lucasdavid.these",)


def _racines():
    base = Path(os.environ.get("APPDATA") or Path.home() / ".config")
    for ident in _IDENTIFIANTS:
        fichier = base / ident / "poste.json"
        if fichier.exists():
            return json.loads(fichier.read_text(encoding="utf-8")).get("racines", {})
    return {}


class Etude:
    def __init__(self, fichier):
        self.dossier = Path(fichier).resolve().parent
        self.debut = _dt.datetime.now()
        self.sorties = self.dossier / "sorties" / self.debut.strftime("%Y-%m-%d_%H-%M-%S")
        self.sorties.mkdir(parents=True, exist_ok=True)
        self.entrees = []
        self._erreur = ""
        self._crochet = sys.excepthook
        sys.excepthook = self._exception
        atexit.register(self._terminer)
        self._ecrire("en cours")

    def donnees(self, reference):
        """« racine:chemin » → chemin sur ce poste (racines des réglages de Thèse)."""
        racine, _, relatif = reference.partition(":")
        racines = _racines()
        if racine not in racines:
            raise KeyError(f"Racine « {racine} » non déclarée sur ce poste (Thèse → Réglages du poste).")
        chemin = Path(racines[racine]) / relatif
        self.entrees.append({"reference": reference, "chemin": str(chemin)})
        return chemin

    def sortie(self, nom):
        """Chemin d'un fichier produit, dans le dossier de cette exécution."""
        chemin = self.sorties / nom
        chemin.parent.mkdir(parents=True, exist_ok=True)
        return chemin

    def _exception(self, type_, valeur, trace):
        self._erreur = "".join(traceback.format_exception(type_, valeur, trace))[-4000:]
        self._crochet(type_, valeur, trace)

    def _ecrire(self, statut):
        fin = _dt.datetime.now()
        fichiers = [
            {"nom": p.relative_to(self.sorties).as_posix(), "octets": p.stat().st_size}
            for p in sorted(self.sorties.rglob("*"))
            if p.is_file() and p.name != "execution.json"
        ]
        trace = {
            "debut": self.debut.isoformat(timespec="seconds"),
            "fin": fin.isoformat(timespec="seconds"),
            "duree_s": round((fin - self.debut).total_seconds(), 1),
            "poste": socket.gethostname(),
            "python": platform.python_version(),
            "script": sys.argv[0],
            "statut": statut,
            "erreur": self._erreur,
            "entrees": self.entrees,
            "fichiers": fichiers,
        }
        (self.sorties / "execution.json").write_text(json.dumps(trace, ensure_ascii=False, indent=2), encoding="utf-8")

    def _terminer(self):
        self._ecrire("erreur" if self._erreur else "ok")
`;

export function script(titre: string, question: string): string {
  return `"""${titre.replace(/"""/g, "")}

${question.trim() || "Question à laquelle cette étude répond."}
"""
from these_etude import Etude

etude = Etude(__file__)

# Données : références « racine:chemin », résolues avec les racines de ce poste.
# essai = etude.donnees("recherche:Sergio CM test Bio B2C4 brutes/Essai1")

# Fichiers produits : toujours via etude.sortie(...), pour qu'ils soient tracés.
with open(etude.sortie("resultat.txt"), "w", encoding="utf-8") as f:
    f.write("Remplacez ce script par votre analyse.\\n")

print("Sorties :", etude.sorties)
`;
}
