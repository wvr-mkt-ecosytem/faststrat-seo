// Para cada consulta con margen, qué página la recibe y qué título tiene hoy.
//
// Hace falta porque las oportunidades salen en forma de CONSULTA y el título se
// cambia en una PÁGINA. Adivinar el emparejamiento por parecido del texto es
// justo el tipo de suposición que este sistema evita: Search Console sabe la
// respuesta exacta y basta con preguntársela.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim()]),
);

const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
const sc = google.searchconsole({ version: "v1", auth });

const CONSULTAS = [
  "best whatsapp bsp latam",
  "landing page checklist",
  "best ai seo tools for small businesses 2026",
  "compare jasper with hubspot, copy.ai, and writesonic",
];

const end = new Date().toISOString().slice(0, 10);
const start = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);

for (const q of CONSULTAS) {
  const r = await sc.searchanalytics.query({
    siteUrl: env.GSC_SITE_URL,
    requestBody: {
      startDate: start,
      endDate: end,
      dimensions: ["page"],
      dimensionFilterGroups: [
        { filters: [{ dimension: "query", operator: "equals", expression: q }] },
      ],
      rowLimit: 5,
    },
  });

  console.log("\n### " + q);
  const filas = r.data.rows ?? [];
  if (!filas.length) {
    console.log("   (sin filas: puede que la consulta no coincida exactamente)");
    continue;
  }
  for (const f of filas) {
    const url = f.keys[0];
    console.log(
      `   ${String(f.impressions).padStart(4)} impr  ${String(f.clicks).padStart(2)} clics  pos ${f.position.toFixed(1).padStart(5)}  ${url}`,
    );

    // El título que Google ve hoy, leído de la página en vivo.
    try {
      const html = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).text();
      const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "(sin title)";
      const d = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || "(sin meta)";
      console.log(`        title actual (${t.trim().length} car): ${t.trim().slice(0, 105)}`);
      console.log(`        meta  actual (${d.trim().length} car): ${d.trim().slice(0, 105)}`);
    } catch {
      console.log("        (no se pudo leer la página)");
    }
  }
}
