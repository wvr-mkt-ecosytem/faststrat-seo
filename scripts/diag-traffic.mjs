// De dónde viene el tráfico que NO es de Google, y qué frena al que sí.
//
// "Direct" en GA4 no significa "tecleó la URL". Es el cajón de lo que llega sin
// referente identificable: enlaces en LinkedIn desde la app, correos, PDFs,
// WhatsApp, y cualquier campaña sin UTM. Por eso hace falta bajar a
// fuente/medio en vez de quedarse en el canal.
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

const oauth = (token) => {
  const a = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: token });
  return a;
};

const data = google.analyticsdata({ version: "v1beta", auth: oauth(env.GOOGLE_MEASUREMENT_REFRESH_TOKEN) });
const property = `properties/${env.GA4_PROPERTY_ID || "503953510"}`;
const n = (v) => Number(v ?? 0);

// ---- 1. Fuente / medio real
const fm = await data.properties.runReport({
  property,
  requestBody: {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: "25",
  },
});
console.log("\nDE DÓNDE VIENEN (fuente / medio, 28 días)");
for (const r of fm.data.rows ?? []) {
  const src = r.dimensionValues?.[0]?.value ?? "?";
  const med = r.dimensionValues?.[1]?.value ?? "?";
  console.log("  " + String(n(r.metricValues?.[0]?.value)).padStart(5) + "  " + (src + " / " + med).slice(0, 46));
}

// ---- 2. Search Console: qué frena a Google
const sc = google.searchconsole({ version: "v1", auth: oauth(env.GOOGLE_REFRESH_TOKEN) });
const site = env.GSC_SITE_URL;
const end = new Date().toISOString().slice(0, 10);
const start = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);

const q = await sc.searchanalytics.query({
  siteUrl: site,
  requestBody: { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 500 },
});
const rows = q.data.rows ?? [];
const tot = rows.reduce((s, r) => ({ c: s.c + r.clicks, i: s.i + r.impressions }), { c: 0, i: 0 });

console.log("\nSEARCH CONSOLE (28 días)");
console.log("  consultas donde aparecemos: " + rows.length);
console.log("  impresiones: " + tot.i + " | clics: " + tot.c + " | CTR global: " + ((tot.c / Math.max(tot.i, 1)) * 100).toFixed(2) + "%");

const pos = { "1-3": 0, "4-10": 0, "11-20": 0, "21+": 0 };
for (const r of rows) {
  if (r.position <= 3) pos["1-3"]++;
  else if (r.position <= 10) pos["4-10"]++;
  else if (r.position <= 20) pos["11-20"]++;
  else pos["21+"]++;
}
console.log("  reparto por posición: " + JSON.stringify(pos));

// Las que ya están cerca: posición 4-20 con impresiones. Es donde un cambio
// de título mueve la aguja sin escribir nada nuevo.
const cerca = rows
  .filter((r) => r.position > 3 && r.position <= 20 && r.impressions >= 20)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 15);
console.log("\n  YA CERCA (pos 4-20, +20 impresiones) — aquí es donde hay margen:");
for (const r of cerca) {
  console.log(
    "    " +
      String(r.impressions).padStart(5) +
      " impr  " +
      String(r.clicks).padStart(3) +
      " clics  pos " +
      r.position.toFixed(1).padStart(5) +
      "  " +
      r.keys[0].slice(0, 48),
  );
}

// Las que ya rankean top 3: si ahí el CTR es bajo, es el título.
const top = rows.filter((r) => r.position <= 3 && r.impressions >= 10);
console.log("\n  EN TOP 3: " + top.length + " consultas, " + top.reduce((s, r) => s + r.clicks, 0) + " clics");
