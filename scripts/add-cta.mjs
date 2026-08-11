// Añade el CTA al final de cada artículo del blog.
//
// El hallazgo que lo motiva: los 17 artículos tenían CERO enlaces a
// faststrat.ai. Cuatro mencionaban la marca en prosa, pero sin enlace, así que
// no había nada que pulsar. Eso explica las 0 conversiones mucho mejor que
// cualquier ajuste de título.
//
// Decisiones:
//
// - Un texto por IDIOMA, no uno solo. Tres artículos están en español y cerrar
//   uno de ellos en inglés rompe la lectura justo en el momento en que pides la
//   acción.
//
// - En línea aparte y en negrita. Un CTA embebido en el párrafo se lee como
//   parte del texto y no se pulsa; en línea propia se ve como acción.
//
// - Idempotente: si el enlace ya está, no se duplica. Este script se va a
//   correr más de una vez.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "content", "blog");
const URL = "https://app.faststrat.ai";

const CTA = {
  en: `---

FastStrat runs this as one system instead of a stack you have to assemble: content, lead nurture and reporting in one place, built for teams without a marketing department.

**[Start free at app.faststrat.ai →](${URL})**
`,
  es: `---

FastStrat corre esto como un sistema y no como un conjunto de herramientas que toca ensamblar: contenido, seguimiento de leads y reportes en un solo sitio, pensado para equipos sin departamento de marketing.

**[Empieza gratis en app.faststrat.ai →](${URL})**
`,
};

const files = fs.readdirSync(DIR).filter((f) => /\.mdx?$/.test(f));
let added = 0;
let skipped = 0;

for (const f of files) {
  const full = path.join(DIR, f);
  const raw = fs.readFileSync(full, "utf8");

  if (raw.includes("app.faststrat.ai")) {
    console.log("  ya lo tiene: " + f);
    skipped++;
    continue;
  }

  const { data } = matter(raw);
  const lang = data.lang === "es" ? "es" : "en";

  // Se escribe sobre el archivo crudo y no sobre el resultado de matter para
  // no reordenar ni reformatear el frontmatter existente: gray-matter lo
  // reserializa y cambia comillas y orden de claves sin necesidad.
  const next = raw.trimEnd() + "\n\n" + CTA[lang];
  fs.writeFileSync(full, next);
  console.log("  [" + lang + "] " + f);
  added++;
}

console.log(`\n${added} artículo(s) con CTA añadido, ${skipped} ya lo tenían.`);
