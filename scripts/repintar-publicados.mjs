// Vuelve a subir los artículos publicados con el color de texto escrito dentro.
//
// POR QUÉ: el tema del sitio mete el artículo entero en un contenedor con
// `.fs-hero * { color:#fff !important }`. Alguien parcheó párrafos y
// encabezados y se olvidó de las tablas, así que las tablas salían BLANCAS
// sobre fondo claro. Medido en el artículo del 4 de septiembre: párrafos
// rgb(17,17,17), celdas rgb(255,255,255).
//
// Los artículos NUEVOS ya salen bien: renderHtml escribe el color. Esto es para
// los que ya estaban publicados antes del arreglo.
//
// Solo toca el HTML del cuerpo. No cambia título, slug, fecha, estado ni autor:
// un repintado no es una republicación.
//
//   node scripts/repintar-publicados.mjs            (enseña qué haría)
//   node scripts/repintar-publicados.mjs --aplicar
import fs from "node:fs";
import path from "node:path";
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

const APLICAR = process.argv.includes("--aplicar");
const matter = (await import("gray-matter")).default;
const { renderHtml } = await import("@/lib/blog");
const { CLIENTE } = await import("@/lib/cliente");

const auth =
  "Basic " +
  Buffer.from(`${process.env.WP_USER}:${(process.env.WP_APP_PASSWORD || "").replace(/ /g, "")}`).toString("base64");
const wp = (ruta, init = {}) =>
  fetch(`${process.env.WP_URL}/wp-json/wp/v2/${ruta}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(90000),
  });

const dir = path.join(process.cwd(), "content", "blog");
const ficheros = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
console.log(`${ficheros.length} artículos locales · color objetivo ${CLIENTE.colorTexto}\n`);

let yaEstaban = 0;
const aRepintar = [];
const sinPublicar = [];

for (const f of ficheros) {
  const slug = f.replace(/\.md$/, "");
  const { data, content } = matter(fs.readFileSync(path.join(dir, f), "utf8"));

  const r = await wp(`posts?slug=${encodeURIComponent(slug)}&_fields=id,status,link,title`);
  const encontrados = await r.json().catch(() => []);
  const post = Array.isArray(encontrados) ? encontrados[0] : null;
  if (!post) {
    sinPublicar.push(slug);
    continue;
  }

  const html = renderHtml({ ...data, markdown: content });
  // Si el HTML que produciríamos ya lleva el color, no hay nada que subir.
  // Se compara con lo que HAY publicado, no con lo que generamos: subir un
  // artículo idéntico gasta una petición y ensucia el historial de WordPress.
  const actual = await (await wp(`posts/${post.id}?_fields=content`)).json().catch(() => ({}));
  const yaTiene = (actual?.content?.rendered ?? "").includes(`color:${CLIENTE.colorTexto}`);
  if (yaTiene) {
    yaEstaban++;
    continue;
  }

  const tablas = (content.match(/^\|/gm) ?? []).length;
  aRepintar.push({ slug, id: post.id, estado: post.status, tablas, html });
}

console.log(`ya tienen el color:   ${yaEstaban}`);
console.log(`hay que repintar:     ${aRepintar.length}`);
console.log(`no están en WordPress: ${sinPublicar.length}\n`);

for (const a of aRepintar) {
  console.log(`  [${a.estado}] ${a.slug.slice(0, 62)}${a.tablas ? `  · ${a.tablas} filas de tabla` : ""}`);
}

if (!APLICAR) {
  console.log("\nMODO PLAN. Nada se ha subido. Añade --aplicar.");
  process.exit(0);
}

console.log("\nSubiendo…");
let ok = 0;
const fallos = [];
for (const a of aRepintar) {
  // Solo el contenido. Mandar más campos arriesga cambiar la fecha o el estado
  // sin querer, y eso en un artículo publicado se nota en Google.
  const r = await wp(`posts/${a.id}`, { method: "POST", body: JSON.stringify({ content: a.html }) });
  if (r.ok) {
    ok++;
    console.log(`  ok   ${a.slug.slice(0, 62)}`);
  } else {
    const j = await r.json().catch(() => ({}));
    fallos.push(`${a.slug}: ${r.status} ${j.message ?? ""}`);
    console.log(`  MAL  ${a.slug.slice(0, 62)} · ${r.status}`);
  }
}

console.log(`\n${ok} de ${aRepintar.length} repintados.`);
if (fallos.length) {
  for (const f of fallos) console.log(`  ${f}`);
  process.exit(1);
}
