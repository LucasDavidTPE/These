/** Étape 04 : calage du modèle (2S2P1D, Huet-Sayegh, Kelvin-Voigt), translation des isothermes, WLF. */
import { aTwlf } from "../core/calage";
import { ajusterWLF, calerConstantes, calerNu, calerTout, changerModele, changerTref, constantesChangees, ecartsCalage, recaler, reinitialiser, temperaturesCalage } from "../core/essai";
import { nb } from "../core/format";
import { MODELES, modele, type Parametre } from "../core/modeles";
import { vuesCalage } from "../core/vues";
import { Bloc, ChampNombre, Indicateur } from "./champs";
import { essaiActif, useTraitement } from "./etat";
import { Graphe } from "./Graphe";
import { useFigure } from "./figure";

function Curseur({ d, valeur, onChange }: { d: Parametre; valeur: number; onChange(v: number): void }) {
  return (
    <div className="tr-param">
      <label>{d.label + (d.unite ? ` (${d.unite})` : "")}</label>
      <input type="range" aria-label={d.label} min={d.min} max={d.max} step={d.pas} value={d.log ? Math.log10(valeur) : valeur} onChange={(ev) => onChange(d.log ? 10 ** Number(ev.target.value) : Number(ev.target.value))} />
      <ChampNombre valeur={valeur} aria={d.label} largeur={110} onChange={onChange} />
    </div>
  );
}

