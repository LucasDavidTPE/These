/**
 * Expressions mathématiques saisies par l'utilisateur (profil de pression `f(y)`) :
 * analyse sans `eval`, variable unique `y`. Opérateurs + − × / ^ (puissance, associative
 * à droite), parenthèses, virgule ou point décimal, constantes `pi` et `e`, fonctions
 * exp, ln, log (base 10), sqrt, abs, sin, cos, tan.
 */

export type Expr = (y: number) => number;

const FUNCTIONS: Record<string, (x: number) => number> = {
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: "num"; v: number; at: number } | { t: "id"; v: string; at: number } | { t: "op"; v: string; at: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.,]/.test(ch)) {
      const m = /^[0-9]*[.,]?[0-9]+(?:[eE][+-]?[0-9]+)?|^[0-9]+[.,]?/.exec(src.slice(i))!;
      out.push({ t: "num", v: Number(m[0].replace(",", ".")), at: i });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
    } else if ("+-*/^()×·−".includes(ch)) {
      const v = ch === "×" || ch === "·" ? "*" : ch === "−" ? "-" : ch;
      out.push({ t: "op", v, at: i });
      i++;
    } else {
      throw new SyntaxError(`caractère inattendu « ${ch} » (position ${i + 1}).`);
    }
  }
  return out;
}

/** Analyse `src` ; lève SyntaxError avec un message en français. */
export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const fail = (msg: string): never => {
    throw new SyntaxError(msg);
  };
  const expectOp = (v: string) => {
    const t = peek();
    if (!t || t.t !== "op" || t.v !== v) fail(`« ${v} » attendu${t ? ` (position ${t.at + 1})` : " en fin d'expression"}.`);
    pos++;
  };

  // expr := term (('+'|'-') term)*
  function expr(): Expr {
    let left = term();
    for (let t = peek(); t && t.t === "op" && (t.v === "+" || t.v === "-"); t = peek()) {
      pos++;
      const right = term();
      const l = left;
      left = t.v === "+" ? (y) => l(y) + right(y) : (y) => l(y) - right(y);
    }
    return left;
  }
  // term := unary (('*'|'/') unary | unary)*   (multiplication implicite : « 2y », « 3(y+1) »)
  function term(): Expr {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t && t.t === "op" && (t.v === "*" || t.v === "/")) {
        pos++;
        const right = unary();
        const l = left;
        left = t.v === "*" ? (y) => l(y) * right(y) : (y) => l(y) / right(y);
      } else if (t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("))) {
        const right = unary();
        const l = left;
        left = (y) => l(y) * right(y);
      } else return left;
    }
  }
  // unary := ('-'|'+') unary | power
  function unary(): Expr {
    const t = peek();
    if (t && t.t === "op" && (t.v === "-" || t.v === "+")) {
      pos++;
      const inner = unary();
      return t.v === "-" ? (y) => -inner(y) : inner;
    }
    return power();
  }
  // power := primary ('^' unary)?
  function power(): Expr {
    const base = primary();
    const t = peek();
    if (t && t.t === "op" && t.v === "^") {
      pos++;
      const exp = unary();
      return (y) => Math.pow(base(y), exp(y));
    }
    return base;
  }
  function primary(): Expr {
    const t = peek();
    if (!t) return fail("expression incomplète.");
    pos++;
    if (t.t === "num") {
      const v = t.v;
      return () => v;
    }
    if (t.t === "op" && t.v === "(") {
      const e = expr();
      expectOp(")");
      return e;
    }
    if (t.t === "id") {
      const name = t.v.toLowerCase();
      if (name === "y") return (y) => y;
      if (name in CONSTANTS) {
        const v = CONSTANTS[name]!;
        return () => v;
      }
      if (name in FUNCTIONS) {
        const f = FUNCTIONS[name]!;
        expectOp("(");
        const arg = expr();
        expectOp(")");
        return (y) => f(arg(y));
      }
      return fail(`« ${t.v} » inconnu (variable : y ; fonctions : ${Object.keys(FUNCTIONS).join(", ")}).`);
    }
    return fail(`« ${t.v} » inattendu (position ${t.at + 1}).`);
  }

  if (toks.length === 0) fail("expression vide.");
  const e = expr();
  const rest = peek();
  if (rest) fail(`« ${rest.t === "num" ? rest.v : rest.v} » inattendu (position ${rest.at + 1}).`);
  return e;
}
