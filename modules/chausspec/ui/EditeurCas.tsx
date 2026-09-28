/**
 * Saisie d'un cas : structure (couches, lois, interfaces, fond), chargement (roues et
 * empreintes), régime, grille et sorties. Le cas reste au format JSON de chausspec.
 */
import { useState } from "react";
import { useContexte } from "@interface/contexte";
import { loadMapCsv, type CaseJSON, type FootprintJSON, type MaterialJSON } from "../core/io";
import { ALL, type Component } from "../core/spectral";
import { useChaussspec } from "./etat";

/** Nombre saisi librement (virgule acceptée), pris dès qu'il est lisible. */
export function Nombre({ v, onChange, largeur = 80, aria, vide }: { v: number | null | undefined; onChange(v: number | null): void; largeur?: number; aria: string; vide?: boolean }) {
  const [texte, setTexte] = useState<string | null>(null);
  const affiche = texte ?? (v === null || v === undefined ? "" : String(v));
  return (
    <input
      className="champ cs-nombre"
      style={{ width: largeur }}
      aria-label={aria}
      inputMode="decimal"
      value={affiche}
      onChange={(e) => {
        setTexte(e.target.value);
        const t = e.target.value.trim().replace(",", ".");
        if (t === "" && vide) onChange(null);
        else if (Number.isFinite(Number(t)) && t !== "") onChange(Number(t));
      }}
      onBlur={() => setTexte(null)}
    />
  );
}

/** Liste de nombres « a ; b ; c ». */
function Liste({ v, onChange, aria }: { v: number[]; onChange(v: number[]): void; aria: string }) {
  const [texte, setTexte] = useState<string | null>(null);
  return (
    <input
      className="champ"
      style={{ minWidth: 220, flex: 1 }}
      aria-label={aria}
      value={texte ?? v.join(" ; ")}
      onChange={(e) => {
        setTexte(e.target.value);
        const n = e.target.value
          .split(/[;\s]+/)
          .filter(Boolean)
          .map((s) => Number(s.replace(",", ".")));
        if (n.length && n.every(Number.isFinite)) onChange(n);
      }}
      onBlur={() => setTexte(null)}
    />
  );
}

const TYPES_LOI: { v: MaterialJSON["type"]; l: string }[] = [
  { v: "elastic", l: "Élastique" },
  { v: "2S2P1D", l: "2S2P1D" },
  { v: "KVG", l: "Kelvin-Voigt généralisé" },
  { v: "maxwell", l: "Maxwell généralisé (Prony)" },
];

function loiParDefaut(t: MaterialJSON["type"], avant: MaterialJSON): MaterialJSON {
  const nu = avant.nu ?? 0.35;
  if (t === "elastic") return { type: "elastic", E: "E" in avant ? avant.E : 5000, nu };
  if (t === "2S2P1D") return { type: "2S2P1D", E00: 65, E0: 30000, k: 0.25, h: 0.787, delta: 1.58, tau_ref: 1.22, beta: "inf", T_ref: 9.3, nu };
  if (t === "KVG") return { type: "KVG", E0: 30000, Ei: [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2], taui: [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900], nu };
  return { type: "maxwell", E_inf: 80, Ei: [15000, 9000, 5000], taui: [1e-4, 1e-2, 1], nu };
}

interface CalageTraitement {
  nom: string;
  E00: number;
  E0: number;
  k: number;
  h: number;
  delta: number;
  tauE: number;
  beta: number;
  Tref: number;
  C1: number;
  C2: number;
  nu00?: number;
  nu0?: number;
}

