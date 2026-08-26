// Añade la tendencia de Google Trends a los artículos que ya existen.
//
// Es dato, no criterio: no hace falta agente. Sin esto, la pantalla solo
// enseñaría la tendencia de lo que se escriba de ahora en adelante, y los 21
// artículos que ya hay se quedarían sin ella para siempre.
//
//   node scripts/rellenar-tendencias.mjs
import fs from "fs";
import path from "path";
import { tendencia, describir } from "../lib/trends.ts";

const DIR = path.join(process.cwd(), "content", "blog");
const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".md"));
let puestas = 0, sinDatos = 0, yaEstaban = 0;

for (const f of archivos) {
  const ruta = path.join(DIR, f);
  const bruto = fs.readFileSync(ruta, "utf8");
  const m = bruto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) continue;
  const [, cab, cuerpo] = m;

  if (/^keywordTrend:/m.test(cab)) { yaEstaban++; continue; }

  const kw = cab.match(/^keywords:\r?\n\s+-\s+(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!kw) { sinDatos++; continue; }

  const t = await tendencia(kw);
  if (!t) {
    console.log(`  sin datos   ${kw.slice(0, 52)}`);
    sinDatos++;
    await new Promise((s) => setTimeout(s, 1200));
    continue;
  }

  const bloque =
    `keywordTrend:\n` +
    `  direccion: ${t.direccion}\n` +
    `  cambioAnual: ${t.cambioAnual}\n` +
    `  nivelActual: ${t.nivelActual}`;
  fs.writeFileSync(ruta, `---\n${cab}\n${bloque}\n---\n${cuerpo}`);
  console.log(`  ${describir(t).padEnd(56)} ${kw.slice(0, 46)}`);
  puestas++;
  await new Promise((s) => setTimeout(s, 1200));
}

console.log(`\n${puestas} rellenadas, ${yaEstaban} ya la tenían, ${sinDatos} sin datos.`);
