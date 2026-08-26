// Auditoría técnica del sitio contra la lista de comprobación estándar
// (Semrush / KeepCoding). Mide contra el sitio EN VIVO, no contra el código.
//
//   node scripts/auditoria-tecnica.mjs [dominio]
import fs from "fs";
import http from "http";
import https from "https";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const DOMINIO = process.argv[2] || (env.WP_URL || "https://faststrat.ai").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Petición sin seguir redirecciones, para poder VER la cadena. */
function cabeza(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method: "GET", headers: { "User-Agent": "auditoria/1.0" } }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, location: res.headers.location, headers: res.headers });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.end();
  });
}

function traer(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { headers: { "User-Agent": "auditoria/1.0" } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(traer(new URL(res.headers.location, url).href));
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", (e) => resolve({ status: 0, body: "", error: e.message }));
    req.setTimeout(45000, () => { req.destroy(); resolve({ status: 0, body: "", error: "timeout" }); });
    req.end();
  });
}

const ok = (b) => (b ? "✓" : "✗");
console.log(`Auditoría técnica de ${DOMINIO}\n${"=".repeat(50)}\n`);

// --- HTTPS y consolidación de dominio
console.log("HTTPS y dominio único");
const http_ = await cabeza(`http://${DOMINIO}/`);
console.log(`  ${ok([301, 308].includes(http_.status))} http -> https  (${http_.status}${http_.location ? " -> " + http_.location : ""})`);
const conWww = await cabeza(`https://www.${DOMINIO}/`);
const consolidado = [301, 308].includes(conWww.status) || conWww.status === 0;
console.log(`  ${ok(consolidado)} www consolidado (${conWww.status}${conWww.location ? " -> " + conWww.location : conWww.error ? " " + conWww.error : ""})`);

// --- Cadenas de redirección sobre una muestra del sitemap
console.log("\nCadenas de redirección (muestra del sitemap)");
const sm = await traer(`https://${DOMINIO}/post-sitemap.xml`);
const urls = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`  ${urls.length} URLs en el sitemap`);
const muestra = urls.filter((_, i) => i % Math.ceil(urls.length / 12) === 0).slice(0, 12);
let cadenas = 0, rotas = 0;
for (const u of muestra) {
  let actual = u, saltos = 0, est = 0;
  while (saltos < 5) {
    const r = await cabeza(actual);
    est = r.status;
    if ([301, 302, 307, 308].includes(r.status) && r.location) {
      actual = new URL(r.location, actual).href;
      saltos++;
    } else break;
  }
  if (saltos > 1) { cadenas++; console.log(`  ✗ ${saltos} saltos: ${u.replace(`https://${DOMINIO}`, "")}`); }
  if (est >= 400) { rotas++; console.log(`  ✗ ${est}: ${u.replace(`https://${DOMINIO}`, "")}`); }
}
console.log(`  ${ok(cadenas === 0)} sin cadenas de más de un salto (${muestra.length} comprobadas)`);
console.log(`  ${ok(rotas === 0)} sin URLs rotas en el sitemap`);

// --- Enlaces internos rotos, sobre las páginas más importantes
console.log("\nEnlaces internos rotos");
const paginas = [`https://${DOMINIO}/`, urls[0], urls[Math.floor(urls.length / 2)]].filter(Boolean);
const vistos = new Set();
let internos = 0, rotosInt = 0;
for (const p of paginas) {
  const r = await traer(p);
  const enlaces = [...r.body.matchAll(/href="(https?:\/\/[^"]+|\/[^"]*)"/g)]
    .map((m) => new URL(m[1], p).href)
    .filter((h) => h.includes(DOMINIO) && !/\.(png|jpg|jpeg|svg|css|js|webp|ico)(\?|$)/i.test(h) && !h.includes("#"));
  for (const e of new Set(enlaces)) {
    if (vistos.has(e) || vistos.size > 60) continue;
    vistos.add(e);
    internos++;
    const c = await cabeza(e);
    if (c.status >= 400) { rotosInt++; console.log(`  ✗ ${c.status}: ${e.replace(`https://${DOMINIO}`, "")}`); }
  }
}
console.log(`  ${ok(rotosInt === 0)} ${internos} enlaces internos comprobados, ${rotosInt} rotos`);

// --- Core Web Vitals, datos de campo (CrUX vía PageSpeed Insights)
console.log("\nCore Web Vitals (datos reales de usuarios, vía PageSpeed Insights)");
for (const estrategia of ["mobile", "desktop"]) {
  const r = await traer(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(`https://${DOMINIO}/`)}&strategy=${estrategia}`,
  );
  try {
    const j = JSON.parse(r.body);
    const campo = j.loadingExperience?.metrics;
    if (!campo) { console.log(`  ${estrategia}: sin datos de campo (tráfico insuficiente)`); continue; }
    const lcp = campo.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
    const cls = campo.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    const inp = campo.INTERACTION_TO_NEXT_PAINT?.percentile;
    console.log(`  ${estrategia}:`);
    if (lcp !== undefined) console.log(`    ${ok(lcp <= 2500)} LCP ${(lcp / 1000).toFixed(2)}s   (umbral 2,50s)`);
    if (inp !== undefined) console.log(`    ${ok(inp <= 200)} INP ${inp}ms      (umbral 200ms)`);
    if (cls !== undefined) console.log(`    ${ok(cls / 100 <= 0.1)} CLS ${(cls / 100).toFixed(3)}   (umbral 0,100)`);
    const perf = j.lighthouseResult?.categories?.performance?.score;
    if (perf != null) console.log(`    Lighthouse: ${Math.round(perf * 100)}/100`);
  } catch {
    console.log(`  ${estrategia}: la API no respondió con datos`);
  }
}

// --- Lo que ya sabíamos, comprobado otra vez
console.log("\nBásicos");
const robots = await traer(`https://${DOMINIO}/robots.txt`);
console.log(`  ${ok(robots.status === 200)} robots.txt`);
console.log(`  ${ok(/Sitemap:/i.test(robots.body))} declara el sitemap en robots.txt`);
const home = await traer(`https://${DOMINIO}/`);
console.log(`  ${ok(/rel="canonical"/.test(home.body))} canonical`);
console.log(`  ${ok(/name="viewport"/.test(home.body))} viewport (móvil)`);
console.log(`  ${ok(/application\/ld\+json/.test(home.body))} datos estructurados JSON-LD`);
console.log(`  ${ok(/hreflang=/.test(home.body))} hreflang`);
const dev = await traer(`https://dev.${DOMINIO}/robots.txt`);
console.log(`  ${ok(dev.status === 200 && /Disallow:\s*\//.test(dev.body))} dev bloqueado (robots.txt de dev: ${dev.status})`);
