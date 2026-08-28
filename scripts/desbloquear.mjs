// Desbloquea un artículo quitando las cifras a las que no se les encontró fuente.
//
// Es el último recurso, y solo se aplica cuando lo ÚNICO que bloquea son cifras
// sin fuente: el corrector ya las buscó en sus pasadas y no existen. Sin esto,
// el artículo se quedaba escrito, pagado y sin poder publicarse.
//
// No sustituye la cifra por una vaguedad. Ver lib/publicable.ts, QUITAR_CIFRAS.
//
//   node scripts/desbloquear.mjs <slug>            (solo enseña qué haría)
//   node scripts/desbloquear.mjs <slug> --aplicar
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

for (const archivo of [".env.local", ".env"]) {
  if (!fs.existsSync(archivo)) continue;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  break;
}

// El alias "@/" solo lo entiende el bundler de Next.
register(
  "data:text/javascript," +
    encodeURIComponent(`
  const raiz = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
  export async function resolve(e, c, s) {
    if (e.startsWith("@/")) return s(new URL(e.slice(2) + ".ts", raiz).href, c);
    return s(e, c);
  }`),
  import.meta.url,
);

const slug = process.argv[2];
const APLICAR = process.argv.includes("--aplicar");
if (!slug || slug.startsWith("--")) {
  console.error("Uso: node scripts/desbloquear.mjs <slug> [--aplicar]");
  process.exit(1);
}

const ruta = path.join("content", "blog", `${slug}.md`);
if (!fs.existsSync(ruta)) {
  console.error(`No existe ${ruta}`);
  process.exit(1);
}

const { runQa } = await import("@/lib/qa");
const { dejarPublicable, CASA } = await import("@/lib/publicable");

const { data, content } = matter(fs.readFileSync(ruta, "utf8"));

const antes = runQa({ title: data.title, metaDescription: data.excerpt, markdown: content, house: CASA });
console.log(`${data.title}`);
console.log(`  bloqueos antes: ${antes.blocking.length}`);
for (const b of antes.blocking) console.log(`    [${b.rule}] ${b.detail.slice(0, 80)}`);

if (antes.blocking.length === 0) {
  console.log("\nNo hay nada que desbloquear.");
  process.exit(0);
}
if (!APLICAR) {
  console.log("\nMODO PLAN. Añade --aplicar para que el agente los resuelva.");
  process.exit(0);
}

console.log("\nTrabajando…");
const t0 = Date.now();
const r = await dejarPublicable(data.title, content, { metaDescription: data.excerpt });
const min = ((Date.now() - t0) / 60000).toFixed(1);

console.log(`\n[${min} min]`);
console.log(`  bloqueos que quedan: ${r.qa.blocking.length}`);
console.log(`  pasadas del agente:  ${r.pasadas}`);
console.log(`  cifras quitadas:     ${r.quitadas.length}`);
for (const q of r.quitadas) console.log(`     - ${q.slice(0, 80)}`);
for (const b of r.qa.blocking) console.log(`  sigue bloqueando: ${b.detail.slice(0, 80)}`);

// Que no se haya colado una vaguedad al quitar las cifras. Es la comprobación
// que importa: sustituir "el 12%" por "muchas" no quita la cifra, la esconde.
const VAGO = /\b(muchas?|la mayoría|gran parte|un porcentaje significativo|significativamente|numerosas?)\b/gi;
const vagoAntes = (content.match(VAGO) ?? []).length;
const vagoDespues = (r.markdown.match(VAGO) ?? []).length;
console.log(`  vaguedades:          ${vagoAntes} antes -> ${vagoDespues} después${vagoDespues > vagoAntes ? "  <-- MAL, escondió cifras" : ""}`);
console.log(`  palabras:            ${content.split(/\s+/).filter(Boolean).length} -> ${r.markdown.split(/\s+/).filter(Boolean).length}`);

if (r.qa.blocking.length < antes.blocking.length) {
  fs.writeFileSync(ruta, matter.stringify(r.markdown.trim() + "\n", data));
  console.log(`\nGuardado.${r.qa.blocking.length === 0 ? " El artículo ya puede publicarse." : ""}`);
} else {
  console.log("\nNo mejoró, así que el artículo se queda como estaba.");
}
