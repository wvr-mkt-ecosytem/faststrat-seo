// Comprueba que la regla del diferencial distingue trabajo hecho de casilla
// marcada. Los casos vienen del informe del 24 de agosto: los diferenciales
// "buenos" son los que el propio analista escribió al comparar SERPs reales.
//
//   node scripts/probar-diferencial.mjs

import { revisarDiferencial } from "../lib/diferencial.ts";

// Diferenciales reales, del tipo que el analista produce cuando mira la SERP.
const DEBEN_PASAR = [
  "Los tres primeros de 'jasper vs copy.ai vs hubspot' son rework.com, dupple.com y planetarylabour.com: " +
    "los tres dan una lista rankeada genérica sin decir para qué tamaño de empresa. Este artículo puntúa las " +
    "tres herramientas sobre doce tareas concretas de marketing de una PYME de menos de diez empleados, con el " +
    "coste por tarea, que no está publicado en ninguno de los tres.",
  "ezcontact.ai y crmwhata.com publican tarifas de BSP para LATAM pero ninguno separa el precio por conversación " +
    "de marketing del de utilidad, que es donde está la diferencia real de factura. Aquí va la tabla con los dos " +
    "tramos en MXN, COP y ARS, calculada sobre las tarifas de Meta de este mes.",
];

// Lo que se escribe cuando no se ha mirado nada.
const DEBEN_BLOQUEARSE = [
  [undefined, "vacío"],
  ["Este artículo es más completo y está mejor escrito que los demás.", "relleno sin competidores"],
  ["Aporta un enfoque único.", "demasiado corto"],
  [
    "Los competidores tratan el tema de forma superficial mientras que nuestro artículo ofrece una perspectiva " +
      "única y mucho más completa sobre la materia, con mayor profundidad en todos los apartados relevantes.",
    "largo pero sin nombrar a nadie",
  ],
];

let fallos = 0;

console.log("Diferenciales REALES (deben pasar):");
for (const d of DEBEN_PASAR) {
  const r = revisarDiferencial(d);
  if (!r.ok) fallos++;
  console.log(`  ${r.ok ? "pasa   " : "BLOQUEA ✗"}  competidores: ${r.competidores.join(", ") || "(ninguno)"}`);
  if (!r.ok) console.log(`            -> ${r.motivo}`);
}

console.log("\nCasillas marcadas (deben bloquearse):");
for (const [d, etiqueta] of DEBEN_BLOQUEARSE) {
  const r = revisarDiferencial(d);
  if (r.ok) fallos++;
  console.log(`  ${r.ok ? "PASA ✗ " : "bloquea"}  ${etiqueta}`);
  if (!r.ok) console.log(`            -> ${r.motivo.slice(0, 110)}`);
}

console.log(fallos === 0 ? "\nCorrecto en los 6 casos." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
