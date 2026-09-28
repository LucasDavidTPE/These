/**
 * Série de Prony (étape Calage) : Maxwell ou Kelvin-Voigt généralisé, calé sur les mesures
 * translatées ou sur le modèle continu, tracé en tirets sur les courbes du calage, fonction de
 * relaxation ou de fluage, et exports pour Abaqus et COMSOL.
 */
import { useContexte } from "@interface/contexte";
import { csv, pointsCalage, serieProny, type Essai } from "../core/essai";
import { nb } from "../core/format";
import { ecartsProny, exportAbaqus, exportComsol, REGLAGES_PRONY, tableauProny, type ReglagesProny } from "../core/prony";
import type { Vue } from "../core/vues";
import { Bloc, ChampNombre, Indicateur } from "./champs";
import { useTraitement } from "./etat";
import { useFigure } from "./figure";
import { Graphe } from "./Graphe";

export function BlocProny({ e, vue }: { e: Essai; vue: Vue | null }) {
  const ctx = useContexte();
  const s = useTraitement();
  const figure = useFigure();
  const r = e.prony;

  if (!r) {
    return (
      <Bloc titre="Série de Prony" aide="Maxwell ou Kelvin-Voigt généralisé, pour un calcul aux éléments finis">
        <p className="discret petit">
          Une somme de ressorts et d'amortisseurs (branches de temps τᵢ fixés, une ou deux par décade) calée sur la courbe maîtresse mesurée ou sur le modèle continu calé, puis exportée
          pour Abaqus ou COMSOL.
        </p>
        <button type="button" className="principal" onClick={() => s.maj(() => (e.prony = { ...REGLAGES_PRONY }))}>
          Ajouter une série de Prony
        </button>
      </Bloc>
    );
  }

  const serie = serieProny(e);
  const regler = (x: Partial<ReglagesProny>) => s.maj(() => (e.prony = { ...r, ...x }));
  const mesures = pointsCalage(e).map((p) => ({ f: p.f * (e.aT[p.T] ?? NaN), module: p.module, phi: p.phi }));
  const ec = serie ? ecartsProny(serie, mesures) : null;
  const contexte = { nom: e.nom, nu: r.nu, Tref: e.Tref, C1: e.C1, C2: e.C2 };
  const enregistrer = async (nom: string, texte: string) => {
    try {
      if (await ctx.plateforme.enregistrerSous(nom, new TextEncoder().encode(texte))) s.signaler(`${nom} enregistré`);
    } catch (err) {
      s.signaler(`Enregistrement impossible : ${err instanceof Error ? err.message : String(err)}`, "erreur");
    }
  };
  const relaxation = r.type === "maxwell";

  return (
    <Bloc titre="Série de Prony" aide={relaxation ? "E(t) = E∞ + Σ Eᵢ·exp(−t/τᵢ)" : "J(t) = 1/E0 + Σ (1/Eᵢ)·(1 − exp(−t/τᵢ))"}>
      <div className="tr-grille-2">
        <div>
          <div className="rangee">
            <label className="tr-libelle">
              <span>Chaîne</span>
              <select className="tr-champ" value={r.type} onChange={(ev) => regler({ type: ev.target.value as ReglagesProny["type"] })}>
                <option value="maxwell">Maxwell généralisé (relaxation)</option>
                <option value="kelvin">Kelvin-Voigt généralisé (fluage)</option>
              </select>
            </label>
            <label className="tr-libelle">
              <span>Calée sur</span>
              <select className="tr-champ" value={r.source} onChange={(ev) => regler({ source: ev.target.value as ReglagesProny["source"] })}>
                <option value="mesures">les mesures translatées (a_T actuels)</option>
                <option value="modele">le modèle calé ({e.modeleId === "gkv" ? "chaîne GKV" : "courbe continue"}), ±2 décades</option>
              </select>
            </label>
            <label className="tr-libelle">
              <span>Branches par décade</span>
              <select className="tr-champ" value={r.parDecade} onChange={(ev) => regler({ parDecade: Number(ev.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <ChampNombre label="ν (exports)" valeur={r.nu} largeur={80} onChange={(nu) => nu > 0 && nu < 0.5 && regler({ nu })} />
          </div>
          {serie ? (
            <>
              <div className="rangee">
                <Indicateur cle="Branches" valeur={String(serie.E.length)} />
                <Indicateur cle="E0 instantané" valeur={`${nb(serie.E0, 0)} MPa`} />
                <Indicateur cle="E∞ long terme" valeur={`${nb(serie.Einf, 1)} MPa`} />
                <Indicateur cle="Écart |E*|" valeur={ec && Number.isFinite(ec.module) ? `${nb(ec.module, 2)} %` : "—"} />
                <Indicateur cle="Écart φ" valeur={ec && Number.isFinite(ec.phase) ? `${nb(ec.phase, 2)} °` : "—"} />
              </div>
              <p className="discret petit">
                Tracée en tirets sur les courbes du calage. Temps à T_ref = {e.Tref} °C ; à une autre température, τᵢ(T) = τᵢ / a_T(T) (WLF : C1 = {nb(e.C1, 2)}, C2 = {nb(e.C2, 1)}).
              </p>
              <div className="tr-cadre" style={{ maxHeight: 220 }}>
                <table className="tr-table">
                  <thead>
                    <tr>
                      <th scope="col">i</th>
                      <th scope="col">τᵢ (s)</th>
                      <th scope="col">Eᵢ (MPa)</th>
                      <th scope="col">{relaxation ? "gᵢ = Eᵢ/E0" : "ηᵢ = Eᵢ·τᵢ (MPa·s)"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serie.E.map((E, i) => (
                      <tr key={i}>
                        <th scope="row">{i + 1}</th>
                        <td>{serie.tau[i]!.toExponential(3)}</td>
                        <td>{nb(E, 1)}</td>
                        <td>{relaxation ? nb(E / serie.E0, 5) : (E * serie.tau[i]!).toExponential(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rangee">
                <button type="button" onClick={() => void enregistrer(`${e.nom}_prony.csv`, csv(tableauProny(serie)))}>
                  Tableau .csv
                </button>
                <button type="button" disabled={!relaxation} title={relaxation ? "Cartes *ELASTIC, *VISCOELASTIC (Prony) et *TRS (WLF)" : "Abaqus attend une série de relaxation : choisir Maxwell généralisé"} onClick={() => void enregistrer(`${e.nom}_prony.inp`, exportAbaqus(serie, contexte))}>
                  Abaqus .inp
                </button>
                <button type="button" disabled={!relaxation} title={relaxation ? "Branches Gᵢ (Pa), τᵢ (s) à charger dans le matériau viscoélastique ; G∞, K et WLF en commentaire" : "COMSOL attend une série de relaxation : choisir Maxwell généralisé"} onClick={() => void enregistrer(`${e.nom}_prony_comsol.txt`, exportComsol(serie, contexte))}>
                  COMSOL .txt
                </button>
                <button type="button" className="a-droite" onClick={() => s.maj(() => delete e.prony)}>
                  Retirer
                </button>
              </div>
            </>
          ) : (
            <p className="discret">Pas assez de points translatés pour caler une série.</p>
          )}
        </div>
        <Graphe titre={relaxation ? "Module de relaxation E(t)" : "Fonction de fluage J(t)"} vue={vue} figure={figure(relaxation ? "Module de relaxation (Prony)" : "Fonction de fluage (Prony)", "prony")} />
      </div>
    </Bloc>
  );
}
