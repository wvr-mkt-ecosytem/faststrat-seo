// Prueba el flujo completo de escritura con las tres reglas nuevas:
//   1. el choque de títulos frena ANTES de gastar el agente
//   2. el artículo nace con autor y fecha
//   3. el diferencial es obligatorio y queda guardado
//
//   node scripts/probar-flujo-escritura.mjs [base]
import fs from "fs";
import http from "http";
import https from "https";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = process.argv[2] || "http://localhost:3100";
const A = "Basic " + Buffer.from(`${env.DASHBOARD_USER}:${env.DASHBOARD_PASSWORD}`).toString("base64");
const t0 = Date.now();
const min = () => ((Date.now() - t0) / 60000).toFixed(1);

/**
 * POST con el módulo http de Node, no con fetch.
 *
 * El fetch de Node corta a los 5 minutos esperando la primera cabecera
 * (UND_ERR_HEADERS_TIMEOUT) y estas rutas tardan más. El fallo se lee como si
 * el servidor hubiera fallado, cuando sigue trabajando y termina: así dimos por
 * perdido un informe del analista que en realidad sí se había guardado. El
 * módulo http no impone ese límite.
 */
function post(ruta, cuerpo) {
  const u = new URL(BASE + ruta);
  const lib = u.protocol === "https:" ? https : http;
  const datos = JSON.stringify(cuerpo);
  return new Promise((resolve, reject) => {
    const req = lib.request(
      u,
      {
        method: "POST",
        headers: {
          Authorization: A,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(datos),
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try { resolve([res.statusCode, JSON.parse(body)]); }
          catch { resolve([res.statusCode, null]); }
        });
      },
    );
    req.on("error", reject);
    req.write(datos);
    req.end();
  });
}

let fallos = 0;

// --- 1. Un tema ya cubierto debe frenar sin gastar agente.
console.log("1. Tema que ya está cubierto (debe frenar rápido, sin llamar al agente)");
const antes = Date.now();
const [s1, j1] = await post("/api/blog/generate", {
  keyword: "best SEO tools for small business 2026",
  lang: "en",
});
const seg = ((Date.now() - antes) / 1000).toFixed(1);
console.log(`   -> ${s1} en ${seg}s`);
if (s1 === 409) {
  console.log(`   ${j1.explicacion?.slice(0, 140)}`);
  if (Number(seg) > 60) { fallos++; console.log("   ✗ tardó demasiado: debería frenar antes del agente"); }
} else { fallos++; console.log("   ✗ debería haber devuelto 409"); }

// --- 2. Un tema nuevo debe escribirse entero, con autor, fecha y diferencial.
console.log("\n2. Tema nuevo, con fecha de publicación programada (llama al agente; tarda minutos)");
const dentroDeTresDias = new Date(Date.now() + 3 * 86400000).toISOString();
const [s2, j2] = await post("/api/blog/generate", {
  keyword: "how to calculate customer acquisition cost for a small business",
  lang: "en",
  category: "Analytics",
  publishAt: dentroDeTresDias,
});
console.log(`   [${min()} min] -> ${s2}`);
if (s2 === 200 && j2?.ok) {
  console.log(`   título:       ${j2.title}`);
  console.log(`   autor:        ${j2.author}`);
  console.log(`   publishAt:    ${j2.publishAt}`);
  console.log(`   palabras:     ${j2.wordCount}`);
  console.log(`   diferencial:  ${j2.diferencial ? j2.diferencial.slice(0, 180) : "(NINGUNO)"}`);
  if (j2.pendientes) console.log(`   pendientes:   ${j2.pendientes.length}`);
  if (j2.author !== "Walter Von Roestel") { fallos++; console.log("   ✗ el autor no es el configurado"); }
  if (!j2.publishAt) { fallos++; console.log("   ✗ no guardó la fecha programada"); }
  if (!j2.diferencial) { fallos++; console.log("   ✗ no guardó el diferencial"); }
  if (j2.pendientes?.some((p) => /diferencial|SERP/i.test(p))) {
    fallos++; console.log("   ✗ quedó bloqueado por el diferencial");
  }
} else {
  fallos++;
  console.log("   ✗", JSON.stringify(j2)?.slice(0, 250));
}

console.log(fallos === 0 ? `\n[${min()} min] Las dos pruebas pasan.` : `\n[${min()} min] ${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
