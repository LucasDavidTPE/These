"""these_figures — tracés Python branchés sur Figures (application Thèse).

Copié par l'application dans le dossier scripts/ de chaque projet de figures ; ne pas le
modifier (il est remplacé quand l'application en apporte une version plus récente).

    import these_figures as tf

    g = tf.Graphe(x="Fréquence (Hz)", y="|E*| (MPa)", log_x=True, log_y=True)
    g.serie("15 °C", f, e, type="points")
    g.enregistrer("module", titre="Module complexe")   # graphe modifiable dans Figures

    fig, ax = plt.subplots()
    ax.plot(x, y, "o-", label="Mesure")
    tf.depuis_matplotlib(fig, "fatigue")                # idem, repris d'une figure matplotlib
    plt.savefig(tf.sortie("fatigue.png"), dpi=300)      # image, ajoutée telle quelle

Les sorties vont dans le dossier donné par l'application (variable THESE_SORTIES) ; lancé
à la main, dans ../sorties/<nom du script>/ à côté du dossier scripts/. Python 3.8+, sans
dépendance (numpy et matplotlib sont reconnus s'ils sont là).
"""

import json
import math
import os
import sys
from pathlib import Path

__version__ = "1"

FORMAT = "these-figures-sortie/1"
GRAPH_FORMAT = "figurine-graph/1"
TYPES = ("line", "points", "linepoints", "bar")
LEGENDES = ("north east", "north west", "south east", "south west", "none")
TENDANCES = ("lineaire", "origine", "polynome", "puissance", "exponentielle", "logarithmique")
MARQUES = ("o", "square", "triangle", "diamond", "x", "+", "none")
TIRETS = ("solid", "dashed", "dotted")


def dossier_sorties():
    """Dossier des sorties de ce script (créé au besoin)."""
    d = os.environ.get("THESE_SORTIES")
    if d:
        p = Path(d)
    else:
        script = Path(sys.argv[0] if sys.argv and sys.argv[0] else "script").resolve()
        p = script.parent.parent / "sorties" / script.stem
    p.mkdir(parents=True, exist_ok=True)
    return p


def sortie(nom):
    """Chemin d'un fichier de sortie (image pour plt.savefig…), dans le dossier des sorties."""
    return str(dossier_sorties() / nom)


def _liste(v):
    if v is None:
        return []
    if hasattr(v, "tolist"):  # numpy, pandas
        v = v.tolist()
    return [_nombre(x) for x in v]


def _nombre(x):
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _couleur(c):
    if c is None:
        return None
    if isinstance(c, str) and len(c) == 7 and c.startswith("#"):
        return c.lower()
    try:
        from matplotlib.colors import to_hex  # type: ignore

        return to_hex(c).lower()
    except Exception:
        return None


class Graphe:
    """Un graphe de Figures : axes, légende, séries. Taille en mm."""

    def __init__(self, x="", y="", log_x=False, log_y=False, largeur=120, hauteur=80, legende="north east", grille=False,
                 x_min=None, x_max=None, y_min=None, y_max=None):
        if legende not in LEGENDES:
            raise ValueError("legende : " + ", ".join(LEGENDES))
        self.axes = {
            "x": {"label": str(x), "log": bool(log_x)},
            "y": {"label": str(y), "log": bool(log_y)},
        }
        for axe, bornes in (("x", (x_min, x_max)), ("y", (y_min, y_max))):
            for cle, v in zip(("min", "max"), bornes):
                if v is not None:
                    self.axes[axe][cle] = float(v)
        self.largeur = float(largeur)
        self.hauteur = float(hauteur)
        self.legende = legende
        self.grille = bool(grille)
        self.series = []
        self.categories = None

    def serie(self, nom, x, y, type="linepoints", couleur=None, marque=None, tirets=None, tendance=None, legende=True):
        """Ajoute une série ; les points dont x ou y n'est pas un nombre fini sont ignorés."""
        if type not in TYPES:
            raise ValueError("type : " + ", ".join(TYPES))
        xs, ys = _liste(x), _liste(y)
        if len(xs) != len(ys):
            raise ValueError("« %s » : x et y n'ont pas la même longueur (%d, %d)" % (nom, len(xs), len(ys)))
        points = [(a, b) for a, b in zip(xs, ys) if a is not None and b is not None]
        s = {"name": str(nom), "type": type, "x": [a for a, _ in points], "y": [b for _, b in points], "legend": bool(legende)}
        c = _couleur(couleur)
        if c:
            s["color"] = c
        if marque is not None:
            if marque not in MARQUES:
                raise ValueError("marque : " + ", ".join(MARQUES))
            s["mark"] = marque
        if tirets is not None:
            if tirets not in TIRETS:
                raise ValueError("tirets : " + ", ".join(TIRETS))
            s["dash"] = tirets
        if tendance is not None:
            degre = None
            if isinstance(tendance, tuple):
                tendance, degre = tendance
            if tendance not in TENDANCES:
                raise ValueError("tendance : " + ", ".join(TENDANCES))
            s["fit"] = {"kind": tendance, "label": True}
            if tendance == "polynome":
                s["fit"]["degre"] = int(degre or 2)
        self.series.append(s)
        return self

    def barres(self, categories, valeurs, nom="", couleur=None):
        """Diagramme en barres sur des catégories (noms sous l'axe x)."""
        self.categories = [str(c) for c in categories]
        return self.serie(nom or "Série %d" % (len(self.series) + 1), list(range(1, len(self.categories) + 1)), valeurs, type="bar", couleur=couleur)

    def document(self):
        """Contenu de graph.json (format de Figures)."""
        x = dict(self.axes["x"])
        if self.categories is not None:
            x["categories"] = self.categories
        return {
            "format": GRAPH_FORMAT,
            "width": self.largeur,
            "height": self.hauteur,
            "theme": "these",
            "x": x,
            "y": dict(self.axes["y"]),
            "legend": self.legende,
            "grid": self.grille,
            "bar_width": 3,
            "series": self.series,
        }

    def enregistrer(self, nom, titre=None):
        """Écrit <nom>.graphe.json dans le dossier des sorties ; renvoie son chemin."""
        if not self.series:
            raise ValueError("Graphe « %s » sans série." % nom)
        chemin = dossier_sorties() / ("%s.graphe.json" % nom)
        contenu = {"format": FORMAT, "titre": titre or nom, "graphe": self.document()}
        tmp = chemin.with_suffix(".tmp")
        tmp.write_text(json.dumps(contenu, ensure_ascii=False, indent=1, allow_nan=False), encoding="utf-8")
        os.replace(tmp, chemin)
        print("these_figures : graphe « %s » → %s" % (titre or nom, chemin.name))
        return str(chemin)


