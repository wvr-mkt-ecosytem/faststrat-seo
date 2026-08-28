// El suelo que impide que una "corrección" se lleve el artículo por delante.
//
// El caso real: corregir 5 cifras sin fuente dejó el artículo en 1.151 palabras
// de 1.951 y con 3 secciones de 7. La compuerta lo dio por bueno porque solo
// mira la forma. Esto es la comprobación que faltaba.
//
//   node scripts/probar-suelo.mjs

// La misma regla que lib/publicable.ts.
const MIN = 0.75;
function seLoLlevoPorDelante(antes, despues) {
  const palabras = (t) => t.split(/\s+/).filter(Boolean).length;
  const secciones = (t) => (t.match(/^##\s+/gm) ?? []).length;
  const pA = palabras(antes), pD = palabras(despues);
  if (pA > 0 && pD / pA < MIN) return `perdió ${pA - pD} palabras de ${pA}`;
  const sA = secciones(antes), sD = secciones(despues);
  if (sA >= 3 && sD < sA - 1) return `borró ${sA - sD} secciones de ${sA}`;
  return null;
}

const seccion = (n, palabras) => `## Sección ${n}\n\n${"palabra ".repeat(palabras)}\n`;
const articulo = (n, palabras) => Array.from({ length: n }, (_, i) => seccion(i + 1, palabras)).join("\n");

const CASOS = [
  ["el caso real: 7 secciones -> 3", articulo(7, 100), articulo(3, 100), true,
   "cuatro secciones enteras desaparecidas"],
  ["cambio mínimo: una frase menos", articulo(7, 100), articulo(7, 97), false,
   "es lo que debe pasar al corregir de verdad"],
  ["quita una sección de siete", articulo(7, 100), articulo(6, 100), false,
   "una sección de más o de menos entra dentro de lo razonable"],
  ["se lleva la mitad del texto", articulo(4, 100), articulo(4, 40), true,
   "mismas secciones, pero vaciadas"],
  ["artículo corto sin secciones", "palabra ".repeat(100), "palabra ".repeat(95), false,
   "sin H2 no se puede juzgar por secciones, solo por texto"],
  ["artículo corto, mutilado", "palabra ".repeat(100), "palabra ".repeat(40), true,
   "el recuento lo caza igual"],
];

let fallos = 0;
for (const [nombre, antes, despues, deberiaFrenar, porque] of CASOS) {
  const r = seLoLlevoPorDelante(antes, despues);
  const freno = r !== null;
  const ok = freno === deberiaFrenar;
  if (!ok) fallos++;
  console.log(`  ${ok ? "ok  " : "MAL "} ${nombre.padEnd(34)} ${freno ? "FRENA · " + r : "deja pasar"}`);
  if (!ok) console.log(`       ${porque}`);
}
console.log(fallos === 0 ? "\nEl suelo distingue corregir de destrozar en los 6 casos." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
