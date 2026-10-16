/**
 * Réglages de la carte en couleurs d'un graphe : palette, paliers, bornes, titre de la barre, isolignes, axes
 * échangés, contour d'empreinte superposé.
 */
import { useState } from "react";
import { bornesCarte, contourEmpreinte, lireValeurs, LIBELLES_PALETTES, PALETTES_CARTE, parseXY, transposerCarte, type CarteDoc, type Forme, type PaletteCarte } from "../../core/graph";
import { NumberInput, TextInput } from "../editor/fields";
import { useGraph } from "./useGraph";

const fr = (v: number) => String(Number(v.toPrecision(6))).replace(".", ",");

export function CarteReglages() {
  const s = useGraph();
  const c = s.doc.carte;
  if (!c) return null;
  const maj = (m: Partial<CarteDoc>) => s.update({ carte: { ...c, ...m } });
  const borne = (k: "min" | "max") => (v: string) => {
    const n = Number(v.replace(",", ".").replace("−", "-"));
    const suite: CarteDoc = { ...c };
    if (v.trim() === "" || !Number.isFinite(n)) delete suite[k];
    else suite[k] = n;
    s.update({ carte: suite });
  };
  const [lo, hi] = bornesCarte(c);
  return (
    <fieldset className="list-field">
      <legend>Carte en couleurs</legend>
      <label className="field">
        <span>Palette</span>
        <select value={c.palette} onChange={(e) => maj({ palette: e.target.value as PaletteCarte })}>
          {PALETTES_CARTE.map((p) => (
            <option key={p} value={p}>
              {LIBELLES_PALETTES[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="chip">
        <input type="checkbox" checked={c.inverser} onChange={(e) => maj({ inverser: e.target.checked })} />
        Inverser les couleurs
      </label>
      <div className="grid2">
        <label className="field">
          <span>Min couleurs (vide = auto)</span>
          <TextInput value={c.min === undefined ? "" : fr(c.min)} onChange={borne("min")} placeholder={fr(lo)} />
        </label>
        <label className="field">
          <span>Max couleurs (vide = auto)</span>
          <TextInput value={c.max === undefined ? "" : fr(c.max)} onChange={borne("max")} placeholder={fr(hi)} />
        </label>
      </div>
      <label className="field">
        <span>Nombre de teintes (2 à 64)</span>
        <NumberInput value={c.niveaux} onChange={(v) => maj({ niveaux: Math.round(Math.min(64, Math.max(2, v))) })} />
      </label>
      <label className="field">
        <span>Titre de la barre ($…$ pour les maths)</span>
        <TextInput value={c.legende} onChange={(v) => maj({ legende: v })} />
      </label>
      <div className="row">
        <button
          type="button"
          title="Échange les axes horizontal et vertical (et leurs titres et bornes)"
          onClick={() => s.update({ carte: transposerCarte(c), x: { ...s.doc.y }, y: { ...s.doc.x } })}
        >
          Échanger les axes
        </button>
        <button
          type="button"
          title="La carte disparaît ; les courbes éventuelles restent"
          onClick={() => {
            if (window.confirm("Retirer la carte de ce graphe ?")) s.update({ carte: undefined });
          }}
        >
          Retirer la carte
        </button>
      </div>
      <Isolignes c={c} maj={maj} bornes={[lo, hi]} />
      <Contour />
      <p className="muted small">Pour exagérer la hauteur de la coupe, augmentez la hauteur du graphe (ou cochez « Échelles égales » pour 1 m = 1 m) ; pour recadrer, les min / max des axes.</p>
    </fieldset>
  );
}

/** Isolignes : valeurs saisies (« −100 ; 0 ; 100 ») ou n niveaux réguliers entre les bornes de couleurs. */
function Isolignes({ c, maj, bornes }: { c: CarteDoc; maj: (m: Partial<CarteDoc>) => void; bornes: [number, number] }) {
  const [texte, setTexte] = useState((c.isolignes ?? []).map(fr).join(" ; "));
  const [vu, setVu] = useState(c.isolignes);
  if (vu !== c.isolignes) {
    setVu(c.isolignes);
    setTexte((c.isolignes ?? []).map(fr).join(" ; "));
  }
  const appliquer = (v: number[]) => {
    const suite: CarteDoc = { ...c };
    if (v.length) suite.isolignes = [...new Set(v)].sort((a, b) => a - b);
    else delete suite.isolignes;
    maj(suite);
  };
  return (
    <>
      <label className="field">
        <span>Isolignes (valeurs séparées par ;)</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={() => appliquer(lireValeurs(texte.replace(/−/g, "-")))} placeholder="−200 ; −100 ; 0 ; 100" />
      </label>
      <div className="row">
        {[4, 8].map((n) => (
          <button key={n} type="button" className="small-btn" onClick={() => appliquer(Array.from({ length: n - 1 }, (_, k) => Number((bornes[0] + ((k + 1) * (bornes[1] - bornes[0])) / n).toPrecision(3))))}>
            {n - 1} niveaux réguliers
          </button>
        ))}
        {c.isolignes?.length ? (
          <button type="button" className="small-btn" onClick={() => appliquer([])}>
            Aucune
          </button>
        ) : null}
      </div>
    </>
  );
}

/** Contour d'empreinte superposé : cercle, rectangle ou courbe collée (x y par ligne), en unités des axes. */
function Contour() {
  const s = useGraph();
  const [forme, setForme] = useState<Forme["forme"]>("cercle");
  const [v, setV] = useState({ cx: "0", cy: "0", r: "150", lx: "200", ly: "300", points: "" });
  const n = (t: string) => Number(t.replace(",", ".").replace("−", "-"));
  const champ = (k: keyof typeof v, libelle: string) => (
    <label className="field">
      <span>{libelle}</span>
      <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </label>
  );
  function ajouter() {
    try {
      const f: Forme =
        forme === "cercle"
          ? { forme, cx: n(v.cx), cy: n(v.cy), r: n(v.r) }
          : forme === "rectangle"
            ? { forme, cx: n(v.cx), cy: n(v.cy), lx: n(v.lx), ly: n(v.ly) }
            : { forme, ...parseXY(v.points) };
      s.update({ series: [...s.doc.series, contourEmpreinte(f)] });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <details className="carte-contour">
      <summary>Contour d'empreinte…</summary>
      <label className="field">
        <span>Forme (unités des axes)</span>
        <select value={forme} onChange={(e) => setForme(e.target.value as Forme["forme"])}>
          <option value="cercle">Cercle (centre, rayon)</option>
          <option value="rectangle">Rectangle (centre, lx × Ly)</option>
          <option value="courbe">Courbe collée (x y par ligne)</option>
        </select>
      </label>
      {forme === "courbe" ? (
        <label className="field">
          <span>Points</span>
          <textarea rows={4} value={v.points} onChange={(e) => setV({ ...v, points: e.target.value })} placeholder={"0 0\n10 5\n…"} />
        </label>
      ) : (
        <div className="grid2">
          {champ("cx", "Centre (axe x)")}
          {champ("cy", "Centre (axe y)")}
          {forme === "cercle" ? champ("r", "Rayon") : null}
          {forme === "rectangle" ? champ("lx", "lx (selon x)") : null}
          {forme === "rectangle" ? champ("ly", "Ly (selon y)") : null}
        </div>
      )}
      <button type="button" onClick={ajouter} title="Ajoute une série en trait noir, hors légende (modifiable ou supprimable dans Séries)">
        Ajouter le contour
      </button>
    </details>
  );
}
