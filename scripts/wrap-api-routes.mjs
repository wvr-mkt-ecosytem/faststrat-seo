// Envuelve TODOS los handlers de ruta con apiRoute().
//
// Se hace a todas y no solo a las que fallan hoy: varias tenían try/catch pero
// el throw ocurría FUERA de él (una lectura de hoja antes del try), así que el
// 500 con cuerpo vacío salía igual. Buscar cuáles están bien cubiertas una por
// una es más frágil que envolverlas todas.
//
// El cierre se calcula contando llaves desde la apertura del handler, no con
// una expresión regular sobre el final del archivo: un archivo con dos
// handlers dejaba el primero sin cerrar.
import fs from "node:fs";
import path from "node:path";

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name === "route.ts" ? [p] : [];
  });

/** Índice de la llave que cierra el bloque abierto en `open`. */
function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

let total = 0;
for (const file of walk("app/api")) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("apiRoute(")) continue;

  const re = /export async function (GET|POST|PUT|DELETE|PATCH)\s*\(([^)]*)\)\s*\{/g;
  const hits = [...src.matchAll(re)];
  if (!hits.length) continue;

  // De atrás hacia delante: cada reemplazo mueve los índices posteriores.
  for (const m of hits.reverse()) {
    const openBrace = m.index + m[0].length - 1;
    const close = matchBrace(src, openBrace);
    if (close < 0) {
      console.log(`  llave sin cerrar en ${file}, se salta`);
      continue;
    }
    src =
      src.slice(0, m.index) +
      `export const ${m[1]} = apiRoute(async (${m[2]}) => {` +
      src.slice(openBrace + 1, close) +
      "});" +
      src.slice(close + 1);
  }

  if (!src.includes('from "@/lib/google-auth-state"')) {
    src = src.replace(/^(import .*\n)/m, `$1import { apiRoute } from "@/lib/google-auth-state";\n`);
  }
  fs.writeFileSync(file, src);
  total += hits.length;
  console.log(`  ${file}  ${hits.length}`);
}
console.log(`\n${total} handler(s) envueltos.`);
