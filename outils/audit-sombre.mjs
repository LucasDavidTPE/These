/**
 * Audit du contraste, page par page, dans le thème sombre (ou clair : `--clair`) : démarre la démo (Vite),
 * parcourt chaque module, ses onglets et l'atelier COMSOL sur son jeu d'exemple, et liste chaque texte visible
 * dont le contraste avec son fond est sous 3:1 (presque illisible). Échoue s'il y en a.
 *
 *   npm run audit:sombre                 (thème sombre)
 *   npm run audit:sombre -- --clair      (thème clair)
 *
 * Navigateur : CHROMIUM=<chemin> s'il est donné, sinon Edge (Windows) ou Chrome installés. Le test statique
 * correspondant, qui tourne avec `npm run test`, est tests/theme.test.ts.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const CLAIR = process.argv.includes("--clair");
const SEUIL = 3;
const serveur = await createServer({ server: { port: 1430, strictPort: false }, logLevel: "error" });
await serveur.listen();
const url = serveur.resolvedUrls.local[0];
const chemin = process.env.CHROMIUM ?? ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p));
const b = await chromium.launch(chemin ? { executablePath: chemin } : { channel: process.platform === "win32" ? "msedge" : "chrome" });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: CLAIR ? "light" : "dark" });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript(() => localStorage.setItem("these.nouveautes.vue", "9.0.0"));
await p.goto(`${url}?scenario=complet&contenu=1`);
await p.waitForTimeout(1500);
const resultats = new Map();
async function auditer(page) {
  const r = await p.evaluate((SEUIL) => {
    const rgba = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const v = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
    };
    const lum = (c) => {
      const f = (x) => {
        x /= 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const melange = (haut, bas) => ({ r: haut.r * haut.a + bas.r * (1 - haut.a), g: haut.g * haut.a + bas.g * (1 - haut.a), b: haut.b * haut.a + bas.b * (1 - haut.a), a: 1 });
    const fond = (el) => {
      const couches = [];
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("linear-gradient")) return null; // image : inconnu
        const c = rgba(cs.backgroundColor);
        if (c && c.a > 0) {
          couches.push(c);
          if (c.a >= 1) break;
        }
      }
      let res = { r: 255, g: 255, b: 255, a: 1 };
      for (const c of couches.reverse()) res = melange(c, res);
      return res;
    };
    const out = [];
    const vus = new Set();
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("svg") || el.closest("[aria-hidden=true]")) continue;
      const texte = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      const champ = el.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea");
      if (!texte && !champ) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) < 0.5) continue;
      if (el.closest("button:disabled, [disabled]")) continue;
      const f = fond(el);
      const c = rgba(cs.color);
      if (!f || !c) continue;
      const cc = melange(c, f);
      const L1 = lum(cc),
        L2 = lum(f);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < SEUIL) {
        const cls = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "");
        const chemin = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean).map(cls).reverse().join(" > ");
        const cle = chemin;
        if (vus.has(cle)) continue;
        vus.add(cle);
        out.push({
          ratio: Math.round(ratio * 100) / 100,
          texte: (texte || el.value || "").slice(0, 40),
          chemin,
          couleur: cs.color,
          fond: `rgb(${Math.round(f.r)},${Math.round(f.g)},${Math.round(f.b)})`,
        });
      }
    }
    return out;
  }, SEUIL);
  for (const x of r) {
    const k = x.chemin;
    if (!resultats.has(k)) resultats.set(k, { ...x, pages: [page] });
    else resultats.get(k).pages.push(page);
  }
}
const sidebar = await p.locator("nav.barre button").allInnerTexts();
const modules = sidebar.map((s) => s.trim()).filter((s) => s && !/Rechercher|CALENDRIER|ESSAIS|OUTILS|RÉDACTION|BIBLIOGRAPHIE/i.test(s));
for (const m of modules) {
  const bouton = p.locator("nav.barre button", { hasText: m }).first();
  if (!(await bouton.count())) continue;
  await bouton.click().catch(() => {});
  await p.waitForTimeout(700);
  if (m.startsWith("Nouveautés")) {
    await auditer("Nouveautés");
    await p.keyboard.press("Escape");
    continue;
  }
  await auditer(m);
  // onglets internes
  const onglets = p.locator("main [class*=onglets] button, main [role=tablist] button, main [role=tab]");
  const n = await onglets.count();
  for (let i = 0; i < Math.min(n, 12); i++) {
    const t = (
      await onglets
        .nth(i)
        .innerText()
        .catch(() => "")
    ).trim();
    await onglets
      .nth(i)
      .click()
      .catch(() => {});
    await p.waitForTimeout(500);
    await auditer(`${m} › ${t}`);
    if (m === "Figures" && t === "COMSOL") {
      const ex = p.getByRole("button", { name: /Essayer avec le jeu d'exemple/ });
      if (await ex.count()) {
        await ex.click();
        await p.waitForTimeout(2500);
      }
      await auditer("COMSOL exemple + visite");
      for (const tuile of ["Carte d'une coupe", "Critères", "Bassin", "Signal", "Tableau de synthèse", "Convergence", "Sensibilité"]) {
        await p
          .locator(".atelier-tuile", { hasText: tuile })
          .first()
          .click()
          .catch(() => {});
        await p.waitForTimeout(700);
        await auditer(`COMSOL › ${tuile}`);
      }
      await p
        .getByRole("button", { name: "Vérifier" })
        .first()
        .click()
        .catch(() => {});
      await p.waitForTimeout(500);
      await auditer("COMSOL › Vérifier");
      await p
        .getByRole("button", { name: /Vue d'ensemble/ })
        .first()
        .click()
        .catch(() => {});
      await p.waitForTimeout(800);
      await auditer("COMSOL › Vue d'ensemble");
      await p
        .getByRole("button", { name: /^Rapport/ })
        .first()
        .click()
        .catch(() => {});
      await p.waitForTimeout(800);
      await auditer("COMSOL › Rapport");
      await p
        .getByRole("button", { name: /Retour aux tracés/ })
        .first()
        .click()
        .catch(() => {});
    }
  }
}
const liste = [...resultats.values()].sort((a, b) => a.ratio - b.ratio);
console.log(`${liste.length} texte(s) sous le contraste ${SEUIL}:1 (thème ${CLAIR ? "clair" : "sombre"})`);
for (const x of liste) console.log(`${x.ratio}\t${x.couleur} sur ${x.fond}\t« ${x.texte} »\t${x.chemin}\t[${[...new Set(x.pages)].slice(0, 3).join(" | ")}]`);
if (errs.length) console.log("erreurs de la page :", errs.slice(0, 5));
await b.close();
await serveur.close();
process.exit(liste.length || errs.length ? 1 : 0);
