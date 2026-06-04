import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
)

const auth = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
)
auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
const sc = google.searchconsole({ version: 'v1', auth })

const end = new Date()
const start = new Date()
start.setDate(end.getDate() - 90)
const fmt = (d) => d.toISOString().split('T')[0]

const res = await sc.searchanalytics.query({
  siteUrl: env.GSC_SITE_URL,
  requestBody: {
    startDate: fmt(start),
    endDate: fmt(end),
    dimensions: ['query'],
    rowLimit: 1000,
    dataState: 'all',
  },
})

const rows = (res.data.rows ?? []).map((r) => ({
  query: r.keys[0],
  clicks: r.clicks ?? 0,
  impressions: r.impressions ?? 0,
  ctr: (r.ctr ?? 0) * 100,
  position: r.position ?? 0,
}))

// Striking distance: posición 5-20 con impresiones decentes = empujar a página 1
const striking = rows
  .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 30)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 30)

// Alta demanda, casi sin clicks = falta contenido dedicado
const untapped = rows
  .filter((r) => r.impressions >= 100 && r.clicks <= 1)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 30)

const out = (label, list) => {
  console.log(`\n=== ${label} ===`)
  for (const r of list) {
    console.log(
      `${String(r.impressions).padStart(6)} impr  ${String(r.clicks).padStart(3)} clk  ` +
        `pos ${r.position.toFixed(1).padStart(5)}  CTR ${r.ctr.toFixed(1)}%  →  ${r.query}`
    )
  }
}

console.log(`\nRango: ${fmt(start)} → ${fmt(end)}  ·  ${rows.length} queries totales`)
out('STRIKING DISTANCE (pos 5-20, ≥30 impr) — empujar a página 1', striking)
out('SIN EXPLOTAR (≥100 impr, ≤1 click) — falta contenido', untapped)

// Guarda JSON para análisis posterior
fs.writeFileSync(
  path.join(__dirname, 'gsc-queries.json'),
  JSON.stringify({ range: [fmt(start), fmt(end)], rows }, null, 2)
)
console.log('\n💾 Data completa guardada en scripts/gsc-queries.json\n')
