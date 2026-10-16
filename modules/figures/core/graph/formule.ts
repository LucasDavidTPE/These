/**
 * Petites formules sur les colonnes d'un export (« abs(ezz) », « max(e1, 0) », « 0.5*(exx + eyy) », « -w ») :
 * nombres, variables, + − × / ^, parenthèses et fonctions usuelles, évaluées point par point. Aucune
 * évaluation de code : un analyseur dédié, qui refuse tout le reste avec un message clair.
 */

type Noeud =
  | { t: "nombre"; v: number }
  | { t: "variable"; nom: string }
  | { t: "unaire"; op: "-"; a: Noeud }
  | { t: "binaire"; op: "+" | "-" | "*" | "/" | "^"; a: Noeud; b: Noeud }
  | { t: "fonction"; nom: string; args: Noeud[] };

const FONCTIONS: Record<string, { n: [number, number]; f: (...a: number[]) => number }> = {
  abs: { n: [1, 1], f: Math.abs },
  sqrt: { n: [1, 1], f: Math.sqrt },
  exp: { n: [1, 1], f: Math.exp },
  ln: { n: [1, 1], f: Math.log },
  log: { n: [1, 1], f: Math.log10 },
  log10: { n: [1, 1], f: Math.log10 },
  sign: { n: [1, 1], f: Math.sign },
  max: { n: [2, 8], f: Math.max },
  min: { n: [2, 8], f: Math.min },
};

export const FONCTIONS_FORMULE = Object.keys(FONCTIONS);

/** Analyse une formule ; lève une erreur lisible (position comprise) si elle est incorrecte. */
export function analyserFormule(texte: string): Noeud {
  const jetons: { v: string; pos: number }[] = [];
  const re = /\s*(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_][\w.]*|[-+*/^(),])/y;
  let pos = 0;
  while (pos < texte.length) {
    if (/^\s*$/.test(texte.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(texte);
    if (!m) throw new Error(`Formule : caractère inattendu « ${texte.slice(pos).trim()[0]} » (position ${pos + 1}). Utiliser le point décimal.`);
    jetons.push({ v: m[1]!, pos: m.index + m[0].length - m[1]!.length });
    pos = re.lastIndex;
  }
  if (!jetons.length) throw new Error("Formule vide.");
  let i = 0;
  const voir = () => jetons[i]?.v;
  const attendre = (v: string) => {
    if (voir() !== v) throw new Error(`Formule : « ${v} » attendu${jetons[i] ? ` avant « ${jetons[i]!.v} » (position ${jetons[i]!.pos + 1})` : " à la fin"}.`);
    i++;
  };
  // somme := produit (('+'|'-') produit)* ; produit := puissance (('*'|'/') puissance)* ;
  // puissance := unaire ('^' puissance)? ; unaire := '-' unaire | '+' unaire | atome
  const somme = (): Noeud => {
    let a = produit();
    while (voir() === "+" || voir() === "-") {
      const op = jetons[i++]!.v as "+" | "-";
      a = { t: "binaire", op, a, b: produit() };
    }
    return a;
  };
  const produit = (): Noeud => {
    let a = puissance();
    while (voir() === "*" || voir() === "/") {
      const op = jetons[i++]!.v as "*" | "/";
      a = { t: "binaire", op, a, b: puissance() };
    }
    return a;
  };
  const puissance = (): Noeud => {
    const a = unaire();
    if (voir() === "^") {
      i++;
      return { t: "binaire", op: "^", a, b: puissance() };
    }
    return a;
  };
  const unaire = (): Noeud => {
    if (voir() === "-") {
      i++;
      return { t: "unaire", op: "-", a: unaire() };
    }
    if (voir() === "+") {
      i++;
      return unaire();
    }
    return atome();
  };
  const atome = (): Noeud => {
    const j = jetons[i];
    if (!j) throw new Error("Formule incomplète.");
    if (j.v === "(") {
      i++;
      const a = somme();
      attendre(")");
      return a;
    }
    if (/^[\d.]/.test(j.v)) {
      i++;
      return { t: "nombre", v: Number(j.v) };
    }
    if (/^[A-Za-z_]/.test(j.v)) {
      i++;
      if (voir() === "(") {
        const nom = j.v.toLowerCase();
        const f = FONCTIONS[nom];
        if (!f) throw new Error(`Formule : fonction inconnue « ${j.v} » (connues : ${FONCTIONS_FORMULE.join(", ")}).`);
        i++;
        const args = [somme()];
        while (voir() === ",") {
          i++;
          args.push(somme());
        }
        attendre(")");
        if (args.length < f.n[0] || args.length > f.n[1]) throw new Error(`Formule : ${nom} prend ${f.n[0] === f.n[1] ? f.n[0] : `${f.n[0]} à ${f.n[1]}`} argument(s).`);
        return { t: "fonction", nom, args };
      }
      return { t: "variable", nom: j.v };
    }
    throw new Error(`Formule : « ${j.v} » inattendu (position ${j.pos + 1}).`);
  };
  const arbre = somme();
  if (i < jetons.length) throw new Error(`Formule : « ${jetons[i]!.v} » en trop (position ${jetons[i]!.pos + 1}).`);
  return arbre;
}

/** Variables utilisées par une formule. */
export function variablesFormule(n: Noeud): string[] {
  if (n.t === "variable") return [n.nom];
  if (n.t === "unaire") return variablesFormule(n.a);
  if (n.t === "binaire") return [...variablesFormule(n.a), ...variablesFormule(n.b)];
  if (n.t === "fonction") return n.args.flatMap(variablesFormule);
  return [];
}

/**
 * Évalue une formule sur `n` points ; `valeurs(nom)` donne la colonne d'une variable (null si inconnue). Une
 * opération impossible (division par 0, racine d'un négatif) donne NaN : un trou, pas une erreur.
 */
export function evaluerFormule(texte: string, n: number, valeurs: (nom: string) => ArrayLike<number> | null): Float64Array {
  const arbre = analyserFormule(texte);
  const cols = new Map<string, ArrayLike<number>>();
  for (const v of new Set(variablesFormule(arbre))) {
    const c = valeurs(v);
    if (!c) throw new Error(`Formule : « ${v} » ne désigne aucune colonne.`);
    cols.set(v, c);
  }
  const calc = (x: Noeud, k: number): number => {
    switch (x.t) {
      case "nombre":
        return x.v;
      case "variable":
        return cols.get(x.nom)![k]!;
      case "unaire":
        return -calc(x.a, k);
      case "binaire": {
        const a = calc(x.a, k);
        const b = calc(x.b, k);
        return x.op === "+" ? a + b : x.op === "-" ? a - b : x.op === "*" ? a * b : x.op === "/" ? (b === 0 ? NaN : a / b) : a ** b;
      }
      case "fonction":
        return FONCTIONS[x.nom]!.f(...x.args.map((a) => calc(a, k)));
    }
  };
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const v = calc(arbre, k);
    out[k] = Number.isFinite(v) ? v : NaN;
  }
  return out;
}
