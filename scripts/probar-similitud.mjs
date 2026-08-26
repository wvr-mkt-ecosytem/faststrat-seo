// Calibra el umbral de lib/similitud.ts contra los casos REALES del sitio.
//
// Importa la librería en vez de copiar el algoritmo: una prueba que reimplementa
// lo que comprueba deja de comprobarlo en cuanto uno de los dos cambia.
//
// Los pares "deben chocar" son canibalizaciones que Google ya está penalizando,
// medidas en el informe del 24 de agosto de 2026. Los pares "no deben chocar"
// son parejas que el analista defendió expresamente como intenciones distintas.
//
//   node scripts/probar-similitud.mjs

import { parecido, UMBRAL } from "../lib/similitud.ts";

// Canibalizaciones confirmadas: el sistema NO debería haber escrito la segunda.
const DEBEN_CHOCAR = [
  ["The Best SEO Tools for Small Business in 2026",
   "Best SEO Tools for Small Businesses in 2026: Honest Reviews and Picks"],
  ["Jasper vs Copy.ai vs HubSpot AI: Which Marketing AI Wins in 2026?",
   "HubSpot Breeze vs Jasper AI vs Copy.ai in 2026: Which AI Tool Wins?"],
  ["WhatsApp Business para PYMEs en LATAM: guía 2026",
   "WhatsApp Business pricing en LATAM 2026"],
  ["Small Business Marketing Budget 2026",
   "Small Business Marketing Budget: What Percentage of Revenue Should You Spend"],
  ["Prompt Engineering for Marketers 2026",
   "Prompt Engineering for Marketers: 20 Prompts That Work"],
  ["How Nike Turns Storytelling Into a Branding Superpower",
   "How Nike Turns Storytelling Into a Branding Superpower (Optimized)"],
];

// Parejas legítimas: son temas distintos y NO deben bloquearse.
const NO_DEBEN_CHOCAR = [
  // El analista lo defendió dos semanas seguidas: son mercados distintos.
  ["Marketing para PYMEs mexicanas en 2026",
   "Marketing para PYMEs argentinas con presupuesto limitado"],
  // Herramientas vs presupuesto: SERPs distintas, verificado en el informe.
  ["The Best SEO Tools for Small Business in 2026",
   "Small Business Marketing Budget 2026"],
  ["How Much Should an SMB Spend on Marketing?",
   "The Ultimate Landing Page Checklist for 2026"],
  ["GA4 Setup for Small Businesses: Step by Step",
   "Best SEO Tools for Small Business in 2026"],
  ["FastStrat Debuts at Colombia Tech Week 2025",
   "Marketing con IA en LATAM: tendencias 2026"],
  // Mismo producto, preguntas distintas: precios frente a cómo se configura.
  ["WhatsApp Business API Pricing in Mexico",
   "How to Set Up WhatsApp Business API: Step by Step"],
];

let fallos = 0;
let peorLegitimo = 0;
let mejorCanibal = 1;

console.log(`Umbral: ${UMBRAL}\n`);
console.log("DEBEN chocar (canibalizaciones reales del sitio):");
for (const [a, b] of DEBEN_CHOCAR) {
  const p = parecido(a, b);
  mejorCanibal = Math.min(mejorCanibal, p);
  const ok = p >= UMBRAL;
  if (!ok) fallos++;
  console.log(`  ${p.toFixed(2)}  ${ok ? "bloquea" : "PASA ✗ "}   ${a.slice(0, 48)}`);
}

console.log("\nNO deben chocar (temas legítimamente distintos):");
for (const [a, b] of NO_DEBEN_CHOCAR) {
  const p = parecido(a, b);
  peorLegitimo = Math.max(peorLegitimo, p);
  const ok = p < UMBRAL;
  if (!ok) fallos++;
  console.log(`  ${p.toFixed(2)}  ${ok ? "pasa   " : "BLOQUEA ✗"}  ${a.slice(0, 48)}`);
}

console.log(
  `\nMargen: el par legítimo más parecido puntúa ${peorLegitimo.toFixed(2)}; ` +
  `la canibalización menos evidente, ${mejorCanibal.toFixed(2)}.`,
);
console.log(
  fallos === 0
    ? `El umbral ${UMBRAL} separa los ${DEBEN_CHOCAR.length + NO_DEBEN_CHOCAR.length} casos correctamente.`
    : `${fallos} caso(s) mal clasificado(s): hay que mover el umbral o las palabras vacías.`,
);
process.exit(fallos === 0 ? 0 : 1);