_MARQUES_MPL = {"o": "o", ".": "o", "s": "square", "^": "triangle", "v": "triangle", "<": "triangle", ">": "triangle",
                "D": "diamond", "d": "diamond", "x": "x", "X": "x", "+": "+", "P": "+", "*": "x"}
_TIRETS_MPL = {"--": "dashed", "-.": "dashed", ":": "dotted", "dashed": "dashed", "dashdot": "dashed", "dotted": "dotted"}
_LEGENDES_MPL = {1: "north east", 2: "north west", 3: "south west", 4: "south east", 0: "north east"}


def depuis_matplotlib(fig_ou_ax, nom, titre=None, largeur=120, hauteur=80):
    """Reprend une figure (ou des axes) matplotlib : courbes, nuages, barres, noms, échelles, titres d'axes."""
    ax = fig_ou_ax
    if hasattr(fig_ou_ax, "axes") and not hasattr(fig_ou_ax, "plot"):
        axes = [a for a in fig_ou_ax.axes if a.get_visible()]
        if not axes:
            raise ValueError("Figure matplotlib sans axes.")
        if len(axes) > 1:
            print("these_figures : %d axes dans la figure, seul le premier est repris" % len(axes))
        ax = axes[0]
    xmin, xmax = ax.get_xlim()
    ymin, ymax = ax.get_ylim()
    g = Graphe(
        x=ax.get_xlabel(), y=ax.get_ylabel(), log_x=ax.get_xscale() == "log", log_y=ax.get_yscale() == "log",
        largeur=largeur, hauteur=hauteur, grille=any(l.get_visible() for l in ax.get_xgridlines()),
        **({} if ax.get_autoscalex_on() else {"x_min": min(xmin, xmax), "x_max": max(xmin, xmax)}),
        **({} if ax.get_autoscaley_on() else {"y_min": min(ymin, ymax), "y_max": max(ymin, ymax)}),
    )
    if xmin > xmax:
        g.axes["x"]["inverse"] = True
    if ymin > ymax:
        g.axes["y"]["inverse"] = True
    leg = ax.get_legend()
    g.legende = "none" if leg is None else _LEGENDES_MPL.get(getattr(leg, "_loc", 1), "north east")

    def visible(label):
        return bool(label) and not str(label).startswith("_")

    for ligne in ax.get_lines():
        if not ligne.get_visible():
            continue
        trait = ligne.get_linestyle() not in ("None", "none", "", " ")
        marque = ligne.get_marker() not in ("None", "none", "", " ", None)
        type_ = "linepoints" if trait and marque else "line" if trait else "points"
        g.serie(
            ligne.get_label() if visible(ligne.get_label()) else "Série %d" % (len(g.series) + 1),
            ligne.get_xdata(), ligne.get_ydata(), type=type_, couleur=ligne.get_color(),
            marque=_MARQUES_MPL.get(ligne.get_marker()) if marque else None,
            tirets=_TIRETS_MPL.get(ligne.get_linestyle()) if trait else None,
            legende=visible(ligne.get_label()),
        )
    for coll in ax.collections:
        offsets = getattr(coll, "get_offsets", lambda: None)()
        if offsets is None or len(offsets) == 0 or not hasattr(offsets, "__getitem__"):
            continue
        try:
            xs = [p[0] for p in offsets]
            ys = [p[1] for p in offsets]
        except Exception:
            continue
        couleurs = coll.get_facecolor()
        g.serie(coll.get_label() if visible(coll.get_label()) else "Série %d" % (len(g.series) + 1), xs, ys, type="points",
                couleur=couleurs[0] if len(couleurs) else None, legende=visible(coll.get_label()))
    for cont in getattr(ax, "containers", []):
        rects = [r for r in cont if hasattr(r, "get_height")]
        if not rects:
            continue
        noms = [t.get_text() for t in ax.get_xticklabels()]
        centres = [r.get_x() + r.get_width() / 2 for r in rects]
        if noms and len([n for n in noms if n]) == len(rects):
            g.categories = [n for n in noms if n]
            centres = list(range(1, len(rects) + 1))
        g.serie(cont.get_label() if visible(cont.get_label()) else "Série %d" % (len(g.series) + 1), centres,
                [r.get_height() for r in rects], type="bar", couleur=rects[0].get_facecolor(), legende=visible(cont.get_label()))
    return g.enregistrer(nom, titre=titre or ax.get_title() or nom)
