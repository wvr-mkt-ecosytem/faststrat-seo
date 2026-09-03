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

console.log("\nEL ARTÍCULO QUE PROVOCÓ TODO ESTO");
const ruta = "content/blog/whatsapp-vs-sms-marketing-latam-smbs-2026-open-rates.md";
if (fs.existsSync(ruta)) {
  const matter = (await import("gray-matter")).default;
  const { data, content } = matter(fs.readFileSync(ruta, "utf8"));
  const r = runQa({ title: data.title, metaDescription: data.excerpt, markdown: content, house: CASA });
  const nuevas = [...r.blocking, ...r.warnings].filter((f) =>
    /anchor-off-category|pricing-not-from-primary/.test(f.rule),
  );
  console.log(`  ${nuevas.length} hallazgo(s) de las reglas nuevas:`);
  for (const f of nuevas) console.log(`    [${f.severity}] ${f.rule}`);
  comprobar("las reglas nuevas encuentran lo que encontró la crítica", nuevas.length >= 2);
}

console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobación(es) mal.\n`);
process.exit(fallos === 0 ? 0 : 1);
