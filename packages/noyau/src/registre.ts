/**
 * Registre des modules et de leurs actions nommées (SPEC §3).
 *
 * Un module n'importe jamais un autre module. Quand il veut s'en servir (« ouvrir cet essai
 * dans le traitement », « enregistrer ce graphe dans Figures »), il demande une action par
 * son nom. Si le module qui la fournit n'est pas dans l'installeur, l'action n'existe pas
 * et le bouton n'est pas affiché.
 *
 * Pur : le type des manifestes (qui contiennent des composants React) est un paramètre.
 */

export type Gestionnaire = (charge: unknown) => unknown | Promise<unknown>;

export interface ManifesteDeBase {
  id: string;
  /** Actions fournies, par nom complet : « figures.enregistrer ». */
  actions?: Record<string, Gestionnaire>;
}

/** Nom d'action : « module.verbe », en minuscules, tirets permis. */
const NOM_ACTION = /^([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)$/;

export class Registre<M extends ManifesteDeBase> {
  private readonly parId = new Map<string, M>();
  private readonly actions = new Map<string, Gestionnaire>();

  constructor(readonly manifestes: readonly M[]) {
    for (const m of manifestes) {
      if (this.parId.has(m.id)) throw new Error(`Module déclaré deux fois : ${m.id}`);
      this.parId.set(m.id, m);
      for (const [nom, gestionnaire] of Object.entries(m.actions ?? {})) {
        const r = NOM_ACTION.exec(nom);
        if (!r) throw new Error(`Nom d'action invalide dans ${m.id} : « ${nom} » (attendu « module.verbe »).`);
        if (r[1] !== m.id) throw new Error(`Le module ${m.id} ne peut pas déclarer l'action « ${nom} » d'un autre module.`);
        this.actions.set(nom, gestionnaire);
      }
    }
  }

  module(id: string): M | undefined {
    return this.parId.get(id);
  }

  aModule(id: string): boolean {
    return this.parId.has(id);
  }

  /** Vrai si l'action existe dans cet installeur : sert à afficher ou non un bouton. */
  aAction(nom: string): boolean {
    return this.actions.has(nom);
  }

  /** Exécute une action ; erreur claire si elle n'existe pas dans cet installeur. */
  async executer(nom: string, charge?: unknown): Promise<unknown> {
    const g = this.actions.get(nom);
    if (!g) throw new Error(`Action indisponible dans cette version de l'application : ${nom}`);
    return g(charge);
  }
}
