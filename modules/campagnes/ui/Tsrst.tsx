/**
 * Essais TSRST (SPEC §8.4) : fiche de chaque éprouvette, dépouillement (rupture, transition, contrainte à
 * des températures fixées) rangé dans l'espace, et le tableau de tous les essais TSRST : tri, filtres,
 * moyennes par matériau, superposition des courbes σ(T), export Excel d'archive, figure régénérable.
 */
import { useMemo, useState } from "react";
import { Message, Section } from "@interface/composants";
import { Courbes } from "@interface/Courbes";
import type { Contexte } from "@interface/contexte";
import { ecrireClasseur } from "@noyau/formats/xlsx-ecriture";
import { correspond } from "@noyau/texte";
import { VALIDITES, type Eprouvette, type Essai } from "../core/modele";
import { feuillesTsrst, grouperTsrst, lignesTsrst, panneauComparaison, sectionDe, trier, valeurColonne, type ColonneTsrst, type LigneTsrst } from "../core/tsrst";
import { aujourdhui, enregistrerEssai, type CampagneChargee } from "./donnees";
import { renduComparaison, type OrigineComparaison } from "./figure";
import { depouillerEssai, useTemperatures } from "./tsrstDonnees";

const nf = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("fr-FR", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
const sourceDe = (c: CampagneChargee) => ({
  slug: c.slug,
  titre: c.campagne.titre,
  type: c.campagne.type,
  materiau: c.campagne.materiau,
  essais: c.essais,
  tsrst: c.tsrst,
});

function Nombre({ titre, valeur, onValider, unite }: { titre: string; valeur: number | null; onValider(v: number | null): void; unite?: string }) {
  const [v, setV] = useState<string | null>(null);
  const courant = v ?? (valeur === null ? "" : String(valeur).replace(".", ","));
  return (
    <label className="champ-c">
      <span>
        {titre}
        {unite ? ` (${unite})` : ""}
      </span>
      <input
        inputMode="decimal"
        value={courant}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === null) return;
          const n = v.trim() === "" ? null : Number(v.replace(",", ".").replace(/\s/g, ""));
          if (n === null || Number.isFinite(n)) onValider(n);
          setV(null);
        }}
      />
    </label>
  );
}

function Texte({ titre, valeur, onValider, type, large }: { titre: string; valeur: string; onValider(v: string): void; type?: string; large?: boolean }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <label className={large ? "champ-c large" : "champ-c"}>
      <span>{titre}</span>
      <input type={type ?? "text"} value={v ?? valeur} onChange={(e) => setV(e.target.value)} onBlur={() => (v !== null && v !== valeur && onValider(v), setV(null))} />
    </label>
  );
}

/** Fiche d'une éprouvette : ce qui permet de trier, de grouper et de calculer la contrainte. */
export function FicheEprouvette({ e, materiauCampagne, ecrire }: { e: Essai; materiauCampagne: string; ecrire(m: Partial<Essai>): void }) {
  const f = e.fiche;
  const fiche = (m: Partial<Eprouvette>) => ecrire({ fiche: { ...f, ...m } });
  const s = sectionDe(f);
  return (
    <div className="grille-c ts-fiche">
      <Texte titre="Éprouvette (repère)" valeur={e.eprouvette} onValider={(v) => ecrire({ eprouvette: v })} />
      <Texte titre={`Matériau / formulation${materiauCampagne ? ` (vide : ${materiauCampagne})` : ""}`} valeur={f.materiau} onValider={(v) => fiche({ materiau: v })} />
      <Texte titre="Vieillissement" valeur={f.vieillissement} onValider={(v) => fiche({ vieillissement: v })} />
      <Nombre titre="Teneur en vides" unite="%" valeur={f.vides} onValider={(v) => fiche({ vides: v })} />
      <label className="champ-c">
        <span>Forme</span>
        <select value={f.forme} onChange={(x) => fiche({ forme: x.target.value as Eprouvette["forme"] })}>
          <option value="">—</option>
          <option value="prisme">prisme</option>
          <option value="cylindre">cylindre</option>
        </select>
      </label>
      {f.forme === "cylindre" ? (
        <Nombre titre="Diamètre" unite="mm" valeur={f.diametre} onValider={(v) => fiche({ diametre: v })} />
      ) : (
        <>
          <Nombre titre="Largeur" unite="mm" valeur={f.largeur} onValider={(v) => fiche({ largeur: v })} />
          <Nombre titre="Épaisseur" unite="mm" valeur={f.epaisseur} onValider={(v) => fiche({ epaisseur: v })} />
        </>
      )}
      <Nombre titre="Longueur" unite="mm" valeur={f.longueur} onValider={(v) => fiche({ longueur: v })} />
      <Nombre titre={`Section${f.section === null && s !== null ? ` (calculée : ${nf(s, 1)})` : ""}`} unite="mm²" valeur={f.section} onValider={(v) => fiche({ section: v })} />
      <Nombre titre="Refroidissement de consigne" unite="°C/h" valeur={f.consigne} onValider={(v) => fiche({ consigne: v })} />
      <Texte titre="Fabriquée le" type="date" valeur={f.fabrication} onValider={(v) => fiche({ fabrication: v })} />
      <Texte titre="Motif / réserve" valeur={e.motif} onValider={(v) => ecrire({ motif: v })} large />
    </div>
  );
}

