// Pone los borradores locales al día con los slugs de WordPress.
//
// Al renombrar los seis slugs truncados se cambió WordPress y NO se tocaron los
// archivos de content/blog. Resultado: el sistema veía el borrador viejo y la
// página nueva como dos artículos distintos con el mismo título, y bloqueaba la
// publicación por canibalización... consigo mismo.
//
//   node scripts/sincronizar-slugs.mjs            (solo enseña)
//   node scripts/sincronizar-slugs.mjs --aplicar
import fs from "fs";
import path from "path";

const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const A = "Basic " + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASSWORD.replace(/\s/g, "")}`).toString("base64");

const limpiar = (t) => String(t?.rendered ?? "")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

const wp = [];
for (let page = 1; page <= 5; page++) {
  const r = await fetch(`${env.WP_URL}/wp-json/wp/v2/posts?per_page=100&page=${page}&status=any&_fields=slug,title`,
    { headers: { Authorization: A }, signal: AbortSignal.timeout(90000) });
  const l = await r.json();
  if (!Array.isArray(l) || !l.length) break;
  wp.push(...l.map((p) => ({ slug: p.slug, titulo: limpiar(p.title) })));
  if (l.length < 100) break;
}
console.log(`${wp.length} posts en WordPress\n`);

const DIR = path.join(process.cwd(), "content", "blog");
const desfasados = [];

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
  const bruto = fs.readFileSync(path.join(DIR, f), "utf8");
  const m = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) continue;
  const titulo = m[1].match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  const slug = m[1].match(/^slug:\s*(.+)$/m)?.[1]?.trim();
  if (!titulo || !slug) continue;

  // El mismo título en WordPress pero con OTRO slug: se renombró allí y aquí no.
  const enWp = wp.find((p) => p.titulo.toLowerCase().trim() === titulo.toLowerCase().trim());
  if (enWp && enWp.slug !== slug) desfasados.push({ file: f, slug, nuevo: enWp.slug, titulo });
}

console.log(`${desfasados.length} borradores con el slug desfasado:\n`);
for (const d of desfasados) {
  console.log(`  ${d.titulo.slice(0, 58)}`);
  console.log(`     local: ${d.slug}`);
  console.log(`     en WP: ${d.nuevo}`);
  if (!APLICAR) { console.log(""); continue; }

  const ruta = path.join(DIR, d.file);
  const bruto = fs.readFileSync(ruta, "utf8");
  const actualizado = bruto.replace(/^slug:.*$/m, `slug: ${d.nuevo}`);
  const rutaNueva = path.join(DIR, `${d.nuevo}.md`);
  fs.writeFileSync(rutaNueva, actualizado);
  if (rutaNueva !== ruta) fs.unlinkSync(ruta);
  console.log(`     -> sincronizado\n`);
}
console.log(APLICAR ? "Hecho." : "Plan mostrado. Añade --aplicar para ejecutar.");
