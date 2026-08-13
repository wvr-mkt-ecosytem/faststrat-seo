// Comprueba que las páginas citadas CONTENGAN la cifra que se les atribuye.
//
// La compuerta de qa.ts mira que haya una URL cerca de cada cifra. Eso es
// proximidad, no verdad, y se satisface añadiendo cualquier enlace. El coste
// real de esa diferencia salió medido:
//
//   - La página de la SBA se citaba CUATRO veces para un 7-8% que no dice.
//     Lo que publica es 7,9%.
//   - Un rango de "$1.500-$4.000/mes" citaba una página cuyas cifras de EE.UU.
//     son $700-$5.000: los $1.500-$4.000 eran la columna del Reino Unido.
//   - Un enlace apuntaba a un dominio que devuelve 403, o sea que nadie podía
//     comprobarlo.
//
// Los tres pasaban la compuerta. Esto es lo único que los detecta.
//
// No sustituye a la compuerta: la compuerta corre en milisegundos y bloquea la
// publicación; esto tarda minutos porque abre páginas de verdad, así que va
// aparte y se corre a mano o en el trabajo semanal.
//
// Uso:
//   node scripts/verify-citations.mjs            todos los artículos
//   node scripts/verify-citations.mjs <slug>     uno solo
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "content", "blog");
const soloSlug = process.argv[2];

/** Cifras: la misma forma que reconoce qa.ts, más importes. */
const CIFRA = /\d+(?:[.,]\d+)?\s?%|\$\s?\d[\d,.]*|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g;
const ENLACE = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

/** Variantes con las que una misma cifra aparece escrita en otra página. */
function variantes(c) {
  const limpio = c.trim();
  const num = limpio.replace(/[$%\s]/g, "");
  const out = new Set([limpio, num]);

  // 7,9 y 7.9 son la misma cifra escrita en dos convenciones. Sin esto, un
  // artículo en español nunca casaría con una fuente en inglés.
  out.add(num.replace(/,/g, "."));
  out.add(num.replace(/\./g, ","));
  // Separadores de millar: "8,000" y "8000".
  out.add(num.replace(/,/g, ""));
  out.add(num.replace(/\./g, ""));
  // Un 7.0% se publica muchas veces como 7%.
  if (/^\d+[.,]0$/.test(num)) out.add(num.split(/[.,]/)[0]);
  return [...out].filter(Boolean);
}

const leer = async (url) => {
  try {
    const r = await fetch(url, {
      headers: {
        // Sin user-agent, bastantes sitios devuelven 403 y el enlace parecería
        // roto cuando el problema es el bot, no la página.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en,es;q=0.9",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const html = await r.text();
    // El texto visible. Los scripts y estilos meten números que no son del
    // contenido y darían falsos positivos.
    const texto = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
    // Una página de precios moderna monta el precio con JavaScript, así que el
    // HTML que llega no lo contiene. Eso NO es una cita falsa: es una página
    // que no se puede verificar así. Mezclar las dos cosas convertiría este
    // informe en el mismo tipo de dato poco fiable que vino a detectar.
    const palabras = texto.trim().split(/\s+/).length;
    if (palabras < 250) return { texto, dudoso: `solo ${palabras} palabras legibles: probablemente se renderiza con JavaScript` };
    return { texto };
  } catch (e) {
    return { error: e.name === "TimeoutError" ? "sin respuesta en 25s" : String(e.message).slice(0, 60) };
  }
};

const archivos = fs
  .readdirSync(DIR)
  .filter((f) => /\.mdx?$/.test(f))
  .filter((f) => !soloSlug || f.startsWith(soloSlug));

const cache = new Map();
let totalPares = 0;
let confirmadas = 0;
const problemas = [];

for (const archivo of archivos) {
  const { content } = matter(fs.readFileSync(path.join(DIR, archivo), "utf8"));
  const lineas = content.split("\n");

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    // Misma ventana que la compuerta: la fuente suele ir en la frase siguiente.
    const ventana = [lineas[i - 1] || "", linea, lineas[i + 1] || ""].join(" ");
    // Solo enlaces EXTERNOS cuentan como cita.
    //
    // Un enlace a una página propia junto a una cifra no la respalda: es
    // navegación, no fuente. Contarlo hacía que el informe acusara a
    // faststrat.ai de "no contener" estadísticas de terceros, que es cierto y
    // no significa nada.
    const urls = [...ventana.matchAll(ENLACE)]
      .map((m) => m[2])
      .filter((u) => !/^https?:\/\/([^/]*\.)?faststrat\.ai/i.test(u));
    if (!urls.length) continue;

    // Se quitan los enlaces ANTES de buscar cifras. Si no, los números de la
    // propia URL cuentan como afirmaciones: un slug acabado en "-06082020" se
    // leía como la cifra "060820" y se reportaba que la página no la contiene,
    // lo cual es cierto y completamente irrelevante.
    const prosa = linea.replace(ENLACE, " ");
    const cifras = [...new Set((prosa.match(CIFRA) || []).map((c) => c.trim()))]
      // Los años no son afirmaciones que verificar.
      .filter((c) => !/^\b(19|20)\d{2}$/.test(c.replace(/[$%\s]/g, "")))
      // "$0" y "0%" no son datos que ninguna fuente deba respaldar.
      .filter((c) => !/^\$?0([.,]0+)?%?$/.test(c.replace(/\s/g, "")));
    if (!cifras.length) continue;

    for (const url of urls) {
      if (!cache.has(url)) cache.set(url, await leer(url));
      const pagina = cache.get(url);

      for (const cifra of cifras) {
        totalPares++;
        if (pagina.error) {
          problemas.push({ archivo, cifra, url, motivo: `no se pudo leer (${pagina.error})` });
          continue;
        }
        const casa = variantes(cifra).some((v) => v.length >= 2 && pagina.texto.includes(v));
        if (casa) confirmadas++;
        else if (pagina.dudoso) problemas.push({ archivo, cifra, url, motivo: `no verificable (${pagina.dudoso})` });
        else problemas.push({ archivo, cifra, url, motivo: "la página NO contiene esta cifra" });
      }
    }
  }
}

console.log(`\n${totalPares} cifra(s) con enlace comprobadas en ${archivos.length} artículo(s).`);
console.log(`${confirmadas} confirmadas en la página citada, ${problemas.length} sin confirmar.\n`);

const porArchivo = new Map();
for (const p of problemas) {
  if (!porArchivo.has(p.archivo)) porArchivo.set(p.archivo, []);
  porArchivo.get(p.archivo).push(p);
}
for (const [archivo, lista] of porArchivo) {
  console.log(`### ${archivo}`);
  for (const p of lista) {
    console.log(`   ${p.cifra.padEnd(10)} ${p.motivo}`);
    console.log(`   ${" ".repeat(10)} ${p.url.slice(0, 100)}`);
  }
  console.log();
}

// "No se pudo leer" no es lo mismo que "la cifra no está": lo primero puede ser
// un bloqueo al bot y lo segundo es una cita falsa. Se cuentan aparte para no
// mezclar una sospecha con un hallazgo.
const falsas = problemas.filter((p) => p.motivo.startsWith("la página NO"));
const ilegibles = problemas.filter((p) => !p.motivo.startsWith("la página NO"));
console.log(`Citas que la página no respalda: ${falsas.length}`);
console.log(`Páginas que no se pudieron leer: ${ilegibles.length} (puede ser bloqueo al bot, no cita falsa)`);