function SelectValidite({ valeur, onChange }: { valeur: string; onChange(v: string): void }) {
  return (
    <select className={`ts-validite ts-v-${valeur || "ajuger"}`} value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Validité">
      {VALIDITES.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Section « Essais TSRST » d'une campagne : fiches, dépouillements, comparaison des essais de la campagne. */
export function SectionTsrst({ ctx, c, rafraichir, signaler }: { ctx: Contexte; c: CampagneChargee; rafraichir(): void; signaler(niveau: "info" | "erreur", texte: string): void }) {
  const fs = ctx.espace!.fichiers;
  const [temperatures] = useTemperatures(ctx);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [comparer, setComparer] = useState(false);
  const [enCours, setEnCours] = useState<string | null>(null);
  const noms = Object.keys(c.essais).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  const lignes = useMemo(() => lignesTsrst([{ ...sourceDe(c), type: "tsrst" }]), [c]);

  async function depouiller(liste: string[]) {
    const erreurs: string[] = [];
    const avert: string[] = [];
    for (const nom of liste) {
      setEnCours(nom);
      try {
        const r = await depouillerEssai(ctx, c, nom, temperatures);
        avert.push(...r.avertissements.map((a) => `${nom} : ${a}`));
      } catch (e) {
        erreurs.push(`${nom} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setEnCours(null);
    rafraichir();
    if (erreurs.length) signaler("erreur", `${liste.length - erreurs.length} essai(s) dépouillé(s). ${erreurs.join(" ")}`);
    else signaler("info", `${liste.length} essai(s) dépouillé(s).${avert.length ? ` ${avert.join(" ")}` : ""}`);
  }

  const ecrire = (nom: string) => (m: Partial<Essai>) =>
    void enregistrerEssai(fs, c.slug, nom, { ...c.essais[nom]!, ...m })
      .then(rafraichir)
      .catch((e: unknown) => signaler("erreur", e instanceof Error ? e.message : String(e)));

  if (!noms.length) return null;
  return (
    <Section
      titre="TSRST : éprouvettes et résultats"
      aDroite={
        <span className="rangee">
          <button
            type="button"
            className="principal"
            disabled={!c.campagne.donnees || enCours !== null}
            onClick={() => void depouiller(noms)}
            title="Lit l'export de chaque essai et range ses résultats dans l'espace"
          >
            {enCours ? `Dépouillement : ${enCours}…` : "Tout dépouiller"}
          </button>
          <button type="button" disabled={!Object.keys(c.tsrst).length} onClick={() => setComparer((x) => !x)}>
            {comparer ? "Masquer σ(T)" : "Superposer σ(T)"}
          </button>
        </span>
      }
    >
      <table className="tableau ts-tableau">
        <thead>
          <tr>
            <th>Essai</th>
            <th>Éprouvette</th>
            <th>Matériau</th>
            <th>Section</th>
            <th title="Température à la rupture">T rupt.</th>
            <th title="Contrainte à la rupture">σ rupt.</th>
            <th title="Température de transition (coude de σ(T))">T trans.</th>
            <th title="Pente de σ(T) sous la transition">Pente</th>
            {temperatures.map((t) => (
              <th key={t}>σ à {t} °C</th>
            ))}
            <th>Validité</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {noms.map((nom) => {
            const e = c.essais[nom]!;
            const l = lignes.find((x) => x.essai === nom)!;
            const r = c.tsrst[nom];
            return [
              <tr key={nom} className={e.validite === "ecarte" ? "ts-ecarte" : undefined}>
                <td>
                  <strong>{nom}</strong>
                </td>
                <td>{e.eprouvette || <span className="discret">—</span>}</td>
                <td>{l.materiau || <span className="discret">—</span>}</td>
                <td className="nowrap">
                  {l.section === null ? (
                    <span className="texte-erreur" title="Renseignez les dimensions dans la fiche">
                      ?
                    </span>
                  ) : (
                    `${nf(l.section, 0)} mm²`
                  )}
                </td>
                <td className="nowrap">{r ? `${nf(r.rupture.temperature)} °C` : "—"}</td>
                <td className="nowrap">
                  {r ? `${nf(r.rupture.contrainte, 2)} MPa` : "—"}
                  {r && !r.rompu ? (
                    <span className="texte-erreur" title="Pas de rupture nette">
                      {" "}
                      *
                    </span>
                  ) : null}
                </td>
                <td className="nowrap">{r?.transition ? `${nf(r.transition.temperature)} °C` : "—"}</td>
                <td className="nowrap">{r?.transition ? `${nf(r.transition.pente, 3)}` : "—"}</td>
                {temperatures.map((t) => (
                  <td key={t} className="nowrap">
                    {nf(valeurColonne(l, `aT:${t}`) as number | null, 2)}
                  </td>
                ))}
                <td>
                  <SelectValidite valeur={e.validite} onChange={(v) => ecrire(nom)({ validite: v })} />
                </td>
                <td className="nowrap">
                  <button type="button" onClick={() => setOuverte(ouverte === nom ? null : nom)}>
                    {ouverte === nom ? "Fermer" : "Fiche"}
                  </button>{" "}
                  <button
                    type="button"
                    disabled={!c.campagne.donnees || enCours !== null}
                    onClick={() => void depouiller([nom])}
                    title={r ? `Dépouillé le ${r.calculeLe} ; recalculer` : "Calculer les résultats"}
                  >
                    {r ? "↻" : "Dépouiller"}
                  </button>
                </td>
              </tr>,
              ouverte === nom ? (
                <tr key={`${nom}-fiche`} className="ts-fiche-ligne">
                  <td colSpan={11 + temperatures.length}>
                    <FicheEprouvette e={e} materiauCampagne={c.campagne.materiau} ecrire={ecrire(nom)} />
                    {r ? (
                      <p className="discret petit">
                        Dépouillé le {r.calculeLe} depuis {r.fichier} · température : {r.voieTemperature} · effort : {r.voieEffort}
                        {r.section !== null ? ` · section ${nf(r.section, 1)} mm²` : ""} · départ {nf(r.depart)} °C
                        {r.transition ? ` · pente au-dessus de la transition ${nf(r.transition.penteAvant, 3)} MPa/°C (R² ${nf(r.transition.r2, 3)})` : ""}
                        {r.avertissements.length ? ` · ${r.avertissements.join(" ")}` : ""}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
      <p className="discret petit">
        Section, dimensions et matériau : bouton « Fiche ». Contrainte = force / section ; transition = coude de σ(T) (ajustement bilinéaire) ; pente en MPa par °C de refroidissement. Les résultats et
        la courbe σ(T) sont rangés dans l'espace : ils restent lisibles sans les données brutes.
      </p>
      {comparer ? <Courbes panneaux={[panneauComparaison(lignes.filter((l) => l.validite !== "ecarte"))]} xLibelle="température (°C)" /> : null}
    </Section>
  );
}

type Colonne = {
  id: ColonneTsrst;
  titre: string;
  nombre?: boolean;
  d?: number;
  info?: string;
};

/** Tous les essais TSRST, toutes campagnes confondues. */
export function EssaisTsrst({ ctx, campagnes, ouvrir }: { ctx: Contexte; campagnes: CampagneChargee[]; ouvrir(slug: string): void }) {
  const [temperatures, setTemperatures] = useTemperatures(ctx);
  const [tri, setTri] = useState<{ c: ColonneTsrst; sens: 1 | -1 }>({
    c: "Trupture",
    sens: 1,
  });
  const [texte, setTexte] = useState("");
  const [materiau, setMateriau] = useState("");
  const [vieillissement, setVieillissement] = useState("");
  const [sansEcartes, setSansEcartes] = useState(true);
  const [depouillesSeuls, setDepouillesSeuls] = useState(false);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [groupePar, setGroupePar] = useState<"materiau" | "vieillissement" | "campagne">("materiau");
  const [message, setMessage] = useState<{
    niveau: "info" | "erreur";
    texte: string;
  } | null>(null);
  const [saisieT, setSaisieT] = useState<string | null>(null);

  const toutes = useMemo(() => lignesTsrst(campagnes.map(sourceDe)), [campagnes]);
  const cle = (l: LigneTsrst) => `${l.slug}/${l.essai}`;
  const materiaux = [...new Set(toutes.map((l) => l.materiau).filter(Boolean))].sort();
  const vieillissements = [...new Set(toutes.map((l) => l.vieillissement).filter(Boolean))].sort();
  const visibles = useMemo(
    () =>
      trier(
        toutes.filter(
          (l) =>
            (!materiau || l.materiau === materiau) &&
            (!vieillissement || l.vieillissement === vieillissement) &&
            (!sansEcartes || l.validite !== "ecarte") &&
            (!depouillesSeuls || l.resultats) &&
            (!texte.trim() || correspond([l.campagne, l.essai, l.eprouvette, l.materiau, l.vieillissement, l.motif].join(" "), texte)),
        ),
        tri.c,
        tri.sens,
      ),
    [toutes, materiau, vieillissement, sansEcartes, depouillesSeuls, texte, tri],
  );
  const comparees = (choix.size ? visibles.filter((l) => choix.has(cle(l))) : visibles).filter((l) => l.resultats);
  const groupes = useMemo(() => grouperTsrst(visibles, (l) => (groupePar === "campagne" ? l.campagne : l[groupePar]), temperatures), [visibles, groupePar, temperatures]);
  const libelleGroupe = groupePar === "materiau" ? "Matériau" : groupePar === "vieillissement" ? "Vieillissement" : "Campagne";

  const colonnes: Colonne[] = [
    { id: "campagne", titre: "Campagne" },
    { id: "essai", titre: "Essai" },
    { id: "eprouvette", titre: "Éprouvette" },
    { id: "materiau", titre: "Matériau" },
    { id: "vieillissement", titre: "Vieillissement" },
    { id: "vides", titre: "Vides (%)", nombre: true, d: 1 },
    { id: "date", titre: "Date" },
    {
      id: "Trupture",
      titre: "T rupt. (°C)",
      nombre: true,
      d: 1,
      info: "Température à la rupture",
    },
    {
      id: "Srupture",
      titre: "σ rupt. (MPa)",
      nombre: true,
      d: 2,
      info: "Contrainte à la rupture",
    },
    {
      id: "Ttransition",
      titre: "T trans. (°C)",
      nombre: true,
      d: 1,
      info: "Température de transition",
    },
    {
      id: "pente",
      titre: "Pente (MPa/°C)",
      nombre: true,
      d: 3,
      info: "Pente de σ(T) sous la transition",
    },
    ...temperatures.map(
      (t): Colonne => ({
        id: `aT:${t}`,
        titre: `σ à ${t} °C`,
        nombre: true,
        d: 2,
      }),
    ),
    { id: "validite", titre: "Validité" },
  ];

  async function exporter() {
    const octets = ecrireClasseur(feuillesTsrst(visibles, temperatures, groupes, libelleGroupe));
    const ok = await ctx.plateforme.enregistrerSous(`Essais TSRST ${aujourdhui()}.xlsx`, octets);
    if (ok)
      setMessage({
        niveau: "info",
        texte: `${visibles.length} essai(s) exporté(s) : feuilles Essais, Synthèse (par ${libelleGroupe.toLowerCase()}) et Courbes σ(T).`,
      });
  }

  async function versFigures() {
    try {
      const titre = `TSRST — contrainte thermique (${comparees.length} essais)`;
      const r = await renduComparaison(comparees, titre);
      const origine: OrigineComparaison = {
        module: "campagnes",
        comparaison: comparees.map((l) => ({
          campagne: l.slug,
          essai: l.essai,
        })),
        titre,
      };
      const dossier = await ctx.registre.executer("figures.enregistrer-image", {
        ctx,
        titre,
        ...r,
        source: "Campagnes : comparaison d'essais TSRST",
        tags: ["TSRST", ...new Set(comparees.map((l) => l.materiau).filter(Boolean))],
        origine,
      });
      setMessage({
        niveau: "info",
        texte: `Figure enregistrée : ${String(dossier)}. « Régénérer » la refait depuis les dépouillements (après un nouveau dépouillement par exemple).`,
      });
    } catch (e) {
      setMessage({
        niveau: "erreur",
        texte: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const basculer = (l: LigneTsrst) => setChoix((s) => (s.has(cle(l)) ? new Set([...s].filter((x) => x !== cle(l))) : new Set([...s, cle(l)])));
  const sansResultat = toutes.filter((l) => !l.resultats).length;

  if (!toutes.length)
    return (
      <div className="carte">
        <p>Aucun essai TSRST.</p>
        <p className="discret">Une campagne de type TSRST, ses essais découverts dans les données brutes, puis « Tout dépouiller » dans sa page : ses essais apparaissent ici.</p>
      </div>
    );

  return (
    <>
      {message ? <Message niveau={message.niveau}>{message.texte}</Message> : null}
      <div className="filtres">
        <input className="recherche" type="search" placeholder="Rechercher (campagne, éprouvette, matériau, motif)…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <select value={materiau} onChange={(e) => setMateriau(e.target.value)} aria-label="Matériau">
          <option value="">Tous les matériaux</option>
          {materiaux.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        {vieillissements.length ? (
          <select value={vieillissement} onChange={(e) => setVieillissement(e.target.value)} aria-label="Vieillissement">
            <option value="">Tous les vieillissements</option>
            {vieillissements.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        ) : null}
        <label className="rangee petit">
          <input type="checkbox" checked={sansEcartes} onChange={(e) => setSansEcartes(e.target.checked)} /> sans les écartés
        </label>
        <label className="rangee petit">
          <input type="checkbox" checked={depouillesSeuls} onChange={(e) => setDepouillesSeuls(e.target.checked)} /> dépouillés seulement
        </label>
        <label className="rangee petit" title="Températures où relever la contrainte, séparées par « ; » (réglage commun aux deux PC)">
          σ à
          <input
            className="ts-temperatures"
            value={saisieT ?? temperatures.join(" ; ")}
            onChange={(e) => setSaisieT(e.target.value)}
            onBlur={() => {
              if (saisieT === null) return;
              const t = [
                ...new Set(
                  saisieT
                    .split(/[;\s]+/)
                    .map((x) => Number(x.replace(",", ".").replace("−", "-")))
                    .filter((x) => Number.isFinite(x) && x > -80 && x < 40),
                ),
              ];
              if (t.length) setTemperatures(t);
              setSaisieT(null);
            }}
          />
          °C
        </label>
      </div>
      {sansResultat ? <p className="discret petit">{sansResultat} essai(s) pas encore dépouillé(s) : ouvrez leur campagne, « Tout dépouiller ».</p> : null}
      <div className="ts-defilement">
        <table className="tableau ts-tableau cliquable">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Tout choisir"
                  checked={choix.size > 0 && visibles.every((l) => choix.has(cle(l)))}
                  onChange={(e) => setChoix(e.target.checked ? new Set(visibles.map(cle)) : new Set())}
                />
              </th>
              {colonnes.map((c) => (
                <th
                  key={c.id}
                  title={c.info ? `${c.info} — trier` : "Trier"}
                  className={`ts-triable${tri.c === c.id ? " actif" : ""}`}
                  onClick={() =>
                    setTri((t) => ({
                      c: c.id,
                      sens: t.c === c.id ? (t.sens === 1 ? -1 : 1) : 1,
                    }))
                  }
                >
                  {c.titre}
                  {tri.c === c.id ? (tri.sens === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => (
              <tr key={cle(l)} className={l.validite === "ecarte" ? "ts-ecarte" : undefined} onClick={() => basculer(l)}>
                <td>
                  <input type="checkbox" checked={choix.has(cle(l))} onChange={() => basculer(l)} onClick={(e) => e.stopPropagation()} aria-label={`Choisir ${l.essai}`} />
                </td>
                {colonnes.map((c) => {
                  const v = valeurColonne(l, c.id);
                  if (c.id === "campagne")
                    return (
                      <td key={c.id}>
                        <button type="button" className="lien" onClick={(e) => (e.stopPropagation(), ouvrir(l.slug))} title="Ouvrir la campagne">
                          {l.campagne}
                        </button>
                      </td>
                    );
                  if (c.id === "validite")
                    return (
                      <td key={c.id} className={`ts-v-${l.validite || "ajuger"}`} title={l.motif || undefined}>
                        {VALIDITES.find(([x]) => x === l.validite)?.[1]}
                      </td>
                    );
                  return (
                    <td key={c.id} className={c.nombre ? "nombre nowrap" : undefined}>
                      {c.nombre ? nf(v as number | null, c.d) : v || <span className="discret">—</span>}
                      {c.id === "Srupture" && l.resultats && !l.resultats.rompu ? (
                        <span className="texte-erreur" title="Pas de rupture nette">
                          {" "}
                          *
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="discret petit">Clic sur un titre : trier (deuxième clic : sens inverse). Cochez des essais pour les comparer (sinon : tous ceux affichés). * : pas de rupture nette.</p>

      <Section
        titre={`Moyennes par ${libelleGroupe.toLowerCase()}`}
        aDroite={
          <span className="segmente">
            {(["materiau", "vieillissement", "campagne"] as const).map((g) => (
              <button key={g} type="button" className={groupePar === g ? "actif" : undefined} onClick={() => setGroupePar(g)}>
                {g === "materiau" ? "Matériau" : g === "vieillissement" ? "Vieillissement" : "Campagne"}
              </button>
            ))}
          </span>
        }
      >
        {groupes.length ? (
          <table className="tableau ts-tableau">
            <thead>
              <tr>
                <th>{libelleGroupe}</th>
                <th>Essais</th>
                <th>T rupture (°C)</th>
                <th>σ rupture (MPa)</th>
                <th>T transition (°C)</th>
                <th>Pente (MPa/°C)</th>
                {temperatures.map((t) => (
                  <th key={t}>σ à {t} °C</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupes.map((g) => {
                const ms = (
                  s: {
                    moyenne: number | null;
                    ecartType: number | null;
                    n: number;
                  },
                  d: number,
                ) => (s.n ? `${nf(s.moyenne, d)}${s.ecartType !== null ? ` ± ${nf(s.ecartType, d)}` : ""}` : "—");
                return (
                  <tr key={g.cle}>
                    <td>
                      <strong>{g.cle}</strong>
                    </td>
                    <td>{g.essais}</td>
                    <td className="nombre nowrap">{ms(g.Trupture, 1)}</td>
                    <td className="nombre nowrap">{ms(g.Srupture, 2)}</td>
                    <td className="nombre nowrap">{ms(g.Ttransition, 1)}</td>
                    <td className="nombre nowrap">{ms(g.pente, 3)}</td>
                    {g.aT.map((x) => (
                      <td key={x.temperature} className="nombre nowrap">
                        {ms(x.stat, 2)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="discret">Aucun essai dépouillé et valide dans la sélection.</p>
        )}
        <p className="discret petit">Moyenne ± écart-type (échantillon) des essais dépouillés affichés ; les essais écartés n'y entrent jamais.</p>
      </Section>

      <Section
        titre={`Courbes σ(T) (${comparees.length} essai${comparees.length > 1 ? "s" : ""})`}
        aDroite={
          <span className="rangee">
            <button type="button" onClick={() => void exporter()} title="Essais, moyennes et courbes σ(T) dans un classeur">
              Exporter en Excel
            </button>
            {ctx.registre.aAction("figures.enregistrer-image") ? (
              <button type="button" disabled={!comparees.length} onClick={() => void versFigures()}>
                Enregistrer dans Figures
              </button>
            ) : null}
          </span>
        }
      >
        {comparees.length ? (
          comparees.length > 12 ? (
            <p className="discret">{comparees.length} courbes : cochez-en 12 au plus pour les superposer lisiblement.</p>
          ) : (
            <Courbes key={comparees.map(cle).join("|")} panneaux={[panneauComparaison(comparees)]} xLibelle="température (°C)" />
          )
        ) : (
          <p className="discret">Aucun essai dépouillé dans la sélection.</p>
        )}
      </Section>
    </>
  );
}
