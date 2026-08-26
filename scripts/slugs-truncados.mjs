// Encuentra los slugs cortados a media palabra y propone el limpio.
//
// No toca nada: solo lista, con el dato de Search Console al lado para poder
// decidir. Cambiar el slug de una página que rankea es irreversible en la
// práctica (Google tarda semanas en reevaluar), así que la decisión se toma
// mirando el tráfico, no a ojo.
//
//   node scripts/slugs-truncados.mjs
import fs from "fs";
import { slugify } from "../lib/slug.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const cfg = {
  url: env.WP_URL.replace(/\/$/, ""),
  auth: "Basic " + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASSWORD.replace(/\s/g, "")}`).toString("base64"),
};

const wp = async (ruta) => {
  const r = await fetch(`${cfg.url}/wp-json/wp/v2/${ruta}`, {
    headers: { Authorization: cfg.auth },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`WP ${ruta} -> ${r.status}`);
  return r.json();
};

// --- Todos los posts publicados.
const posts = [];
for (let page = 1; page <= 5; page++) {
  const l = await wp(`posts?per_page=100&page=${page}&status=publish&_fields=id,slug,title,link`);
  if (!Array.isArray(l) || !l.length) break;
  posts.push(...l);
  if (l.length < 100) break;
}
console.log(`${posts.length} posts publicados\n`);

const limpiarTitulo = (t) =>
  String(t?.rendered ?? "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

/**
 * ¿La última palabra del slug está PARTIDA?
 *
 * El criterio tiene que ser estrecho. La primera versión marcaba cualquier
 * slug cuyo último trozo no apareciera entero en el título, y eso daba 13
 * casos en vez de 6: metía dentro slugs acortados a mano y perfectamente
 * buenos, como `/zero-dollar-marketing-strategy-bootstrapped-smb/` (por "smb"
 * frente a "SMBs") o `/how-nike-...-optimized/`, cuyo sufijo es deliberado. Y
 * proponía cambiarlos por versiones peores.
 *
 * Partida significa una cosa concreta: el último trozo es el PRINCIPIO de una
 * palabra del título y se quedó a medias. "-p" de "pricing", "-tha" de "that",
 * "-w" de "without", "-compl" de "comparativa". Si es una palabra entera, o si
 * no aparece en el título en absoluto, no está partida: está elegida.
 */
function truncado(slug, titulo) {
  const partes = slug.split("-");
  const ultima = partes[partes.length - 1];
  if (!ultima) return false;

  const palabras = titulo
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);

  // Caso 1: la última palabra está partida por la mitad.
  //
  // Sin límite de longitud. El corte a 60 lo hace nuestro slugify, pero pueden
  // existir slugs partidos por otra herramienta o a mano, y una palabra rota se
  // ve igual de mal en la SERP mida lo que mida la URL. Se exige que el trozo
  // tenga al menos 2 letras para no marcar siglas ni números sueltos.
  if (!palabras.includes(ultima)) {
    return palabras.some((w) => {
      if (!w.startsWith(ultima) || w.length <= ultima.length) return false;
      // Singular frente a plural NO es un corte: es una elección.
      // "/zero-dollar-...-bootstrapped-smb/" contra "SMBs" del título, o
      // "/agency-vs-diy-vs-ai-marketing-smb/". Sin esta salvedad, el detector
      // proponía cambiarlos por versiones peores ("/0-marketing-strategy...").
      const sufijo = w.slice(ultima.length);
      return sufijo !== "s" && sufijo !== "es";
    });
  }

  // Caso 2: el corte cayó justo en un límite de palabra, por casualidad.
  //
  // Pasa con /ga4-setup-...-step-by-step-guide-no/, cortado antes de "Agency":
  // "no" es una palabra entera del título, así que el caso 1 no lo ve.
  //
  // Dos condiciones, y las dos hacen falta:
  //
  // 1. El slug mide entre 58 y 60. Ese es el rango que produce .slice(0, 60);
  //    uno de 74 caracteres no lo hizo nuestro código y no es cosa nuestra.
  // 2. Falta la ÚLTIMA palabra con contenido del título. Eso es exactamente lo
  //    que significa "cortado por el final", y es lo único que hay que
  //    comprobar. Mirar si falta CUALQUIER palabra daba falsos positivos con
  //    los apóstrofos: "Barbie's" produce los tokens "barbie" y "s", el slug
  //    dice "barbies", y el slug estaba entero.
  if (slug.length < 58 || slug.length > 60) return false;
  const conContenido = palabras.filter((w) => w.length > 3);
  const ultimaDelTitulo = conContenido[conContenido.length - 1];
  return !!ultimaDelTitulo && !slug.split("-").includes(ultimaDelTitulo);
}

const rotos = [];
for (const p of posts) {
  const titulo = limpiarTitulo(p.title);
  if (slugify(titulo) === p.slug) continue;
  if (truncado(p.slug, titulo)) rotos.push({ ...p, titulo, propuesto: slugify(titulo) });
}

console.log(`${rotos.length} con el slug cortado a media palabra:\n`);
for (const r of rotos) {
  console.log(`  #${r.id}  ${r.titulo.slice(0, 66)}`);
  console.log(`     actual:   /${r.slug}/`);
  console.log(`     propuesto:/${r.propuesto}/`);
  console.log(`     choca con otro post: ${posts.some((x) => x.slug === r.propuesto && x.id !== r.id) ? "SÍ (no tocar)" : "no"}`);
  console.log("");
}

fs.writeFileSync("data/slugs-truncados.json", JSON.stringify(rotos.map((r) => ({
  id: r.id, actual: r.slug, propuesto: r.propuesto, titulo: r.titulo, link: r.link,
})), null, 2));
console.log("Guardado en data/slugs-truncados.json");