function Loi({ m, onChange }: { m: MaterialJSON; onChange(m: MaterialJSON): void }) {
  const ctx = useContexte();
  const [calages, setCalages] = useState<CalageTraitement[] | null>(null);
  const champ = (cle: string, label: string, opt?: { vide?: boolean; largeur?: number }) => (
    <label className="cs-champ">
      <span>{label}</span>
      <Nombre v={(m as Record<string, unknown>)[cle] as number | null} vide={opt?.vide} largeur={opt?.largeur} aria={label} onChange={(v) => onChange({ ...m, [cle]: v } as MaterialJSON)} />
    </label>
  );
  if (m.type === "elastic")
    return (
      <div className="cs-loi">
        {champ("E", "E (MPa)")}
        {champ("nu", "ν")}
      </div>
    );
  if (m.type === "2S2P1D") {
    const infini = m.beta === undefined || m.beta === null || m.beta === "inf";
    return (
      <div className="cs-loi">
        {champ("E00", "E00 (MPa)")}
        {champ("E0", "E0 (MPa)")}
        {champ("k", "k")}
        {champ("h", "h")}
        {champ("delta", "δ")}
        {champ("tau_ref", "τ réf (s)")}
        <label className="cs-champ">
          <span>β</span>
          <span className="rangee" style={{ gap: 4 }}>
            <label className="petit">
              <input type="checkbox" checked={infini} onChange={(e) => onChange({ ...m, beta: e.target.checked ? "inf" : 300 })} /> ∞
            </label>
            {!infini ? <Nombre v={m.beta as number} aria="β" largeur={70} onChange={(v) => onChange({ ...m, beta: v ?? "inf" })} /> : null}
          </span>
        </label>
        {champ("T_ref", "T réf (°C)")}
        {champ("C1", "C1", { vide: true })}
        {champ("C2", "C2", { vide: true })}
        {champ("T", "T (°C)", { vide: true })}
        {champ("nu", "ν")}
        {champ("nu00", "ν00", { vide: true })}
        {champ("nu0", "ν0", { vide: true })}
        {ctx.registre.aAction("traitement.calages") ? (
          <span className="cs-champ">
            <span>&nbsp;</span>
            {calages === null ? (
              <button type="button" className="petit" onClick={() => void ctx.registre.executer("traitement.calages", { ctx }).then((c) => setCalages(c as CalageTraitement[]))} title="Constantes calées dans le traitement 2S2P1D (essais ouverts)">
                Depuis le traitement…
              </button>
            ) : calages.length ? (
              <select
                className="champ"
                value=""
                onChange={(e) => {
                  const c = calages[Number(e.target.value)];
                  if (c) onChange({ ...m, E00: c.E00, E0: c.E0, k: c.k, h: c.h, delta: c.delta, tau_ref: c.tauE, beta: Number.isFinite(c.beta) ? c.beta : "inf", T_ref: c.Tref, C1: c.C1, C2: c.C2, nu00: c.nu00 ?? null, nu0: c.nu0 ?? null });
                  setCalages(null);
                }}
              >
                <option value="">Choisir l'essai…</option>
                {calages.map((c, i) => (
                  <option key={i} value={i}>
                    {c.nom}
                  </option>
                ))}
              </select>
            ) : (
              <span className="discret petit">aucun essai calé ouvert</span>
            )}
          </span>
        ) : null}
      </div>
    );
  }
  const liste = (cle: "Ei" | "taui", label: string) => (
    <label className="cs-champ" style={{ flex: 1 }}>
      <span>{label}</span>
      <Liste v={m[cle]} aria={label} onChange={(v) => onChange({ ...m, [cle]: v } as MaterialJSON)} />
    </label>
  );
  return (
    <div className="cs-loi">
      {m.type === "KVG" ? champ("E0", "E0 (MPa)") : champ("E_inf", "E∞ (MPa)")}
      {liste("Ei", "Eᵢ (MPa)")}
      {liste("taui", "τᵢ (s)")}
      {champ("nu", "ν")}
    </div>
  );
}

