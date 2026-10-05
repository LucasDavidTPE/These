/** Vues de la bibliothèque : tableau de bord, références, plan de lecture (SPEC §9.2). */
import { useEffect, useMemo, useState } from "react";
import { correspond } from "@noyau/texte";
import { Section } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { libelleMois, type Calcule } from "../core/calculs";
import { lienARevoir } from "../core/liens";
import { etatPdf, type EtatPdf } from "../core/pdf";
import { PRIORITES, STATUTS } from "../core/modele";
import { PastilleEtat } from "./commun";
import { FILTRES_VIDES, pourcent, type Filtres } from "./format";
import { lirePdfsPresents, type Biblio } from "./donnees";

function Tuile({ valeur, titre, niveau }: { valeur: string | number; titre: string; niveau?: "attention" | "erreur" }) {
  return (
    <div className={`tuile${niveau ? ` tuile-${niveau}` : ""}`}>
      <div className="tuile-valeur">{valeur}</div>
      <div className="discret">{titre}</div>
    </div>
  );
}

export function TableauDeBordVue({ b, ouvrir }: { b: Biblio; ouvrir(id: string): void }) {
  const t = b.tb;
  const liensMorts = b.references.filter((r) => lienARevoir(r.valeur.etatLien));
  return (
    <>
      {liensMorts.length ? (
        <div className="message message-attention">
          <strong>Liens à revoir ({liensMorts.length}) :</strong>{" "}
          {liensMorts.map((r) => (
            <button key={r.id} type="button" className="lien" title={`${r.valeur.etatLien} — contrôlé le ${r.valeur.lienControleLe}`} onClick={() => ouvrir(r.id)}>
              {r.id}
            </button>
          ))}
        </div>
      ) : null}
      {b.doublons.length ? (
        <div className="message message-attention">
          <strong>Doublons possibles :</strong>{" "}
          {b.doublons.map((d) => (
            <span key={d.motif + d.valeur}>
              {d.motif} identique pour{" "}
              {d.ids.map((id) => (
                <button key={id} type="button" className="lien" onClick={() => ouvrir(id)}>
                  {id}
                </button>
              ))}
              {" · "}
            </span>
          ))}
        </div>
      ) : null}
      <div className="message message-info">
        <strong>Mois {t.libelleMoisCourant}</strong> · {t.heuresRestantesMois} h de lecture restantes ce mois-ci pour {t.parMois[0]?.capacite ?? b.parametres.capaciteHeures} h de capacité ·{" "}
        {t.charge} · <strong>Prochaine action :</strong> {t.prochaineAction}
      </div>
      <div className="tuiles">
        <Tuile valeur={t.total} titre={`références, dont ${t.tfe} du TFE`} />
        <Tuile valeur={`${t.lues} / ${t.total}`} titre={`lues (${pourcent(t.tauxLecture)})`} />
        <Tuile valeur={t.ceMois} titre="à lire ce mois-ci" niveau={t.ceMois ? "attention" : undefined} />
        <Tuile valeur={t.enRetard} titre="en retard" niveau={t.enRetard ? "erreur" : undefined} />
        <Tuile valeur={t.pdfLibresATelecharger} titre="PDF libres à télécharger" />
        <Tuile valeur={t.demandesAEnvoyer} titre="demandes à envoyer ou relancer" niveau={t.demandesAEnvoyer ? "erreur" : undefined} />
        <Tuile valeur={`${t.verifiees} / ${t.total}`} titre={`vérifiées (${t.partielles} partielles, ${t.nonVerifiees} non)`} />
        <Tuile valeur={t.correctionsRestantes} titre="corrections du TFE restantes" />
      </div>

      <Section titre="Prochaines lectures conseillées">
        <table className="tableau cliquable">
          <thead>
            <tr>
              <th>Rang</th>
              <th>Citation</th>
              <th>Titre</th>
              <th>Priorité</th>
              <th>Mois</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {t.prochaines.map((c, i) => (
              <tr key={c.id} onClick={() => ouvrir(c.id)}>
                <td>{i + 1}</td>
                <td>{c.citation}</td>
                <td>{c.ref.titre}</td>
                <td>{c.ref.priorite}</td>
                <td>{c.ref.mois}</td>
                <td>{c.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="deux-colonnes">
        <Section titre="Avancement par mois">
          <table className="tableau">
            <thead>
              <tr>
                <th>Mois</th>
                <th>Réf.</th>
                <th>Lues</th>
                <th>Heures prévues</th>
                <th>Charge</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {t.parMois.map((m) => (
                <tr key={m.numero}>
                  <td>
                    {m.numero} — {m.libelle}
                  </td>
                  <td>{m.total}</td>
                  <td>{m.lues}</td>
                  <td>
                    {m.heuresRestantes} / {m.heuresPrevues} h
                  </td>
                  <td className={m.charge > 1 ? "texte-attention" : undefined}>{pourcent(m.charge)}</td>
                  <td>
                    <PastilleEtat etat={m.etat} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section titre="Avancement par axe">
          <table className="tableau">
            <thead>
              <tr>
                <th>Axe</th>
                <th>Réf.</th>
                <th>Incont.</th>
                <th>Lues</th>
                <th>Heures restantes</th>
              </tr>
            </thead>
            <tbody>
              {t.parAxe.map((a) => (
                <tr key={a.numero}>
                  <td>
                    {a.numero}. {a.intitule}
                  </td>
                  <td>{a.total}</td>
                  <td>{a.incontournables}</td>
                  <td>{pourcent(a.partLue)}</td>
                  <td>{a.heuresRestantes} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
    </>
  );
}

const manque = (e: EtatPdf) => e !== "present";

function filtrer(calc: Calcule[], f: Filtres, pdfs: ReadonlySet<string> | null): Calcule[] {
  const out = calc.filter(
    (c) =>
      (!f.pdf || (f.pdf === "manquant" ? manque(etatPdf(c.ref.fichierPdf, pdfs)) && c.ref.statut !== "Écarté" : !manque(etatPdf(c.ref.fichierPdf, pdfs)))) &&
      (!f.axe || String(c.ref.axe) === f.axe) &&
      (!f.mois || String(c.ref.mois) === f.mois) &&
      (!f.statut || c.ref.statut === f.statut) &&
      (!f.priorite || c.ref.priorite === f.priorite) &&
      (!f.etat || c.etat === f.etat) &&
      correspond(`${c.id} ${c.ref.cle} ${c.citation} ${c.ref.titre} ${c.ref.auteurs} ${c.ref.support} ${c.ref.commentaire} ${c.ref.categories.join(" ")}`, f.texte),
  );
  return f.tri === "score" ? out.sort((a, b) => b.scoreTri - a.scoreTri) : out;
}

/** Noms des PDF présents dans `bibliotheque/pdf` (null tant que le disque n'a pas répondu). */
function usePdfsPresents(b: Biblio): ReadonlySet<string> | null {
  const ctx = useContexte();
  const dossier = ctx.racines["biblio-pdf"];
  const [presents, setPresents] = useState<{ pour: Biblio; noms: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    if (!dossier) return;
    let annule = false;
    void lirePdfsPresents(
      ctx.plateforme.fichiers(dossier),
      b.references.map((r) => ({ ref: r.valeur })),
    ).then((noms) => !annule && setPresents({ pour: b, noms }));
    return () => {
      annule = true;
    };
  }, [b, dossier, ctx.plateforme]);
  return presents?.noms ?? null;
}

function CellulePdf({ c, pdfs }: { c: Calcule; pdfs: ReadonlySet<string> | null }) {
  const e = etatPdf(c.ref.fichierPdf, pdfs);
  if (e === "present")
    return (
      <span className="pdf-ok" title={c.ref.fichierPdf}>
        ✓
      </span>
    );
  const comment = [c.ref.accesDocument, c.ref.commentObtenir].filter(Boolean).join(" — ");
  return (
    <span className="pdf-manque" title={e === "introuvable" ? `« ${c.ref.fichierPdf} » est noté mais absent de bibliotheque\\pdf` : comment || "Aucun PDF"}>
      {e === "introuvable" ? "introuvable" : "manque"}
      {c.ref.accesDocument ? <span className="discret petit"> · {c.ref.accesDocument}</span> : null}
    </span>
  );
}

export function ReferencesVue({ b, ouvrir, filtres, setFiltres }: { b: Biblio; ouvrir(id: string): void; filtres: Filtres; setFiltres(f: Filtres): void }) {
  const pdfs = usePdfsPresents(b);
  const visibles = useMemo(() => filtrer(b.calc, filtres, pdfs), [b.calc, filtres, pdfs]);
  const sansPdf = useMemo(() => b.calc.filter((c) => manque(etatPdf(c.ref.fichierPdf, pdfs)) && c.ref.statut !== "Écarté").length, [b.calc, pdfs]);
  const f = filtres;
  const maj = (k: keyof Filtres) => (e: { target: { value: string } }) => setFiltres({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="filtres">
        <input type="text" className="champ recherche" placeholder="Rechercher (auteur, titre, clé, catégorie…)" value={f.texte} onChange={maj("texte")} />
        <select className="champ" value={f.axe} onChange={maj("axe")}>
          <option value="">Tous les axes</option>
          {b.parametres.axes.map((a) => (
            <option key={a.numero} value={a.numero}>
              {a.numero}. {a.intitule}
            </option>
          ))}
        </select>
        <select className="champ" value={f.mois} onChange={maj("mois")}>
          <option value="">Tous les mois</option>
          {Array.from({ length: b.parametres.nbMois }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1} — {libelleMois(i + 1, b.parametres)}
            </option>
          ))}
        </select>
        <select className="champ" value={f.statut} onChange={maj("statut")}>
          <option value="">Tous statuts</option>
          {STATUTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="champ" value={f.priorite} onChange={maj("priorite")}>
          <option value="">Toutes priorités</option>
          {PRIORITES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="champ" value={f.etat} onChange={maj("etat")}>
          <option value="">Tous états</option>
          {["EN RETARD", "Ce mois-ci", "Mois prochain", "À venir", "Lu", "Écarté"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="champ" value={f.pdf} onChange={maj("pdf")} aria-label="PDF">
          <option value="">PDF : tous</option>
          <option value="manquant">PDF manquant (hors écartés)</option>
          <option value="present">PDF dans l'espace</option>
        </select>
        <select className="champ" value={f.tri} onChange={maj("tri")}>
          <option value="id">Ordre du plan</option>
          <option value="score">Quoi lire maintenant (score)</option>
        </select>
        <span className="discret">
          {visibles.length} / {b.calc.length}
        </span>
        {sansPdf && f.pdf !== "manquant" ? (
          <button type="button" className="lien" onClick={() => setFiltres({ ...f, pdf: "manquant" })} title="Références sans PDF dans l'espace (hors écartées)">
            {sansPdf} sans PDF
          </button>
        ) : null}
        {JSON.stringify(f) !== JSON.stringify(FILTRES_VIDES) ? (
          <button type="button" className="lien" onClick={() => setFiltres(FILTRES_VIDES)}>
            Tout afficher
          </button>
        ) : null}
      </div>
      <table className="tableau cliquable references">
        <thead>
          <tr>
            <th>ID</th>
            <th>Citation</th>
            <th>Titre</th>
            <th>Axe</th>
            <th>Priorité</th>
            <th>Mois</th>
            <th>État</th>
            <th>Score</th>
            <th>Alerte</th>
            <th>PDF</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((c) => (
            <tr key={c.id} onClick={() => ouvrir(c.id)} className={c.ref.statut === "Lu" ? "lue" : undefined}>
              <td className="chemin">{c.id}</td>
              <td className="nowrap">{c.citation}</td>
              <td>{c.ref.titre}</td>
              <td>{c.ref.axe}</td>
              <td className={c.ref.priorite === "INCONTOURNABLE" ? "gras" : undefined}>{c.ref.priorite}</td>
              <td>{c.ref.mois}</td>
              <td>
                <PastilleEtat etat={c.etat} />
              </td>
              <td>{c.score || ""}</td>
              <td className="discret petit">{c.alerte}</td>
              <td className="nowrap">
                <CellulePdf c={c} pdfs={pdfs} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function PlanVue({ b, ouvrir }: { b: Biblio; ouvrir(id: string): void }) {
  const [ouverts, setOuverts] = useState<Set<number>>(() => new Set([b.tb.moisCourant]));
  return (
    <>
      {b.tb.parMois.map((m) => {
        const obj = b.parametres.objectifs[String(m.numero)];
        const refs = b.calc.filter((c) => c.ref.mois === m.numero);
        const ouvert = ouverts.has(m.numero);
        return (
          <div key={m.numero} className="carte mois">
            <button
              type="button"
              className="mois-entete"
              onClick={() => setOuverts((s) => (s.has(m.numero) ? new Set([...s].filter((x) => x !== m.numero)) : new Set([...s, m.numero])))}
            >
              <strong>
                Mois {m.numero} — {m.libelle}
              </strong>
              {obj?.titre ? <span> : {obj.titre}</span> : null}
              <span className="mois-droite">
                {m.lues}/{m.total} lues · {m.heuresRestantes} h restantes / {m.capacite} h <PastilleEtat etat={m.etat} />
              </span>
            </button>
            {ouvert ? (
              <div className="mois-corps">
                {obj?.finDeMois ? (
                  <p>
                    <strong>À la fin du mois :</strong> {obj.finDeMois}
                  </p>
                ) : null}
                {obj?.aDemander ? (
                  <p>
                    <strong>À demander en amont :</strong> {obj.aDemander}
                  </p>
                ) : null}
                <table className="tableau cliquable">
                  <tbody>
                    {refs.map((c) => (
                      <tr key={c.id} onClick={() => ouvrir(c.id)} className={c.ref.statut === "Lu" ? "lue" : undefined}>
                        <td className="nowrap">{c.citation}</td>
                        <td>{c.ref.titre}</td>
                        <td>{c.ref.priorite}</td>
                        <td>{c.temps} h</td>
                        <td>
                          <PastilleEtat etat={c.etat} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
