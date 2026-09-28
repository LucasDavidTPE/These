/** Étape 01 : fichier de mesure, correspondance des voies, éprouvette, capteurs, matrice de campagne. */
import { useRef, useState } from "react";
import { useContexte } from "@interface/contexte";
import { UNITES_AXIALES, type Correspondance } from "../core/donnees";
import { detecter, traiter } from "../core/essai";
import { entier, nb } from "../core/format";
import { fichierDepuisOctets } from "../core/io/lecture";
import { chargerFichiers } from "./chargement";
import { Bloc, ChampNombre, Indicateur } from "./champs";
import { essaiActif, souffler, useTraitement } from "./etat";

const LIBELLES_VOIES: [keyof Correspondance, string, boolean][] = [
  ["cycle", "Compteur de cycles", false],
  ["temps", "Temps (s)", false],
  ["position", "Position (mm)", true],
  ["charge", "Charge (kN)", false],
  ["defM", "Moy pilotage", true],
  ["defA", "Axial 1", false],
  ["defB", "Axial 2", true],
  ["defC", "Axial 3", true],
  ["lion1", "Radial 1", true],
  ["lion2", "Radial 2", true],
  ["lion3", "Radial 3", true],
  ["lion4", "Radial 4", true],
  ["pt100", "Température (°C)", false],
];

const VOIES_BOUTONS: [string, "voiesAx" | "voiesRad", number, keyof Correspondance][] = [
  ["Axial 1", "voiesAx", 0, "defA"],
  ["Axial 2", "voiesAx", 1, "defB"],
  ["Axial 3", "voiesAx", 2, "defC"],
  ["Radial 1", "voiesRad", 0, "lion1"],
  ["Radial 2", "voiesRad", 1, "lion2"],
  ["Radial 3", "voiesRad", 2, "lion3"],
  ["Radial 4", "voiesRad", 3, "lion4"],
];

