// Las cuatro reglas que salieron de la crítica al artículo de WhatsApp vs SMS.
//
// Cada una nació de un fallo concreto y publicado, así que cada prueba usa el
// caso real y su contrario: una regla que solo dispara con el caso malo no vale
// de nada si también dispara con el bueno.
//
//   node scripts/probar-reglas-editoriales.mjs
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

const { runQa } = await import("@/lib/qa");
const { CASA } = await import("@/lib/publicable");
const { caducidadDe, VIDA_POR_DEFECTO } = await import("@/lib/caducidad");

let fallos = 0;
const comprobar = (nombre, condicion, detalle = "") => {
  console.log(`  ${condicion ? "ok  " : "MAL "} ${nombre}${detalle ? "  · " + detalle : ""}`);
  if (!condicion) fallos++;
};

const reglas = (md) => {
  const r = runQa({ title: "T", metaDescription: "d", markdown: md, house: CASA });
  return [...r.blocking, ...r.warnings].map((f) => f.rule);
};

console.log("\nANCLA FUERA DE CATEGORÍA");
comprobar(
  "el caso publicado bloquea",
  reglas("Ver [FastStrat's marketing automation tools](https://faststrat.ai/marketing-automation).").includes(
    "anchor-off-category",
  ),
);
comprobar(
  "un ancla correcta no bloquea",
  !reglas("Ver [cómo planeamos el contenido](/brandos).").includes("anchor-off-category"),
);
comprobar(
  "la palabra en un enlace AJENO no bloquea",
  !reglas("Ver [marketing automation guide](https://ajeno.com/x).").includes("anchor-off-category"),
  "solo nos importa cómo nos llamamos a nosotros",
);

console.log("\nPRECIO SIN FUENTE PRIMARIA");
comprobar(
  "precio citado desde un vendor avisa",
  reglas("Cuesta $0.0625 por mensaje en Brasil, [según Blueticks](https://blueticks.co/precios).").includes(
    "pricing-not-from-primary-source",
  ),
);
comprobar(
  "precio citado desde la plataforma no avisa",
  !reglas(
    "Cuesta $0.0625 por mensaje en Brasil, [según Meta](https://developers.facebook.com/docs/whatsapp/pricing).",
  ).includes("pricing-not-from-primary-source"),
);
comprobar(
  "un párrafo sin precios no avisa",
  !reglas("WhatsApp domina en LATAM, [según Mazkara](https://mazkara.studio/x).").includes(
    "pricing-not-from-primary-source",
  ),
);

console.log("\nCADUCIDAD");
const hoy = Date.now();
const enDias = (n) => new Date(hoy + n * 86400000).toISOString();
comprobar(
  "una fecha declarada manda sobre el cálculo",
  caducidadDe({ slug: "s", title: "t", date: enDias(-5), caduca: enDias(3) }).estado === "por-caducar",
);
comprobar(
  "sin fecha, se cuenta desde la publicación",
  caducidadDe({ slug: "s", title: "t", date: enDias(-(VIDA_POR_DEFECTO + 10)) }).estado === "caducado",
);
comprobar(
  "un artículo reciente está vigente",
  caducidadDe({ slug: "s", title: "t", date: enDias(-3) }).estado === "vigente",
);
comprobar(
  "una fecha ilegible no rompe: cae al cálculo",
  caducidadDe({ slug: "s", title: "t", date: enDias(-3), caduca: "no es una fecha" }).estado === "vigente",
);

console.log("");
console.log("IDIOMA DEL CUERPO");
const conIdioma = (md, lang) =>
  runQa({ title: "T", markdown: md, house: CASA, lang }).blocking.filter((f) => f.rule === "wrong-language");
