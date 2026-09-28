/**
 * Un dépouillement ouvert à la main s'enregistre dans l'espace, son fichier de mesure y est
 * copié, et il se rouvre depuis la liste — y compris sur un poste qui n'a pas les données
 * brutes (plateforme de démonstration, en mémoire).
 */
import { describe, expect, it } from "vitest";
import { FichiersMemoire } from "@noyau/stockage";
import type { Plateforme } from "@interface/plateforme";
import { signalDemo } from "../core/demo";
import { garderDansEspace } from "@interface/donnees";
import { cheminDepouillement } from "../core/depouillement";
import { basculerCycle, appliquerExclusions } from "../core/essai";
import { fichierDepuisOctets } from "../core/io/lecture";
import { chargerFichiers, rouvrirDepouillement } from "../ui/chargement";
import { useTraitement } from "../ui/etat";
import { enregistrer } from "../ui/sauvegarde";

const RECHERCHE = "C:\\Users\\DAVID\\Desktop\\Recherche";
const ESPACE = "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Espace";

describe("enregistrement et réouverture d'un dépouillement", () => {
  it("fichier ouvert à la main → traitement/… → rouvert avec son tri des cycles", async () => {
    // Plateforme en mémoire : l'espace et le dossier de mesures du poste.
    const dossiers = new Map([
      [ESPACE, new FichiersMemoire()],
      [`${RECHERCHE}\\Demo CM\\Essai1`, new FichiersMemoire()],
    ]);
    const table = signalDemo();
    const csv = [table.lignesTexte![0]!.join(";"), ...Array.from({ length: table.n }, (_, i) => table.colonnes.map((c) => String(c[i])).join(";"))].join("\n");
    await dossiers.get(`${RECHERCHE}\\Demo CM\\Essai1`)!.writeTextAtomic("Essai1.steps.tracking.csv", csv);
    const plateforme = { fichiers: (r: string) => dossiers.get(r)!, dossierExiste: async (r: string) => dossiers.has(r) } as unknown as Plateforme;
    const ctx = { plateforme, espace: { racine: ESPACE, fichiers: plateforme.fichiers(ESPACE) }, racines: { recherche: RECHERCHE }, poste: "PC-TEST" };
    const chemin = `${RECHERCHE}\\Demo CM\\Essai1\\Essai1.steps.tracking.csv`;
    const octets = await plateforme.fichiers(`${RECHERCHE}\\Demo CM\\Essai1`).readBytes("Essai1.steps.tracking.csv");
    const source = await garderDansEspace(ctx, chemin, octets);
    expect(await ctx.espace.fichiers.exists("donnees/recherche/Demo CM/Essai1/Essai1.steps.tracking.csv")).toBe(true);
    await chargerFichiers([fichierDepuisOctets("Essai1.steps.tracking.csv", octets)], true, (e) => {
      e.source = source;
      e.enregistrement = { chemin: cheminDepouillement(e.nom, e.id), format: "depouillement" };
    });
    const e = useTraitement.getState().essais.at(-1)!;
    expect(e.source).toBe("recherche:Demo CM/Essai1/Essai1.steps.tracking.csv");
    basculerCycle(e, e.paliers[0]!.lignes[2]!, "capteur décroché");
    appliquerExclusions(e);
    expect(await enregistrer(ctx, e)).toBe(true);
    expect(await enregistrer(ctx, e)).toBe(false); // rien n'a changé

    useTraitement.setState({ essais: [], actif: 0 });
    await rouvrirDepouillement(ctx, e.enregistrement!.chemin);
    const r = useTraitement.getState().essais.at(-1)!;
    expect(useTraitement.getState().message).toBeNull();
    expect([...r.exclus]).toEqual([...e.exclus]);
    expect(r.enregistrement).toEqual(e.enregistrement);
    expect(r.synthese[0]!.ecartes).toBe(1);

    // Autre PC : ni la racine « recherche », ni le disque. La copie de l'espace suffit.
    useTraitement.setState({ essais: [], actif: 0 });
    await rouvrirDepouillement({ ...ctx, racines: {} }, e.enregistrement!.chemin);
    expect(useTraitement.getState().message).toBeNull();
    expect(useTraitement.getState().essais.at(-1)!.synthese[0]!.ecartes).toBe(1);
  });

  it("un ancien dépouillement (chemin absolu) est rapatrié dans l'espace à la réouverture", async () => {
    const dossiers = new Map([
      [ESPACE, new FichiersMemoire()],
      ["D:\\clé", new FichiersMemoire()],
    ]);
    const table = signalDemo();
    const csv = [table.lignesTexte![0]!.join(";"), ...Array.from({ length: table.n }, (_, i) => table.colonnes.map((c) => String(c[i])).join(";"))].join("\n");
    await dossiers.get("D:\\clé")!.writeTextAtomic("Essai2.csv", csv);
    const plateforme = { fichiers: (r: string) => dossiers.get(r)!, dossierExiste: async (r: string) => dossiers.has(r) } as unknown as Plateforme;
    const ctx = { plateforme, espace: { racine: ESPACE, fichiers: plateforme.fichiers(ESPACE) }, racines: {}, poste: "PC-TEST" };
    await chargerFichiers([fichierDepuisOctets("Essai2.csv", new TextEncoder().encode(csv))], true, (e) => {
      e.source = "D:\\clé\\Essai2.csv";
      e.enregistrement = { chemin: cheminDepouillement(e.nom, e.id), format: "depouillement" };
    });
    const e = useTraitement.getState().essais.at(-1)!;
    expect(await enregistrer(ctx, e)).toBe(true);

    useTraitement.setState({ essais: [], actif: 0 });
    await rouvrirDepouillement(ctx, e.enregistrement!.chemin);
    expect(useTraitement.getState().message).toBeNull();
    expect(useTraitement.getState().essais.at(-1)!.source).toBe("donnees/importes/Essai2.csv");
    expect(JSON.parse(await ctx.espace.fichiers.readText(e.enregistrement!.chemin)).source).toBe("donnees/importes/Essai2.csv");
  });
});
