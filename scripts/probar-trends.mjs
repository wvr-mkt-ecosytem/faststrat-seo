// Comprueba Google Trends contra casos cuya dirección SÍ conocemos.
//
// Solo se afirma lo verificable. La primera versión daba por hecho que "ai
// marketing tools" subía, y el dato dijo -48%: eso comprobaba mi suposición,
// no el código. El caso de control es el fax, que lleva veinte años cayendo.
//
//   node scripts/probar-trends.mjs
import { tendencia, describir } from "../lib/trends.ts";

const CASOS = [
  // [término, geo, dirección esperada o null, nivel máximo esperado o null]
  ["fax machine", "", "baja", 40],
  ["chatgpt", "", null, null],
  ["ai marketing tools", "", null, null],
  ["whatsapp business api", "MX", null, null],
  ["seo for small business", "US", null, null],
];

let fallos = 0;
for (const [t, geo, dir, nivelMax] of CASOS) {
  const r = await tendencia(t, geo);
  if (!r) { console.log(`  SIN DATOS  ${t}`); fallos++; continue; }
  const mal = [];
  if (dir && r.direccion !== dir) mal.push(`esperaba "${dir}"`);
  if (nivelMax != null && r.nivelActual > nivelMax) mal.push(`esperaba nivel <= ${nivelMax}`);
  if (mal.length) fallos++;
  console.log(`  ${(t + (geo ? ` [${geo}]` : "")).padEnd(32)} ${describir(r)}${mal.length ? "  <-- " + mal.join(", ") : ""}`);
  await new Promise((s) => setTimeout(s, 1200));
}
console.log(fallos === 0 ? "\nTodos respondieron y el control es correcto." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
