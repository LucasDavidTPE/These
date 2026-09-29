"""T5b — Deux codes indépendants pour la même intégrale d'hérédité (textures aléatoire et rainures).
(a) t05 : marche en temps sur les RÉPONSES (local_response à chaque pas, puis hérédité) ;
(b) méthode de campagne : hérédité sur la PRESSION (texture.hereditary_perturbation), puis une
    seule réponse. Les deux doivent coïncider (commutation de l'opérateur élastique)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
import chausspec as cs
from chausspec.texture import envelope_sampler, hereditary_perturbation, local_response
from tfe_a340 import BBGB_KVG, V, bogie
sys.argv = [sys.argv[0]]
import importlib.util
spec = importlib.util.spec_from_file_location("t05mod", os.path.join(HERE, "t05_integration_temporelle.py"))
src = open(os.path.join(HERE, "t05_integration_temporelle.py")).read()
# on ne réutilise que les fonctions library/modulation et les constantes
ns = {"__file__": os.path.join(HERE, "t05_integration_temporelle.py")}
exec(src.split("# souplesse effective")[0], ns)
ref = json.load(open(os.path.join(HERE, "t05_resultats.json")))
load = bogie("heterogene"); right = cs.Loading([w for w in load.wheels if w.y0 > 0])
out = {}
for tex in ("gauss_MPD1.0", "rainures_vives"):
    lib = ns["library"](tex)
    for cname, (xc, yc) in ns["CENTRES"].items():
        key = f"{tex}|{cname}"
        if key not in ref:
            continue
        D, NT = ns["D"], ns["NT"]
        xs = xc - NT * D / 2 + D * np.arange(NT); ys = yc - NT * D / 2 + D * np.arange(NT)
        X, Y = np.meshgrid(xs, ys)
        core = (np.abs(X - xc) < 0.032) & (np.abs(Y - yc) < 0.032)
        samp = envelope_sampler(right, xs, ys)
        modf = lambda p0: ns["modulation"](lib, X, Y, p0.reshape(X.shape)).ravel()
        dpeq = hereditary_perturbation(samp, modf, BBGB_KVG, V, -4.2, 5e-3 / V, E_s=1e9, dtype=np.float64, tau_min_frac=0.0)
        loc = local_response(dpeq, D, D, [0.002, 0.005], 0.35, 1e9, ("ezz", "exz"))
        r = {}
        for (c, z), f in loc.items():
            k = f"{c}@{z*1e3:.0f}mm"
            r[k] = dict(max_pression=float(np.abs(f[core]).max() * 1e6), max_reponses=ref[key]["res"][k]["max_exact"])
            print(f"{key:30s} {k:9s} hérédité sur la pression {r[k]['max_pression']:8.2f} | sur les réponses (t05) {r[k]['max_reponses']:8.2f} µdef "
                  f"({(r[k]['max_pression']/r[k]['max_reponses']-1)*100:+.2f} %)", flush=True)
        out[key] = r
json.dump(out, open(os.path.join(HERE, "t05b_resultats.json"), "w"), indent=1)
