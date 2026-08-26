// Comprueba el detector de títulos duplicados contra el inventario REAL,
// a través de la API (que es como lo usa el sistema).
//
//   node scripts/probar-catalogo.mjs [http://localhost:3100]
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = process.argv[2] || "http://localhost:3100";
const A = "Basic " + Buffer.from(`${env.DASHBOARD_USER}:${env.DASHBOARD_PASSWORD}`).toString("base64");

const revisar = async (title) => {
  const r = await fetch(`${BASE}/api/blog/title-check`, {
    method: "POST",
    headers: { Authorization: A, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
    signal: AbortSignal.timeout(120000),
  });
  return r.json();
};

// Títulos que el sistema PODRÍA proponer y que duplican algo que ya existe.
const DEBEN_BLOQUEARSE = [
  "Best SEO Tools for Small Businesses in 2026: Honest Reviews",
  "HubSpot Breeze vs Jasper AI vs Copy.ai: Which AI Tool Wins in 2026?",
  "WhatsApp Business Pricing for LATAM in 2026",
];
// Temas que no existen todavía: tienen que pasar.
const DEBEN_PASAR = [
  "Cómo calcular el CAC de una PYME sin equipo de datos",
  "Qué preguntar a una agencia antes de firmar un contrato anual",
  "Local SEO for Service Businesses: Ranking in Your City",
];

const primero = await revisar(DEBEN_BLOQUEARSE[0]);
console.log(`Catálogo comparado: ${primero.comparados} títulos`);
if (primero.aviso) console.log("  aviso:", primero.aviso);

let fallos = 0;
console.log("\nDeberían BLOQUEARSE (duplican algo existente):");
for (const t of DEBEN_BLOQUEARSE) {
  const v = await revisar(t);
  if (v.ok) fallos++;
  console.log(`  ${v.ok ? "PASA ✗ " : "bloquea"}  ${t.slice(0, 54)}`);
  if (!v.ok) console.log(`           -> ${v.explicacion.slice(0, 130)}`);
}

console.log("\nDeberían PASAR (temas nuevos):");
for (const t of DEBEN_PASAR) {
  const v = await revisar(t);
  if (!v.ok) fallos++;
  console.log(`  ${v.ok ? "pasa   " : "BLOQUEA ✗"}  ${t.slice(0, 54)}`);
  if (!v.ok) console.log(`           -> ${v.explicacion.slice(0, 130)}`);
}

console.log(fallos === 0 ? "\nCorrecto en los 6 casos." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