function Matrice() {
  const s = useTraitement();
  const e = essaiActif(s)!;
  return (
    <div className="tr-cadre">
      <table className="tr-table tr-matrice">
        <thead>
          <tr>
            <th scope="col">f (Hz) \ T (°C)</th>
            {e.temperatures.map((T, i) => (
              <th key={i} scope="col">
                <ChampNombre valeur={T} aria={`Température ${i + 1}`} largeur={70} onChange={(v) => s.maj(() => (e.temperatures[i] = v))} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {e.frequences.map((f, j) => (
            <tr key={j}>
              <th scope="row">
                <ChampNombre valeur={f} aria={`Fréquence ${j + 1}`} largeur={70} onChange={(v) => s.maj(() => (e.frequences[j] = v))} />
              </th>
              {e.temperatures.map((T, i) => (
                <td key={i}>
                  <ChampNombre valeur={e.nbCycles[j]?.[i] ?? 0} aria={`Cycles à ${f} Hz et ${T} °C`} largeur={56} onChange={(v) => s.maj(() => ((e.nbCycles[j] ||= [])[i] = Math.max(0, Math.round(v))))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EtapeEssai() {
  const ctx = useContexte();
  const s = useTraitement();
  const e = essaiActif(s);
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  if (!e) return null;
  const nCol = Math.max(11, e.entetes.length, e.table ? e.table.colonnes.length : 0);

  async function ouvrir() {
    // Dans l'application, la boîte « Ouvrir » de Windows ; dans un navigateur, le sélecteur de fichiers.
    if (ctx.plateforme.genre === "tauri") {
      const f = await ctx.plateforme.ouvrirFichier("Fichier de mesure", ["csv", "txt", "xlsx", "xlsm"]);
      if (f) await chargerFichiers([fichierDepuisOctets(f.nom, f.octets)]);
    } else entree.current?.click();
  }

  return (
    <>
      <div className="tr-grille-2">
        <Bloc titre="Fichier de mesure" aide="export MTS / Instron ou WaveMatrix steps tracking (.csv, .txt, .xlsx)">
          <button
            type="button"
            className={survol ? "tr-depot survol" : "tr-depot"}
            onClick={() => void ouvrir()}
            onDragOver={(ev) => (ev.preventDefault(), setSurvol(true))}
            onDragLeave={() => setSurvol(false)}
            onDrop={(ev) => {
              ev.preventDefault();
              setSurvol(false);
              if (ev.dataTransfer.files.length) void chargerFichiers([...ev.dataTransfer.files]);
            }}
          >
            {/* Sous Windows, la fenêtre de l'application intercepte le glisser-déposer : on choisit le fichier. */}
            <strong>{ctx.plateforme.genre === "tauri" ? "Choisir un fichier…" : "Déposer un fichier"}</strong>
            <span className="discret">{ctx.plateforme.genre === "tauri" ? "" : "ou cliquer pour le choisir — "}plusieurs éprouvettes s'ajoutent pour être comparées</span>
          </button>
          <input
            ref={entree}
            type="file"
            hidden
            multiple
            accept=".xlsx,.xlsm,.csv,.txt"
            onChange={(ev) => {
              const f = [...(ev.target.files ?? [])];
              ev.target.value = "";
              if (f.length) void chargerFichiers(f);
            }}
          />
          <p className="discret petit">{s.infoFichier || (e.demo ? "Aucun fichier chargé — l'écran montre un essai de démonstration entièrement calculé à partir de constantes connues. L'optimiseur doit les retrouver." : "")}</p>
        </Bloc>

        <Bloc titre="Correspondance des voies" aide="colonne du fichier pour chaque grandeur">
          <div className="tr-grille-champs">
            {LIBELLES_VOIES.map(([cle, libelle, facultatif]) => (
              <label key={cle} className="tr-libelle">
                <span>{libelle}</span>
                <select
                  className="tr-champ"
                  value={e.correspondance[cle]}
                  onChange={(ev) =>
                    s.maj(() => {
                      const v = Number(ev.target.value);
                      e.correspondance[cle] = v;
                      if (/^lion/.test(cle)) e.voiesRad[Number(cle.slice(4)) - 1] = v >= 0;
                      if (/^def[ABC]$/.test(cle)) e.voiesAx["ABC".indexOf(cle[3]!)] = v >= 0;
                    })
                  }
                >
                  {facultatif ? <option value={-1}>— non utilisée</option> : null}
                  {Array.from({ length: nCol }, (_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                      {e.entetes[i] ? ` · ${e.entetes[i]!.trim().slice(0, 28)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="tr-libelle">
              <span>Unité des extensomètres</span>
              <select className="tr-champ" value={e.uniteAxiale} onChange={(ev) => s.maj(() => (e.uniteAxiale = ev.target.value))}>
                {Object.keys(UNITES_AXIALES)
                  .filter((u) => ["mm/mm", "%", "µm/m"].includes(u))
                  .map((u) => (
                    <option key={u}>{u}</option>
                  ))}
              </select>
            </label>
          </div>
        </Bloc>

        <Bloc titre="Éprouvette">
          <div className="tr-grille-champs">
            <label className="tr-libelle">
              <span>Nom</span>
              <input type="text" className="tr-champ" value={e.nom} onChange={(ev) => s.maj(() => (e.nom = ev.target.value))} />
            </label>
            <ChampNombre label="Diamètre (mm)" valeur={e.meta.diametre} onChange={(v) => s.maj(() => (e.meta.diametre = v))} />
            <ChampNombre label="Hauteur (mm)" valeur={e.meta.hauteur} onChange={(v) => s.maj(() => (e.meta.hauteur = v))} />
            <ChampNombre label="h_calcul (mm)" valeur={e.meta.hCalcul} onChange={(v) => s.maj(() => (e.meta.hCalcul = v))} />
            <ChampNombre label="Cycle initial" valeur={e.meta.cycleInitial} onChange={(v) => s.maj(() => (e.meta.cycleInitial = v))} />
          </div>
          <div className="rangee">
            <Indicateur cle="Surface" valeur={`${nb(((Math.PI * (e.meta.diametre / 1000) ** 2) / 4) * 1e4, 2)} cm²`} />
            <Indicateur cle="Lignes brutes" valeur={e.table ? entier(e.table.n) : "—"} />
          </div>
        </Bloc>

        <Bloc titre="Capteurs sans contact" aide="Y (mm) = A·V + B">
          <div className="tr-grille-champs">
            <ChampNombre label="Lion 1 — A" valeur={e.meta.a1} onChange={(v) => s.maj(() => (e.meta.a1 = v))} />
            <ChampNombre label="Lion 1 — B" valeur={e.meta.b1} onChange={(v) => s.maj(() => (e.meta.b1 = v))} />
            <ChampNombre label="Lion 2 — A" valeur={e.meta.a2} onChange={(v) => s.maj(() => (e.meta.a2 = v))} />
            <ChampNombre label="Lion 2 — B" valeur={e.meta.b2} onChange={(v) => s.maj(() => (e.meta.b2 = v))} />
          </div>
        </Bloc>

        <Bloc titre="Voies retenues" aide="exclure un capteur décroché">
          <div className="rangee">
            {VOIES_BOUTONS.filter(([, , , cle]) => e.correspondance[cle] >= 0).map(([nom, champ, i, cle]) => (
              <button
                key={nom}
                type="button"
                aria-pressed={!!e[champ][i]}
                className={e[champ][i] ? "tr-bascule actif" : "tr-bascule"}
                title={`colonne ${e.correspondance[cle] + 1}`}
                onClick={() =>
                  s.maj(() => {
                    e[champ][i] = !e[champ][i];
                    if (!e.voiesAx.some(Boolean)) e.voiesAx[i] = true;
                    if (!e.voiesRad.some(Boolean)) e.voiesRad[i] = true;
                  })
                }
              >
                {nom}
              </button>
            ))}
            {VOIES_BOUTONS.every(([, , , cle]) => e.correspondance[cle] < 0) ? <span className="discret">Aucune voie de mesure reconnue dans ce fichier.</span> : null}
          </div>
        </Bloc>
      </div>

      <Bloc titre="Campagne — nombre de cycles par palier" aide="un palier = un couple (T, f)">
        <div className="rangee">
          <button
            type="button"
            onClick={() =>
              void s.tache("Analyse du découpage…", () => {
                const info = detecter(e);
                s.maj((x) => (x.infoDetection = info ?? "Découpage introuvable — renseigne la matrice à la main, ou vérifie les colonnes « compteur de cycles » et « temps »."));
              })
            }
          >
            Détecter dans le fichier
          </button>
          <button type="button" onClick={() => s.maj(() => (e.temperatures.push((e.temperatures.at(-1) || 0) + 10), e.nbCycles.forEach((r) => r.push(0))))}>
            + température
          </button>
          <button type="button" onClick={() => e.temperatures.length > 1 && s.maj(() => (e.temperatures.pop(), e.nbCycles.forEach((r) => r.pop())))}>
            − température
          </button>
          <button type="button" onClick={() => s.maj(() => (e.frequences.push(1), e.nbCycles.push(e.temperatures.map(() => 0))))}>
            + fréquence
          </button>
          <button type="button" onClick={() => e.frequences.length > 1 && s.maj(() => (e.frequences.pop(), e.nbCycles.pop()))}>
            − fréquence
          </button>
          <button type="button" className="principal" onClick={() => void s.tache("Traitement de la campagne…", async (progres) => (await traiter(e, progres, souffler), s.maj((x) => ((x.palier = 0), (x.cycle = 0)))))}>
            Traiter la campagne
          </button>
        </div>
        {s.infoDetection ? <p className="discret petit">{s.infoDetection}</p> : null}
        <Matrice />
      </Bloc>
    </>
  );
}
