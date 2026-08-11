// Añade el CTA al final de los posts YA PUBLICADOS en WordPress.
//
// Por qué no republicar desde el markdown: publishPost reemplaza el cuerpo
// entero, y solo 15 de los 100 posts vivos tienen markdown local. Republicar
// habría dejado 85 sin tocar y habría sobrescrito los otros 15 con la versión
// local, que puede diferir de lo que se editó en el sitio. Esto solo AÑADE al
// final: nada de lo que ya está publicado cambia.
//
// Idempotente por el ancla `data-faststrat-cta`: si el post ya lo tiene, se
// salta. Es lo que permite correrlo dos veces sin acumular dos cierres.
//
// Uso:
//   node scripts/append-cta-live.mjs            -> simulación, no escribe
//   node scripts/append-cta-live.mjs --aplicar  -> escribe en el sitio en vivo
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim()]),
);

const BASE = (env.WORDPRESS_URL || "https://faststrat.ai").replace(/\/$/, "");
const AUTH = "Basic " + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASSWORD}`).toString("base64");
const APLICAR = process.argv.includes("--aplicar");
const URL_CTA = "https://app.faststrat.ai";
const ANCLA = "data-faststrat-cta";

// El texto viene del CTA acordado. En español para los posts en español: un
// cierre en inglés al final de un artículo en español rompe la lectura justo
// donde se pide la acción.
const CTA = {
  en: `
<hr ${ANCLA}="1" />
<p>You now know what to do. The hard part is doing it every week, without a marketing team, while you run the business.</p>
<p>That is the job FastStrat does: it plans the content, writes it, publishes it, and tells you what actually moved. One place, no stack to assemble.</p>
<p><strong><a href="${URL_CTA}" rel="noopener">Start free at app.faststrat.ai &rarr;</a></strong></p>
<p><em>Set it up in minutes. Keep what works.</em></p>
`,
  es: `
<hr ${ANCLA}="1" />
<p>Ya sabes qué hacer. Lo difícil es hacerlo cada semana, sin equipo de marketing y mientras sacas adelante el negocio.</p>
<p>De eso se encarga FastStrat: planea el contenido, lo escribe, lo publica y te dice qué funcionó de verdad. En un solo sitio, sin herramientas que ensamblar.</p>
<p><strong><a href="${URL_CTA}" rel="noopener">Empieza gratis en app.faststrat.ai &rarr;</a></strong></p>
<p><em>Se configura en minutos. Te quedas con lo que funcione.</em></p>
`,
};

/** Español si el texto tiene marcas claras del idioma. */
const esEspanol = (titulo, contenido) => {
  const t = (titulo + " " + contenido.slice(0, 1200)).toLowerCase();
  const marcas = (t.match(/\b(para|cómo|qué|los|las|una|con|más|según|precios|empresas|negocio)\b/g) || []).length;
  return marcas >= 6;
};

const wp = async (ruta, opts = {}) => {
  const r = await fetch(`${BASE}/wp-json/wp/v2/${ruta}`, {
    ...opts,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
};

// Todas las páginas de resultados: 100 es el tope por petición, y quedarse ahí
// habría dejado fuera lo que pase de cien sin avisar.
const todos = [];
for (let page = 1; page <= 20; page++) {
  const lote = await wp(`posts?per_page=100&page=${page}&status=publish&_fields=id,slug,title,content,link`);
  todos.push(...lote);
  if (lote.length < 100) break;
}

console.log(`\nPosts publicados: ${todos.length}\n`);

let conCta = 0;
let porTocar = 0;
const errores = [];

for (const p of todos) {
  const html = p.content?.rendered ?? "";
  if (html.includes(ANCLA) || html.includes(URL_CTA)) {
    conCta++;
    continue;
  }

  const titulo = p.title?.rendered ?? "";
  const lang = esEspanol(titulo, html.replace(/<[^>]+>/g, " ")) ? "es" : "en";
  porTocar++;

  if (!APLICAR) {
    console.log(`  [${lang}] ${p.slug.slice(0, 66)}`);
    continue;
  }

  try {
    // `content` sin renderizar: se pide en crudo para no perder shortcodes ni
    // bloques de Gutenberg al reescribir.
    const crudo = await wp(`posts/${p.id}?context=edit&_fields=content`);
    const cuerpo = crudo.content?.raw ?? html;
    await wp(`posts/${p.id}`, { method: "POST", body: JSON.stringify({ content: cuerpo + CTA[lang] }) });
    console.log(`  [${lang}] actualizado: ${p.slug.slice(0, 60)}`);
  } catch (e) {
    errores.push(`${p.slug}: ${e.message}`);
    console.log(`  ERROR ${p.slug}: ${e.message.slice(0, 90)}`);
  }
}

console.log(
  `\n${porTocar} sin CTA, ${conCta} ya lo tienen.` +
    (APLICAR ? ` ${errores.length} error(es).` : "\n\nSimulación: no se escribió nada. Añade --aplicar para hacerlo."),
);
