/**
 * Rattacher le dépouillement de l'essai affiché à un essai de campagne : il y est enregistré
 * (tri des cycles, cycles écartés, calages, fichier de mesure) et se rouvre depuis la campagne.
 * Passe par les actions du module Campagnes ; l'ancien enregistrement autonome est rangé.
 */
import { useEffect, useState } from "react";
import { useContexte } from "@interface/contexte";
import type { Essai } from "../core/essai";
import { useTraitement } from "./etat";
import { oublier } from "./demande";
import { deplacerEnregistrement } from "./sauvegarde";

interface CampagneListee {
  slug: string;
  titre: string;
  essais: string[];
  depouilles?: string[];
}

const NOUVEL = "__nouvel__";

export function RattacherCampagne({ e, fermer }: { e: Essai; fermer(): void }) {
  const ctx = useContexte();
  const s = useTraitement();
  const [campagnes, setCampagnes] = useState<CampagneListee[] | null>(null);
  const [slug, setSlug] = useState("");
  const [essai, setEssai] = useState(NOUVEL);
  const [nouveau, setNouveau] = useState(e.nom);
  const [aRemplacer, setARemplacer] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void (ctx.registre.executer("campagnes.liste", ctx) as Promise<CampagneListee[]>).then((l) => {
      if (annule) return;
      setCampagnes(l);
      if (l[0]) setSlug(l[0].slug);
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = campagnes?.find((x) => x.slug === slug);
  const nom = essai === NOUVEL ? nouveau.trim() : essai;

  async function rattacher(remplacer: boolean) {
    setErreur(null);
    try {
      const r = (await ctx.registre.executer("campagnes.preparer-essai", { ctx, slug, essai: nom, remplacer })) as { chemin: string; existe: boolean };
      if (r.existe && !remplacer) {
        setARemplacer(r.chemin);
        return;
      }
      await deplacerEnregistrement(ctx, e.id, r.chemin);
      oublier();
      s.maj((x) => (x.campagne = null));
      s.signaler(`Dépouillement rattaché à « ${c?.titre ?? slug} », essai ${nom}${remplacer ? " (l'ancien dépouillement de l'essai est rangé dans .anciens)" : ""}. Il s'enregistre désormais avec l'essai.`);
      ctx.rafraichir();
      fermer();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="tr-rattacher" role="dialog" aria-label="Rattacher à une campagne">
      <strong>Rattacher « {e.nom} » à une campagne</strong>
      <p className="discret">
        Le dépouillement (voies, cycles écartés ou tronqués, calages) et le fichier de mesure sont enregistrés avec l'essai choisi ; il se rouvre ensuite depuis la
        campagne, bouton « 2S2P1D ✓ ».
      </p>
      {campagnes === null ? (
        <p className="discret">Lecture des campagnes…</p>
      ) : campagnes.length === 0 ? (
        <p>Aucune campagne dans l'espace : créez-en une dans le module Campagnes.</p>
      ) : (
        <div className="rangee">
          <label className="tr-champ-lie">
            Campagne{" "}
            <select className="tr-champ" value={slug} onChange={(ev) => (setSlug(ev.target.value), setEssai(NOUVEL), setARemplacer(null))}>
              {campagnes.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.titre}
                </option>
              ))}
            </select>
          </label>
          <label className="tr-champ-lie">
            Essai{" "}
            <select className="tr-champ" value={essai} onChange={(ev) => (setEssai(ev.target.value), setARemplacer(null))}>
              <option value={NOUVEL}>Nouvel essai…</option>
              {c?.essais.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {c.depouilles?.includes(n) ? " (déjà dépouillé)" : ""}
                </option>
              ))}
            </select>
          </label>
          {essai === NOUVEL ? <input className="tr-champ" aria-label="Nom du nouvel essai" value={nouveau} onChange={(ev) => (setNouveau(ev.target.value), setARemplacer(null))} /> : null}
        </div>
      )}
      {aRemplacer ? (
        <p className="tr-alerte">
          L'essai {nom} a déjà un dépouillement. Le remplacer ? L'ancien est gardé dans son dossier <code>.anciens</code>.
        </p>
      ) : null}
      {erreur ? <p className="tr-alerte">{erreur}</p> : null}
      <div className="rangee">
        <button type="button" className="principal" disabled={!c || !nom} onClick={() => void rattacher(!!aRemplacer)}>
          {aRemplacer ? "Remplacer" : "Rattacher"}
        </button>
        <button type="button" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}
