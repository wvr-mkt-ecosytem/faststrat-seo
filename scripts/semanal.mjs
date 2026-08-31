// La corrida de los lunes, dentro de GitHub Actions.
//
// POR QUÉ EXISTE: el cron le hacía curl a Render y Render se moría. En el plan
// gratis, una llamada al agente se come la CPU, el health check deja de
// responder en 5 segundos, Render da el servicio por caído y lo reinicia. Las
// tres últimas corridas del lunes fallaron así, y las tres veces el diagnóstico
// fue una variable de entorno mal puesta en Render.
//
// Aquí no hay servidor web al que matar: se importa la MISMA librería que usa
// la ruta (lib/semanal.ts, lib/ga4-analyst.ts) y se corre directo, con los
// secrets de GitHub. Es lo mismo que ya se hizo con escribir un artículo.
//
//   node scripts/semanal.mjs            (ideas + análisis)
//   node scripts/semanal.mjs --solo-ideas
//   node scripts/semanal.mjs --solo-analisis
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

for (const archivo of [".env.local", ".env"]) {
  if (!fs.existsSync(archivo)) continue;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  break;
}

// El alias "@/" solo lo entiende el bundler de Next.
register(
  "data:text/javascript," +
    encodeURIComponent(`
  const raiz = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
  export async function resolve(e, c, s) {
    if (e.startsWith("@/")) return s(new URL(e.slice(2) + ".ts", raiz).href, c);
    return s(e, c);
  }`),
  import.meta.url,
);

const soloIdeas = process.argv.includes("--solo-ideas");
const soloAnalisis = process.argv.includes("--solo-analisis");

// Cada parte se cuenta por separado y ninguna tumba a la otra.
//
// Antes las dos iban en pasos de curl encadenados: si las ideas fallaban, el
// paso salía con código 1 y el análisis ni se intentaba. Son trabajos
// independientes y no hay razón para que uno se lleve al otro por delante.
const fallos = [];

if (!soloAnalisis) {
  console.log("=== IDEAS DE LA SEMANA ===");
  const t0 = Date.now();
  try {
    const { generarTanda } = await import("@/lib/semanal");
    const r = await generarTanda();
    console.log(`[${((Date.now() - t0) / 60000).toFixed(1)} min] ${r.ideas} ideas · semana del ${r.weekOf}`);
    console.log(`  descartadas: ${r.descartadasPorRepetir} por repetir · ${r.descartadasPorPisarse} por pisarse`);
    console.log(`  con tendencia: ${r.conTendencia}`);
    console.log(`  correo: ${r.emailed ? "enviado" : `NO se envió${r.emailError ? ` (${r.emailError})` : ""}`}`);
  } catch (e) {
    console.error(`  FALLÓ: ${e?.message ?? e}`);
    fallos.push("ideas");
  }
}

if (!soloIdeas) {
  console.log("\n=== ANÁLISIS SEMANAL DE SEO ===");
  const t0 = Date.now();
  try {
    const { analyse } = await import("@/lib/ga4-analyst");
    const { guardarInforme } = await import("@/lib/reports-store");
    const { informeComoCorreo } = await import("@/lib/informe-email");
    const { sendEmail } = await import("@/lib/email");
    const { persistChanges } = await import("@/lib/persist");

    const informe = guardarInforme(await analyse(28));
    console.log(`[${((Date.now() - t0) / 60000).toFixed(1)} min] ${(informe.recommendations ?? []).length} recomendaciones`);

    const persistido = await persistChanges(`informe del analista: ${informe.generadoEn.slice(0, 10)}`, [
      path.join(process.cwd(), "data", "reports"),
    ]);
    console.log(`  guardado: ${persistido.ok ? "sí" : `NO (${persistido.error})`}`);

    const destino = process.env.REPORT_EMAIL_TO;
    if (destino) {
      const { subject, html } = informeComoCorreo(informe, process.env.APP_BASE_URL);
      const c = await sendEmail({ to: destino, subject, html });
      console.log(`  correo: ${c.ok ? `enviado a ${destino}` : `NO se envió (${c.error})`}`);
    } else {
      console.log("  correo: no hay REPORT_EMAIL_TO configurado");
    }
  } catch (e) {
    console.error(`  FALLÓ: ${e?.message ?? e}`);
    fallos.push("análisis");
  }
}

if (fallos.length) {
  console.error(`\nFalló: ${fallos.join(" y ")}.`);
  process.exit(1);
}
console.log("\nTodo listo.");
