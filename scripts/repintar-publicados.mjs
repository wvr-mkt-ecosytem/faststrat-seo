// Repinta el texto de los artículos YA publicados.
//
// POR QUÉ: el tema del sitio mete el artículo entero en un contenedor con
// `.fs-hero * { color:#fff !important }`, pensado para una cabecera oscura.
// Alguien parcheó párrafos y encabezados y se olvidó de las tablas, así que las
// tablas salían BLANCAS sobre fondo claro. Medido en tres artículos
// publicados, uno de agosto: párrafos rgb(17,17,17), celdas rgb(255,255,255).
//
// Los artículos NUEVOS ya nacen bien: renderHtml escribe el color. Esto es para
// los que se publicaron antes.
//
// TRABAJA DESDE WORDPRESS, no desde los markdown locales. La primera versión
// leía content/blog/ y solo veía 26 artículos de los 111 publicados: el resto
// se escribió antes de este sistema y no tiene fichero local.
//
// LO QUE NO TOCA:
//   · Los artículos con bloques de Gutenberg (`<!-- wp:`). Meter un estilo
//     dentro de un bloque lo invalida en el editor, y arreglar el color a costa
//     de romper la edición no es un arreglo. Para esos, la regla de CSS.
//   · Nada que no sea el contenido: ni título, ni slug, ni fecha, ni estado, ni
//     autor. Un repintado no es una republicación.
//
//   node scripts/repintar-publicados.mjs            (enseña qué haría)
//   node scripts/repintar-publicados.mjs --aplicar
import fs from "node:fs";
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
const { conColor } = await import("@/lib/blog");
const { CLIENTE } = await import("@/lib/cliente");
const COLOR = CLIENTE.colorTexto;

const auth =
  "Basic " +
  Buffer.from(`${process.env.WP_USER}:${(process.env.WP_APP_PASSWORD || "").replace(/ /g, "")}`).toString("base64");
const wp = (ruta, init = {}) =>
  fetch(`${process.env.WP_URL}/wp-json/wp/v2/${ruta}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120000),
  });

/** Todos los publicados, con su contenido en crudo. */
async function publicados() {
  const out = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await wp(
      `posts?per_page=100&page=${pagina}&status=publish&context=edit&_fields=id,slug,link,content,modified`,
    );
    // Un fallo de credenciales NO es "no hay nada que hacer".
    //
    // Con `if (!r.ok) break`, una contraseña mal puesta devolvía 401 en la
    // primera página, la lista quedaba vacía y el script imprimía
    // "0 artículos publicados · A REPINTAR: 0" y salía con código 0. Un fallo
    // indistinguible del éxito es peor que un fallo.
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(`WordPress devolvió ${r.status} al listar (página ${pagina}): ${j.message ?? "sin detalle"}`);
    }
    const j = await r.json();
    if (!Array.isArray(j) || j.length === 0) break;
    out.push(...j);
    if (j.length < 100) break;
  }
  return out;
}

const todos = await publicados();
console.log(`${todos.length} artículos publicados · color objetivo ${COLOR}\n`);

const gutenberg = [];
const yaEstaban = [];
const sinTabla = [];
const aRepintar = [];

for (const p of todos) {
  const raw = p.content?.raw ?? "";

  // Un bloque de Gutenberg valida su propio HTML contra lo que guardó. Si se le
  // mete un atributo, el editor lo marca como "contenido inesperado" y ofrece
  // recuperarlo, que es peor que la tabla blanca.
  if (/<!--\s*wp:/.test(raw)) {
    if (/<table/i.test(raw)) gutenberg.push(p.slug);
    continue;
  }

  // Solo importan los que tienen tabla: es lo único que el tema pinta mal.
  // Repintar los demás sería tocar artículos publicados para nada.
  if (!/<table/i.test(raw)) {
    sinTabla.push(p.slug);
    continue;
  }

  // Solo las tablas: es lo único que el tema pinta mal en lo ya publicado.
  // Se compara con el resultado, no con la presencia de "color:": los
  // artículos repintados en el intento anterior ya lo tienen y les falta
  // -webkit-text-fill-color, que es lo que de verdad se ve.
  const nuevo = conColor(raw, COLOR, { soloTablas: true });
  if (nuevo === raw) {
    yaEstaban.push(p.slug);
    continue;
  }
  aRepintar.push({ ...p, nuevo, filas: (raw.match(/<tr/gi) ?? []).length });
}

console.log(`sin tabla, no hace falta:        ${sinTabla.length}`);
console.log(`ya tienen el color:              ${yaEstaban.length}`);
console.log(`con tabla y bloques (no se toca): ${gutenberg.length}`);
console.log(`A REPINTAR:                      ${aRepintar.length}\n`);

for (const a of aRepintar) console.log(`  ${a.slug.slice(0, 64).padEnd(66)} ${a.filas} filas`);
if (gutenberg.length) {
  console.log("\nEstos necesitan la regla de CSS, no se pueden repintar sin romper el editor:");
  for (const s of gutenberg) console.log(`  - ${s}`);
}

if (!APLICAR) {
  console.log("\nMODO PLAN. Nada se ha subido. Añade --aplicar.");
  process.exit(0);
}

console.log("\nSubiendo…");
let ok = 0;
const fallos = [];
for (const a of aRepintar) {
  // Solo `content`. Mandar más campos arriesga mover la fecha o el estado de un
  // artículo publicado, y eso sí se nota en Google.
  // Una caída a mitad no puede llevarse el resumen.
  //
  // Sin este try, un TimeoutError en el artículo 20 mataba el proceso con una
  // excepción sin capturar: ni resumen, ni lista de fallos, y sin saber cuáles
  // de los 39 se habían subido ya.
  try {
    const r = await wp(`posts/${a.id}`, { method: "POST", body: JSON.stringify({ content: a.nuevo }) });
    if (r.ok) {
      ok++;
      console.log(`  ok   ${a.slug.slice(0, 64)}`);
    } else {
      const j = await r.json().catch(() => ({}));
      fallos.push(`${a.slug}: ${r.status} ${j.message ?? ""}`);
      console.log(`  MAL  ${a.slug.slice(0, 64)} · ${r.status}`);
    }
  } catch (e) {
    fallos.push(`${a.slug}: ${e?.message ?? e}`);
    console.log(`  MAL  ${a.slug.slice(0, 64)} · ${String(e?.message ?? e).slice(0, 60)}`);
  }
}

console.log(`\n${ok} de ${aRepintar.length} repintados.`);
if (fallos.length) {
  for (const f of fallos) console.log(`  ${f}`);
  process.exit(1);
}