export function EditeurStructure() {
  const { cas, maj } = useChaussspec();
  const s = cas.structure;
  const fond = s.bottom ?? "halfspace";
  const inter = s.interfaces ?? s.layers.slice(1).map(() => "bonded" as const);
  return (
    <div className="cs-structure">
      {s.layers.map((L, i) => {
        const dernier = i === s.layers.length - 1;
        return (
          <div key={i}>
            <div className="cs-couche">
              <div className="cs-couche-tete">
                <strong>{i + 1}</strong>
                <input className="champ" style={{ width: 130 }} aria-label={`Nom de la couche ${i + 1}`} value={L.name ?? ""} onChange={(e) => maj((c) => (c.structure.layers[i]!.name = e.target.value))} />
                {dernier && fond === "halfspace" ? (
                  <span className="discret petit">semi-infinie</span>
                ) : (
                  <label className="cs-champ cs-inline">
                    <span>h (m)</span>
                    <Nombre v={L.h ?? 1} aria={`Épaisseur de la couche ${i + 1}`} largeur={70} onChange={(v) => v !== null && v > 0 && maj((c) => (c.structure.layers[i]!.h = v))} />
                  </label>
                )}
                <select className="champ" value={L.material.type} aria-label={`Loi de la couche ${i + 1}`} onChange={(e) => maj((c) => (c.structure.layers[i]!.material = loiParDefaut(e.target.value as MaterialJSON["type"], L.material)))}>
                  {TYPES_LOI.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.l}
                    </option>
                  ))}
                </select>
                <span className="grow" />
                <button type="button" className="petit" disabled={s.layers.length < 2} onClick={() => maj((c) => (c.structure.layers.splice(i, 1), c.structure.interfaces?.splice(Math.max(0, i - 1), 1)))}>
                  retirer
                </button>
              </div>
              <Loi m={L.material} onChange={(m) => maj((c) => (c.structure.layers[i]!.material = m))} />
            </div>
            {!dernier ? (
              <div className="cs-interface">
                <select
                  className="champ"
                  aria-label={`Interface ${i + 1}-${i + 2}`}
                  value={inter[i]}
                  onChange={(e) =>
                    maj((c) => {
                      const t = [...inter];
                      t[i] = e.target.value as "bonded" | "slip";
                      c.structure.interfaces = t;
                    })
                  }
                >
                  <option value="bonded">interface collée</option>
                  <option value="slip">interface glissante</option>
                </select>
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="rangee">
        <button
          type="button"
          onClick={() =>
            maj((c) => {
              const n = c.structure.layers.length;
              c.structure.layers.splice(n - 1, 0, { name: `Couche ${n}`, h: 0.3, material: { type: "elastic", E: 300, nu: 0.35 } });
              c.structure.interfaces = [...inter, "bonded"];
            })
          }
        >
          + Couche
        </button>
        <label className="cs-champ cs-inline">
          <span>Fond</span>
          <select className="champ" value={fond} onChange={(e) => maj((c) => (c.structure.bottom = e.target.value as typeof fond))}>
            <option value="halfspace">massif semi-infini (dernière couche)</option>
            <option value="rigid_bonded">substratum rigide collé</option>
            <option value="rigid_smooth">substratum rigide glissant (u_z bloqué)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

const TYPES_EMPREINTE: { v: FootprintJSON["type"]; l: string }[] = [
  { v: "rect", l: "Rectangle uniforme" },
  { v: "circle", l: "Disque uniforme" },
  { v: "separable", l: "Séparable (profils 1D)" },
  { v: "map", l: "Carte de pression (CSV)" },
];

function empreinteParDefaut(t: FootprintJSON["type"], force: number): FootprintJSON {
  if (t === "rect") return { type: "rect", lx: 0.56, ly: 0.4, force };
  if (t === "circle") return { type: "circle", R: 0.15, force };
  if (t === "separable")
    return { type: "separable", fx: { type: "halfellipse", c: 0.277 }, fy: { type: "gaussianpairs", P: [1.32, 0.8, 0.822], centers: [0.14846, 0.08804, 0.02864], sig: [0.02824, 0.01695, 0.01741] }, force };
  return { type: "map", unit: 1e6, force };
}

export function EditeurChargement() {
  const ctx = useContexte();
  const { cas, maj, signaler } = useChaussspec();
  const roues = cas.loading.wheels;
  async function importerCarte(i: number) {
    const f = await ctx.plateforme.ouvrirFichier("Carte de pression (CSV : 1re ligne x, 1re colonne y, « ; »)", ["csv", "txt"]);
    if (!f) return;
    try {
      const c = loadMapCsv(new TextDecoder().decode(f.octets));
      maj((k) => {
        const fp = k.loading.wheels[i]!.footprint as Extract<FootprintJSON, { type: "map" }>;
        Object.assign(fp, { x: c.x, y: c.y, P: c.P, file: undefined });
      });
      signaler(`Carte lue : ${c.x.length} × ${c.y.length} pixels (${f.nom}).`);
    } catch (e) {
      signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }
  return (
    <div className="cs-roues">
      <table className="cs-table">
        <thead>
          <tr>
            <th>Roue</th>
            <th>x0 (m)</th>
            <th>y0 (m)</th>
            <th>Empreinte</th>
            <th>Dimensions</th>
            <th>Force (kN)</th>
            <th title="Efforts tangentiels : q = coefficient × p (freinage, virage)">qx/p</th>
            <th>qy/p</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {roues.map((w, i) => {
            const fp = w.footprint;
            const setFp = (patch: Partial<FootprintJSON>) => maj((c) => Object.assign(c.loading.wheels[i]!.footprint, patch));
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <Nombre v={w.x0 ?? 0} aria={`x0 roue ${i + 1}`} largeur={64} onChange={(v) => maj((c) => (c.loading.wheels[i]!.x0 = v ?? 0))} />
                </td>
                <td>
                  <Nombre v={w.y0 ?? 0} aria={`y0 roue ${i + 1}`} largeur={64} onChange={(v) => maj((c) => (c.loading.wheels[i]!.y0 = v ?? 0))} />
                </td>
                <td>
                  <select className="champ" value={fp.type} onChange={(e) => maj((c) => (c.loading.wheels[i]!.footprint = empreinteParDefaut(e.target.value as FootprintJSON["type"], fp.force ?? 100000)))}>
                    {TYPES_EMPREINTE.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {fp.type === "rect" ? (
                    <span className="rangee" style={{ gap: 4 }}>
                      lx <Nombre v={fp.lx} aria="lx" largeur={56} onChange={(v) => v && setFp({ lx: v })} /> ly <Nombre v={fp.ly} aria="ly" largeur={56} onChange={(v) => v && setFp({ ly: v })} />
                    </span>
                  ) : fp.type === "circle" ? (
                    <span className="rangee" style={{ gap: 4 }}>
                      R <Nombre v={fp.R} aria="R" largeur={56} onChange={(v) => v && setFp({ R: v })} />
                    </span>
                  ) : fp.type === "map" ? (
                    <span className="rangee" style={{ gap: 4 }}>
                      <span className="discret petit">{fp.P ? `${fp.x?.length} × ${fp.y?.length} px` : fp.file ? `fichier ${fp.file}` : "aucune carte"}</span>
                      <button type="button" className="petit" onClick={() => void importerCarte(i)}>
                        CSV…
                      </button>
                    </span>
                  ) : (
                    <span className="discret petit" title={JSON.stringify(fp)}>
                      {fp.fx.type} × {fp.fy.type}
                    </span>
                  )}
                </td>
                <td>
                  <Nombre v={fp.force !== undefined ? fp.force / 1000 : null} aria={`Force roue ${i + 1}`} largeur={70} vide onChange={(v) => setFp({ force: v === null ? undefined : v * 1000 })} />
                </td>
                <td>
                  <Nombre v={w.qx ?? null} vide aria={`qx roue ${i + 1}`} largeur={52} onChange={(v) => maj((c) => (c.loading.wheels[i]!.qx = v))} />
                </td>
                <td>
                  <Nombre v={w.qy ?? null} vide aria={`qy roue ${i + 1}`} largeur={52} onChange={(v) => maj((c) => (c.loading.wheels[i]!.qy = v))} />
                </td>
                <td>
                  <button type="button" className="petit" disabled={roues.length < 2} onClick={() => maj((c) => c.loading.wheels.splice(i, 1))}>
                    retirer
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="rangee">
        <button type="button" onClick={() => maj((c) => c.loading.wheels.push({ ...JSON.parse(JSON.stringify(roues[roues.length - 1])), y0: (roues[roues.length - 1]?.y0 ?? 0) + 1 }))}>
          + Roue
        </button>
        <button
          type="button"
          title="Train principal d'A340 : 4 roues de 370 kN, entraxes 1,98 m × 1,40 m"
          onClick={() =>
            maj((c) => {
              const fp = { type: "rect" as const, lx: 0.56, ly: 0.4, force: 370000 };
              c.loading.wheels = [0, -1.98].flatMap((x0) => [-0.7, 0.7].map((y0) => ({ x0, y0, footprint: { ...fp } })));
            })
          }
        >
          Bogie A340
        </button>
        <span className="discret petit">x : sens de roulement ; y : transversal. Force : l'empreinte est ramenée à cette résultante.</span>
      </div>
    </div>
  );
}

export function EditeurCalcul() {
  const { cas, maj } = useChaussspec();
  const r = cas.regime ?? { type: "static" };
  const g = cas.grid ?? {};
  const o = cas.outputs ?? {};
  const L = g.L ?? [16, 16],
    N = g.N ?? [1024, 1024];
  const fen = g.window ?? null;
  const comps = o.components ?? ["uz", "exx", "eyy", "ezz"];
  const puissances = [64, 128, 256, 512, 1024, 2048];
  const setG = (f: (x: NonNullable<CaseJSON["grid"]>) => void) => maj((c) => f((c.grid ??= {})));
  const setO = (f: (x: NonNullable<CaseJSON["outputs"]>) => void) => maj((c) => f((c.outputs ??= {})));
  const cout = (N[0] * N[1]) / 2 / 1e3;
  return (
    <div className="cs-calcul">
      <div className="rangee">
        <label className="cs-champ">
          <span>Régime</span>
          <select className="champ" value={r.type} onChange={(e) => maj((c) => (c.regime = e.target.value === "moving" ? { type: "moving", speed: 0.66 } : e.target.value === "harmonic" ? { type: "harmonic", freq: 10 } : { type: "static" }))}>
            <option value="static">Statique (module à fréquence nulle)</option>
            <option value="moving">Charge roulante (régime permanent)</option>
            <option value="harmonic">Harmonique (amplitudes complexes, HWD)</option>
          </select>
        </label>
        {r.type === "moving" ? (
          <label className="cs-champ">
            <span>V (m/s)</span>
            <Nombre v={r.speed} aria="Vitesse" onChange={(v) => v && maj((c) => (c.regime = { type: "moving", speed: v }))} />
          </label>
        ) : r.type === "harmonic" ? (
          <label className="cs-champ">
            <span>f (Hz)</span>
            <Nombre v={r.freq} aria="Fréquence" onChange={(v) => v && maj((c) => (c.regime = { type: "harmonic", freq: v }))} />
          </label>
        ) : null}
      </div>
      <div className="rangee">
        {(["x", "y"] as const).map((a, k) => (
          <span key={a} className="rangee" style={{ gap: 4 }}>
            <label className="cs-champ">
              <span>L{a} (m)</span>
              <Nombre v={L[k]} aria={`L${a}`} largeur={60} onChange={(v) => v && v > 0 && setG((x) => (x.L = (k === 0 ? [v, L[1]] : [L[0], v]) as [number, number]))} />
            </label>
            <label className="cs-champ">
              <span>N{a}</span>
              <select className="champ" value={N[k]} onChange={(e) => setG((x) => (x.N = (k === 0 ? [Number(e.target.value), N[1]] : [N[0], Number(e.target.value)]) as [number, number]))}>
                {puissances.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </span>
        ))}
        <label className="cs-champ">
          <span>Filtre (m)</span>
          <Nombre v={g.filter_width ?? 0} aria="Largeur du filtre" largeur={60} onChange={(v) => setG((x) => (x.filter_width = v ?? 0))} />
        </label>
      </div>
      <div className="rangee">
        <label className="petit">
          <input type="checkbox" checked={fen !== null} onChange={(e) => setG((x) => (x.window = e.target.checked ? [-2, 2, -2, 2] : null))} /> Fenêtre gardée
        </label>
        {fen
          ? (["xmin", "xmax", "ymin", "ymax"] as const).map((n, k) => (
              <label key={n} className="cs-champ">
                <span>{n}</span>
                <Nombre
                  v={fen[k]}
                  aria={n}
                  largeur={56}
                  onChange={(v) =>
                    v !== null &&
                    setG((x) => {
                      const w = [...(x.window ?? fen)] as [number, number, number, number];
                      w[k] = v;
                      x.window = w;
                    })
                  }
                />
              </label>
            ))
          : null}
        <span className="discret petit">
          Pas : {(L[0] / N[0]).toFixed(3).replace(".", ",")} × {(L[1] / N[1]).toFixed(3).replace(".", ",")} m ; {Math.round(cout)} k nombres d'onde{cout > 600 ? " (calcul de plusieurs dizaines de secondes)" : ""}.
        </span>
      </div>
      <div className="rangee">
        <label className="cs-champ" style={{ flex: 1 }}>
          <span>Profondeurs (m)</span>
          <Liste v={o.depths ?? [0]} aria="Profondeurs" onChange={(v) => setO((x) => (x.depths = v.filter((z) => z >= 0)))} />
        </label>
      </div>
      <div className="cs-comps" role="group" aria-label="Composantes calculées">
        {ALL.map((c) => (
          <label key={c} className="petit">
            <input type="checkbox" checked={comps.includes(c)} onChange={(e) => setO((x) => (x.components = e.target.checked ? ALL.filter((k) => k === c || comps.includes(k)) : comps.filter((k) => k !== c)))} /> {c}
          </label>
        ))}
      </div>
      {r.type === "moving" ? (
        <div className="cs-jauges">
          <span className="petit">Jauges (signal vu par un point fixe au passage de la charge) :</span>
          {(o.gauges ?? []).map((j, i) => (
            <span key={i} className="rangee" style={{ gap: 4 }}>
              <select className="champ" value={j.comp} onChange={(e) => setO((x) => (x.gauges![i]!.comp = e.target.value as Component))}>
                {comps.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              z <Nombre v={j.z} aria="z jauge" largeur={50} onChange={(v) => v !== null && setO((x) => (x.gauges![i]!.z = v))} />
              x <Nombre v={j.x ?? 0} aria="x jauge" largeur={50} onChange={(v) => setO((x) => (x.gauges![i]!.x = v ?? 0))} />
              y <Nombre v={j.y} aria="y jauge" largeur={50} onChange={(v) => v !== null && setO((x) => (x.gauges![i]!.y = v))} />
              <button type="button" className="petit" onClick={() => setO((x) => x.gauges!.splice(i, 1))}>
                ×
              </button>
            </span>
          ))}
          <button type="button" className="petit" onClick={() => setO((x) => (x.gauges = [...(x.gauges ?? []), { comp: comps.includes("eyy") ? "eyy" : comps[0]!, z: (o.depths ?? [0]).at(-1) ?? 0, x: 0, y: 0 }]))}>
            + Jauge
          </button>
        </div>
      ) : null}
    </div>
  );
}