const EN = "The best way to audit your site is with a scorecard that shows what to fix and why this matters. ".repeat(8);
const ES = "La mejor forma de auditar tu sitio es con un scorecard que muestre qué arreglar y por qué importa. ".repeat(8);
comprobar("cuerpo en español pedido en inglés bloquea", conIdioma(ES, "en").length === 1);
comprobar("cuerpo en inglés pedido en inglés pasa", conIdioma(EN, "en").length === 0);
comprobar("cuerpo en español pedido en español pasa", conIdioma(ES, "es").length === 0);
comprobar("sin idioma pedido no se pronuncia", conIdioma(ES, undefined).length === 0);
comprobar("un texto corto no se pronuncia", conIdioma("Hola.", "en").length === 0);
console.log("");
console.log("QUIÉN COBRA vs QUIÉN REPORTA");
const precio = (md) =>
  runQa({ title: "T", markdown: md, house: CASA }).warnings.filter((f) => f.rule === "pricing-not-from-primary-source");
comprobar(
  "la marca citando su propio precio pasa",
  precio("[Screaming Frog](https://www.screamingfrog.co.uk/pricing/) cuesta $279/año.").length === 0,
);
comprobar(
  "un vendor citando precio ajeno avisa",
  precio("WhatsApp cuesta $0.0625, [según Blueticks](https://blueticks.co/p).").length === 1,
);

console.log("");
console.log("COLOR DEL TEXTO PUBLICADO");
{
  // El tema del sitio pinta las tablas de BLANCO sobre fondo claro: el
  // artículo cae dentro de un contenedor con `.fs-hero * { color:#fff
  // !important }`. Medido en tres artículos publicados, uno de ellos de agosto:
  // párrafos y listas rgb(17,17,17), celdas rgb(255,255,255).
  //
  // El color se escribe en el HTML para no depender del tema del cliente, que
  // es lo que permite replicar el sistema a otra empresa.
  const { conColor } = await import("@/lib/blog");
  const { CLIENTE } = await import("@/lib/cliente");
  const c = CLIENTE.colorTexto;
  comprobar("pinta las celdas de tabla", conColor("<td>x</td>", c).includes(`color:${c} !important`));
  comprobar("pinta los párrafos", conColor("<p>x</p>", c).includes(`color:${c}`));
  comprobar(
    "respeta un color puesto a mano",
    conColor('<p style="color:red">x</p>', c) === '<p style="color:red">x</p>',
  );
  comprobar(
    "conserva los demás estilos",
    (() => {
      const r = conColor('<p style="margin:0">x</p>', c);
      return r.includes("margin:0") && r.includes(`color:${c}`);
    })(),
  );
  comprobar(
    "no toca los enlaces, que llevan su propio color",
    !/\<a[^>]*color:/.test(conColor('<p>ver <a href="https://x.com">esto</a></p>', c)),
  );
  comprobar("va con !important, o el tema gana", conColor("<th>x</th>", c).includes("!important"));
}

console.log("\nEL ARTÍCULO QUE PROVOCÓ TODO ESTO");
const ruta = "content/blog/whatsapp-vs-sms-marketing-latam-smbs-2026-open-rates.md";
if (fs.existsSync(ruta)) {
  const matter = (await import("gray-matter")).default;
  const { data, content } = matter(fs.readFileSync(ruta, "utf8"));
  const r = runQa({ title: data.title, metaDescription: data.excerpt, markdown: content, house: CASA });
  const nuevas = [...r.blocking, ...r.warnings].filter((f) =>
    /anchor-off-category|pricing-not-from-primary/.test(f.rule),
  );
  console.log(`  ${nuevas.length} hallazgo(s) de las reglas nuevas sobre el artículo real:`);
  for (const f of nuevas) console.log(`    [${f.severity}] ${f.rule} · ${f.detail.slice(0, 78)}`);
  comprobar("el artículo real no tiene bloqueos", r.blocking.length === 0, `${r.blocking.length} bloqueo(s)`);
}

console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobación(es) mal.\n`);
process.exit(fallos === 0 ? 0 : 1);
