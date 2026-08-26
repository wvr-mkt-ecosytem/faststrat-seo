// Comprueba el detector de legibilidad, y lo corre sobre los artículos REALES
// del repositorio para ver si dispara sobre prosa que ya está publicada.
//
// Lo segundo importa tanto como lo primero: un detector que marca todo lo que
// existe es un detector que se acaba desactivando.
//
//   node scripts/probar-legibilidad.mjs

import fs from "fs";
import path from "path";
import { revisarLegibilidad } from "../lib/legibilidad.ts";

const CASOS = [
  ["This tool serves as a testament to modern marketing.", "avoids-is"],
  ["Industry reports show that adoption is growing.", "vague-source"],
  ["Let's dive in to what you need to know.", "announces-the-point"],
  ["The future looks bright for small business marketing.", "empty-ending"],
  ["In order to achieve results, due to the fact that budgets are small.", "wordy-phrase"],
  ["This could potentially possibly be the answer.", "stacked-hedging"],
  ["I hope this helps. Let me know if you need anything else.", "chatbot-leftover"],
  ["At its core, the real question is about budget.", "fake-depth"],
  [
    `## Strategic Negotiations And Global Partners\n\ntexto\n\n## y este va en minúsculas del todo\n\ntexto\n\n## Another One In Title Case Here\n\ntexto`,
    "heading-case-mixed",
  ],
  ["Growth is strong 🚀 and the team is happy 🎉", "emoji"],
  ["Honestly, the budget matters more than the channel.", "fake-candor"],
  ["Los expertos coinciden en que el presupuesto importa.", "vague-source"],
  ["Es importante destacar que el CAC subió.", "wordy-phrase"],
  ["Marca un antes y un después para el sector.", "inflated-importance"],
];

// Prosa limpia: NO debe disparar nada.
const LIMPIO = `## cuánto cuesta un BSP de WhatsApp

Meta cobra por conversación, no por mensaje. En México la tarifa de marketing
está en 0,0436 dólares y la de utilidad en 0,0089, según la tabla de precios de
Meta de agosto de 2026.

Una tienda que manda 2.000 promociones al mes paga unos 87 dólares. Si además
confirma 1.500 pedidos, suma 13 más.`;

let fallos = 0;

console.log("Cada caso debe disparar su regla:");
for (const [texto, esperada] of CASOS) {
  const hallazgos = revisarLegibilidad(texto);
  const reglas = hallazgos.map((h) => h.rule);
  const ok = reglas.includes(esperada);
  if (!ok) fallos++;
  console.log(`  ${ok ? "detecta" : "FALLA ✗"}  ${esperada.padEnd(20)} ${reglas.length ? `(${[...new Set(reglas)].join(", ")})` : "(nada)"}`);
}

console.log("\nProsa limpia (no debe disparar nada):");
const enLimpio = revisarLegibilidad(LIMPIO);
if (enLimpio.length) { fallos++; console.log(`  FALLA ✗  disparó: ${enLimpio.map((h) => h.rule).join(", ")}`); }
else console.log("  correcto: 0 hallazgos");

// Sobre los artículos reales.
console.log("\nSobre los artículos del repositorio:");
const dir = path.join(process.cwd(), "content", "blog");
const archivos = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
const cuenta = {};
let total = 0;
for (const f of archivos) {
  const cuerpo = fs.readFileSync(path.join(dir, f), "utf8").replace(/^---[\s\S]*?---/, "");
  const h = revisarLegibilidad(cuerpo);
  total += h.length;
  for (const x of h) cuenta[x.rule] = (cuenta[x.rule] ?? 0) + 1;
}
console.log(`  ${archivos.length} artículos, ${total} avisos (${(total / Math.max(archivos.length, 1)).toFixed(1)} por artículo)`);
for (const [r, n] of Object.entries(cuenta).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(n).padStart(4)}  ${r}`);
}

console.log(fallos === 0 ? "\nEl detector acierta en todos los casos." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
