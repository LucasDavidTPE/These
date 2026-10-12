import { IconeCampagnes } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { essaisRecents, periode, typeDe } from "./core/modele";
import { CampagnesPage } from "./ui/CampagnesPage";
import { chargerCampagnes, preparerEssaiTraitement } from "./ui/donnees";
import { regenererComparaison, regenererCourbes, type OrigineComparaison, type OrigineCourbes } from "./ui/figure";
import { demanderOuverture } from "@interface/ouverture";

const charger = (ctx: Contexte) => (ctx.espace ? chargerCampagnes(ctx.espace.fichiers) : Promise.resolve(null));

const campagnes: Manifeste = {
  id: "campagnes",
  titre: "Campagnes",
  resume: "Campagnes d'essais, données brutes, notes et photos",
  Icone: IconeCampagnes,
  Page: CampagnesPage,
  etat: async (ctx) => {
    const r = await charger(ctx);
    if (!r || r.campagnes.length === 0) return "Aucune campagne";
    const essais = r.campagnes.reduce((s, c) => s + Object.keys(c.essais).length, 0);
    const enCours = r.campagnes.filter((c) => c.campagne.statut === "en cours").length;
    return `${r.campagnes.length} campagne(s), ${essais} essai(s) · ${enCours} en cours`;
  },
  problemes: async (ctx) => (await charger(ctx))?.problemes ?? [],
  indexer: async (ctx) =>
    ((await charger(ctx))?.campagnes ?? []).flatMap((c) => [
      { id: c.slug, module: "campagnes", genre: "Campagne", titre: c.campagne.titre, detail: `${typeDe(c.campagne.type).libelle} · ${c.campagne.statut}`, mots: `${c.campagne.materiau} ${c.campagne.notes}`, ouvrir: { action: "campagnes.ouvrir", charge: { slug: c.slug } } },
      ...Object.keys(c.essais).map((e) => ({ id: `${c.slug}/${e}`, module: "campagnes", genre: "Essai", titre: e, detail: c.campagne.titre, mots: c.campagne.materiau, ouvrir: { action: "campagnes.ouvrir", charge: { slug: c.slug } } })),
    ]),
  actions: {
    /** Pour les Études : les campagnes auxquelles une étude peut se rattacher. */
    "campagnes.liste": async (ctx) =>
      ((await charger(ctx as Contexte))?.campagnes ?? []).map((c) => ({ slug: c.slug, titre: c.campagne.titre, essais: Object.keys(c.essais).sort((a, b) => a.localeCompare(b, "fr", { numeric: true })), depouilles: c.depouilles })),
    /**
     * Pour le Traitement : prépare l'essai qui recevra un dépouillement 2S2P1D fait ailleurs et
     * renvoie { chemin, existe } ; charge : { ctx, slug, essai, remplacer }.
     */
    "campagnes.preparer-essai": async (charge) => {
      const { ctx, slug, essai, remplacer } = charge as { ctx: Contexte; slug: string; essai: string; remplacer?: boolean };
      if (!ctx.espace) throw new Error("Aucun espace Thèse ouvert.");
      return preparerEssaiTraitement(ctx.espace.fichiers, slug, essai, !!remplacer);
    },
    /** Pour l'Accueil : les derniers essais, toutes campagnes confondues. */
    "campagnes.recents": async (ctx) => {
      const r = await charger(ctx as Contexte);
      return essaisRecents((r?.campagnes ?? []).map((c) => ({ slug: c.slug, titre: c.campagne.titre, essais: c.essais })), 5);
    },
    /** Ouvre une campagne ; charge : { ctx, slug }. */
    "campagnes.ouvrir": async (charge) => {
      const { ctx, slug } = charge as { ctx: Contexte; slug: string };
      demanderOuverture("campagnes", slug);
      ctx.naviguer("campagnes");
    },
    /**
     * Refait une figure : « courbes d'un essai » depuis les données brutes, ou « comparaison σ(T) » d'essais
     * TSRST depuis leurs dépouillements ; charge : { ctx, origine }.
     */
    "campagnes.regenerer-figure": async (charge) => {
      const { ctx, origine } = charge as { ctx: Contexte; origine: OrigineCourbes | OrigineComparaison };
      return "comparaison" in origine ? regenererComparaison(ctx, origine) : regenererCourbes(ctx, origine);
    },
    /** Pour le Planning (SPEC §10.2) : la période réelle (ou prévue) de chaque campagne. */
    "campagnes.planning": async (ctx) => {
      const r = await charger(ctx as Contexte);
      return (r?.campagnes ?? []).flatMap((c) => {
        const p = periode(Object.values(c.essais), c.campagne);
        return p ? [{ id: `campagne-${c.slug}`, titre: c.campagne.titre, debut: p.debut, fin: p.fin, detail: `${typeDe(c.campagne.type).libelle} · ${Object.keys(c.essais).length} essai(s) · ${c.campagne.statut}` }] : [];
      });
    },
  },
};

export default campagnes;
