// La combinación de varios países, contra los casos REALES que la rompieron.
//
// Se prueba la regla sola, con datos ya medidos, para no depender de que Trends
// responda. Los tres casos salieron de la primera corrida contra CO, MX y AR.
//
//   node scripts/probar-multipais.mjs

// La misma regla que lib/trends.ts: mediana de los países CON volumen.
function combinar(paises) {
  const conVolumen = paises.filter((p) => p.direccion !== "sin-volumen");
  if (!conVolumen.length) return { direccion: "sin-volumen", cambioAnual: 0 };
  const c = conVolumen.map((p) => p.cambioAnual).sort((a, b) => a - b);
  const m = Math.floor(c.length / 2);
  const cambioAnual = c.length % 2 ? c[m] : Math.round((c[m - 1] + c[m]) / 2);
  return { direccion: cambioAnual > 15 ? "sube" : cambioAnual < -15 ? "baja" : "estable", cambioAnual };
}

const d = (cambioAnual, nivelActual = 10) => ({ direccion: "x", cambioAnual, nivelActual });
const sinVol = { direccion: "sin-volumen", cambioAnual: 0, nivelActual: 0 };

const CASOS = [
  // [nombre, países, dirección esperada, por qué]
  ["curso gratis: CO+100 MX+100 AR-30", [d(100), d(100), d(-30)], "sube",
   "dos de tres suben; el país de más nivel era el que bajaba y antes mandaba él"],
  ["carrera: CO-50 MX+263 AR-30", [d(-50), d(263), d(-30)], "baja",
   "dos de tres bajan; la media daba +61% por culpa del +263"],
  ["sena: solo CO-48", [d(-48), sinVol, sinVol], "baja",
   "los países sin volumen no votan: no dicen que esté plano, dicen que no saben"],
  ["ninguno con volumen", [sinVol, sinVol], "sin-volumen", "no hay nada que combinar"],
  ["los tres estables", [d(5), d(-3), d(8)], "estable", "dentro del ruido de redondeo"],
];

let fallos = 0;
for (const [nombre, paises, esperado, porque] of CASOS) {
  const r = combinar(paises);
  const ok = r.direccion === esperado;
  if (!ok) fallos++;
  console.log(`  ${ok ? "ok  " : "MAL "} ${nombre.padEnd(34)} -> ${r.direccion} (${r.cambioAnual}%)`);
  if (!ok) console.log(`       esperaba "${esperado}": ${porque}`);
}
console.log(fallos === 0 ? "\nLa mediana describe al conjunto en los 5 casos." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