export function EtapeCalage() {
  const s = useTraitement();
  const e = essaiActif(s)!;
  const m = modele(e.modeleId);
  const v = vuesCalage(e);
  const ts = temperaturesCalage(e);
  const ec = ecartsCalage(e);
  const figure = useFigure();
  const regler = (cle: string, x: number) =>
    s.maj(() => {
      e.p[cle] = x;
      constantesChangees(e);
    });
  const long = (texte: string, f: () => void) => void s.tache(texte, () => s.maj(f));
  const params = (groupe: "module" | "poisson") => m.parametres.filter((d) => d.groupe === groupe);

  return (
    <div className="tr-calage">
      <div className="tr-grille-2">
        <Graphe titre="Plan Cole-Cole" sous="E₂ en fonction de E₁ — fixe E0, E00, k, h, δ" vue={v.cole} figure={figure("Plan Cole-Cole", "cole")} />
        <Graphe titre="Espace de Black" sous="|E*| en fonction de φ" vue={v.black} figure={figure("Espace de Black", "black")} />
        <Graphe titre="Courbe maîtresse |E*|" sous="module en fonction de f·a_T" vue={v.maitreE} figure={figure("Courbe maîtresse |E*|", "maitreE")} />
        <Graphe titre="Courbe maîtresse φ" sous="angle de phase en fonction de f·a_T" vue={v.maitreP} figure={figure("Courbe maîtresse φ", "maitreP")} />
        <Graphe titre="Facteurs de translation" sous="a_T expérimentaux et loi WLF" vue={v.aT} figure={figure("Facteurs de translation", "aT")} />
        <Graphe titre="Coefficient de Poisson" sous="|ν*| en fonction de f·a_T" vue={v.nu} figure={figure("Coefficient de Poisson", "nu")} />
      </div>

      <div className="tr-grille-3">
        <Bloc titre="Modèle">
          <label className="tr-libelle">
            <span>Loi de comportement</span>
            <select className="tr-champ" value={e.modeleId} onChange={(ev) => s.maj(() => changerModele(e, ev.target.value))}>
              {MODELES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
          </label>
          <p className="discret petit">
            {m.resume} <em>{m.reference}</em>
          </p>
          <label className="tr-libelle">
            <span>Température de référence</span>
            <select className="tr-champ" value={e.Tref} onChange={(ev) => s.maj(() => changerTref(e, Number(ev.target.value)))}>
              {ts.map((T) => (
                <option key={T} value={T}>
                  {T} °C
                </option>
              ))}
            </select>
          </label>
          <div className="rangee">
            <Indicateur cle="Points" valeur={String(ec.n)} />
            <Indicateur cle="Écart |E*|" valeur={Number.isFinite(ec.module) ? `${nb(ec.module, 2)} %` : "—"} />
            <Indicateur cle="Écart φ" valeur={Number.isFinite(ec.phase) ? `${nb(ec.phase, 2)} °` : "—"} />
          </div>
        </Bloc>

        <Bloc titre="Constantes" aide="module">
          {params("module").map((d) => (
            <Curseur key={d.cle} d={d} valeur={e.p[d.cle]!} onChange={(x) => regler(d.cle, x)} />
          ))}
          {m.derive ? <p className="discret petit">Ce modèle découle du 2S2P1D calé : rien à caler ici, seulement la discrétisation.</p> : null}
          <div className="rangee">
            <button type="button" className="principal" disabled={!m.ajustables.length} onClick={() => long("Calage des constantes et des a_T…", () => calerTout(e))}>
              Caler tout
            </button>
            <button type="button" disabled={!m.ajustables.length} onClick={() => long("Calage des constantes…", () => calerConstantes(e))}>
              Constantes seules
            </button>
            <button type="button" onClick={() => s.maj(() => reinitialiser(e))}>
              Réinitialiser
            </button>
          </div>
          {m.poisson ? (
            <>
              <h3 className="tr-sous-titre">Coefficient de Poisson (mêmes k, h, δ, β)</h3>
              {params("poisson").map((d) => (
                <Curseur key={d.cle} d={d} valeur={e.p[d.cle]!} onChange={(x) => regler(d.cle, x)} />
              ))}
              <button type="button" className="principal" onClick={() => long("Ajustement de ν*…", () => calerNu(e))}>
                Ajuster ν*
              </button>
            </>
          ) : null}
        </Bloc>

        <Bloc titre="Facteurs de translation">
          <div className="rangee">
            <button type="button" onClick={() => long("Recalage des isothermes…", () => recaler(e))}>
              Recaler les isothermes
            </button>
            <button type="button" onClick={() => s.maj(() => ajusterWLF(e))}>
              Ajuster WLF
            </button>
          </div>
          <div className="tr-param">
            <label>C1</label>
            <input type="range" aria-label="C1" min={1} max={120} step={0.1} value={e.C1} onChange={(ev) => s.maj(() => (e.C1 = Number(ev.target.value)))} />
            <ChampNombre valeur={e.C1} aria="C1" largeur={110} onChange={(x) => s.maj(() => (e.C1 = x))} />
          </div>
          <div className="tr-param">
            <label>C2</label>
            <input type="range" aria-label="C2" min={10} max={800} step={1} value={e.C2} onChange={(ev) => s.maj(() => (e.C2 = Number(ev.target.value)))} />
            <ChampNombre valeur={e.C2} aria="C2" largeur={110} onChange={(x) => s.maj(() => (e.C2 = x))} />
          </div>
          <div className="tr-cadre">
            <table className="tr-table">
              <thead>
                <tr>
                  <th scope="col">T (°C)</th>
                  <th scope="col">a_T</th>
                  <th scope="col">log a_T</th>
                  <th scope="col">a_T WLF</th>
                  <th scope="col">τE(T) (s)</th>
                </tr>
              </thead>
              <tbody>
                {ts.map((T) => (
                  <tr key={T}>
                    <th scope="row">{T}</th>
                    <td>
                      <ChampNombre valeur={e.aT[T]!} aria={`a_T à ${T} °C`} largeur={110} onChange={(x) => x > 0 && s.maj(() => (e.aT[T] = x))} />
                    </td>
                    <td>{nb(Math.log10(e.aT[T]!), 3)}</td>
                    <td>{nb(aTwlf(T, e.Tref, e.C1, e.C2), 4)}</td>
                    <td>{nb(e.p.tauE! / e.aT[T]!, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloc>
      </div>
    </div>
  );
}
