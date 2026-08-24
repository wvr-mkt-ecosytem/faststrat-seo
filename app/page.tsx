'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ExternalLink, Sparkles, PenLine, Loader2, AlertCircle } from 'lucide-react'
import { SeoCharts } from '@/components/SeoCharts'
import { BrandHeader } from '@/components/BrandHeader'
import { CLIENTE } from "@/lib/cliente";

type Row = {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

type Data = {
  rows: Row[]
  startDate: string
  endDate: string
}

/** Lo que GA4 añade sobre una página que Search Console ya conoce. */
type Behaviour = {
  sessions: number
  avgEngagement: number
  conversions: number
  verdict: string
  action: string
}



type Ga4Response = {
  connected: boolean
  reason?: string
  action?: string
  pages?: (Behaviour & { path: string })[]
  totals?: { sessions: number; conversions: number }
}

const DAYS_OPTIONS = [7, 14, 28, 90]

/**
 * Misma normalización que lib/ga4.ts, porque las dos ramas tienen que acabar
 * en la MISMA forma para poder cruzarse. GSC devuelve la ruta y GA4 la
 * devuelve ya normalizada; sin bajar las dos a minúsculas y quitar la barra
 * final, un artículo con acento no casaba y aparecía sin datos de conducta.
 */
const toPath = (u: string) => {
  let s = u.trim().replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0]
  try {
    s = decodeURIComponent(s)
  } catch {
    // Una secuencia mal codificada se deja como está antes que perder la ruta.
  }
  return s.toLowerCase().replace(/\/+$/, '') || '/'
}

export default function SeoPage() {
  const [data, setData] = useState<Data | null>(null)
  const [ga4, setGa4] = useState<Ga4Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(28)
  const [search, setSearch] = useState('')
  const [verdicto, setVerdicto] = useState<string | null>(null)



  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/gsc?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  // GA4 va en su propia petición y con su propio estado a propósito: si
  // Analytics falla o no está configurado, el dashboard sigue mostrando Search
  // Console en vez de quedarse en blanco. Antes de esto, una sola llamada rota
  // se llevaba por delante la página entera.
  useEffect(() => {
    setGa4(null)
    fetch(`/api/ga4?days=${days}`)
      .then((r) => r.json())
      .then((d: Ga4Response & { error?: string }) => {
        setGa4(d.error ? { connected: false, reason: d.error } : d)
      })
      .catch((e) => setGa4({ connected: false, reason: e.message }))
  }, [days])

  const conducta = new Map<string, Behaviour>(
    (ga4?.pages ?? []).map((p) => [toPath(p.path), p])
  )
  const hayConducta = conducta.size > 0

  const rows = (data?.rows ?? [])
    .filter((r) => r.page.toLowerCase().includes(search.toLowerCase()))
    // El filtro por diagnóstico es lo único que Tráfico hacía y aquí no:
    // cada veredicto es un arreglo distinto, y verlos mezclados obliga a
    // reordenar la lista con la vista para trabajar sobre uno.
    .filter((r) => !verdicto || conducta.get(toPath(r.page))?.verdict === verdicto)

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0)
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0)
  const avgPosition =
    rows.length > 0
      ? Math.round((rows.reduce((s, r) => s + r.position, 0) / rows.length) * 10) / 10
      : 0

  // Los totales de GA4 salen de las filas visibles, no de ga4.totals: si hay
  // un filtro escrito, una tarjeta que siguiera contando el sitio entero
  // diría algo distinto de la tabla que está justo debajo.
  const totalSessions = rows.reduce((s, r) => s + (conducta.get(toPath(r.page))?.sessions ?? 0), 0)
  const totalConversions = rows.reduce(
    (s, r) => s + (conducta.get(toPath(r.page))?.conversions ?? 0),
    0
  )

  return (
    <main className="min-h-screen">
      <BrandHeader
        subtitle={
          data
            ? `${hayConducta ? 'Search Console + GA4' : 'Search Console'} · ${data.startDate} → ${data.endDate}`
            : 'Google Search Console'
        }
      >
        <div className="flex gap-1">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-maroon text-cream'
                  : 'bg-maroon/8 text-ink/70 hover:bg-maroon/15'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </BrandHeader>

      <div className="p-6 space-y-6">
        {/* Summary cards */}
        <div className={`grid gap-4 ${hayConducta ? 'grid-cols-5' : 'grid-cols-3'}`}>
          <StatCard label="Impresiones" value={totalImpressions.toLocaleString()} fuente="GSC" />
          <StatCard label="Clicks totales" value={totalClicks.toLocaleString()} fuente="GSC" />
          <StatCard label="Posición promedio" value={avgPosition > 0 ? `#${avgPosition}` : '—'} fuente="GSC" />
          {hayConducta && (
            <>
              <StatCard label="Sesiones" value={totalSessions.toLocaleString()} fuente="GA4" />
              <StatCard label="Conversiones" value={totalConversions.toLocaleString()} fuente="GA4" />
            </>
          )}
        </div>

        {/* Por qué GA4 no está: el motivo importa más que el hueco. Sin esto,
            un token caducado se veía igual que "no hay tráfico". */}
        {ga4 && !ga4.connected && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3">
            <strong>GA4 no está respondiendo</strong>, así que las columnas de conducta van vacías.
            Search Console sigue funcionando.
            {ga4.reason && <span className="block mt-1 text-amber-700">{ga4.reason}</span>}
            {ga4.action && <span className="block mt-1 font-mono text-xs text-amber-700">{ga4.action}</span>}
          </div>
        )}

        {/* Charts */}
        {!loading && !error && data && <SeoCharts rows={data.rows} days={days} />}

        {/* El análisis se mudó a Reportes.
            Aquí estaba junto a los números que cita, que era una buena razón,
            pero un informe escrito se lee y esta pantalla se ojea. Y tenerlo en
            dos sitios obligaría a mantener el mismo bloque por duplicado, que
            es como acabaron Dashboard y Tráfico. */}
        {hayConducta && (
          <a
            href="/reports"
            className="flex items-center gap-2 text-sm rounded-lg border border-maroon/15 bg-white/60 px-4 py-3 hover:bg-maroon/5 transition-colors"
          >
            <Sparkles size={15} className="text-maroon shrink-0" />
            <span className="text-ink">
              <b>El análisis semanal está en Reportes.</b>
              <span className="text-sand"> Cruza estos números con GA4 y explica por qué pasa lo que pasa.</span>
            </span>
          </a>
        )}

        {/* Filtro por diagnóstico. Cada veredicto es un arreglo distinto, así
            que poder aislar uno es lo que convierte la tabla en una lista de
            tareas en vez de un informe. */}
        {hayConducta && (
          <div className="flex gap-1.5 flex-wrap">
            {[null, ...Object.keys(VERDICT_STYLE)].map((v) => {
              const n = v === null
                ? (data?.rows ?? []).length
                : (data?.rows ?? []).filter((r) => conducta.get(toPath(r.page))?.verdict === v).length
              if (v !== null && n === 0) return null
              return (
                <button
                  key={v ?? 'todas'}
                  onClick={() => setVerdicto(v)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    verdicto === v ? 'bg-maroon text-cream border-maroon' : 'bg-white/60 text-ink/70 border-maroon/15 hover:bg-maroon/8'
                  }`}
                >
                  {v ?? 'Todas'} <span className="opacity-70">{n}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Filtrar páginas…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-maroon/15 bg-white/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-maroon/30"
        />

        {/* Table */}
        {loading && (
          <div className="text-sm text-neutral-500 py-12 text-center">Cargando datos de GSC…</div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-lg border border-maroon/15 bg-white/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-maroon/15 bg-maroon/5 text-maroon">
                  <th className="text-left px-4 py-3 font-semibold">Página</th>
                  <th className="text-right px-4 py-3 font-semibold">Clicks</th>
                  <th className="text-right px-4 py-3 font-semibold">Impresiones</th>
                  <th className="text-right px-4 py-3 font-semibold">CTR</th>
                  <th className="text-right px-4 py-3 font-semibold">Posición</th>
                  {hayConducta && (
                    <>
                      <th className="text-right px-4 py-3 font-semibold">Sesiones</th>
                      <th className="text-right px-4 py-3 font-semibold" title="Segundos de permanencia media (GA4)">
                        Permanencia
                      </th>
                      <th className="text-left px-4 py-3 font-semibold">Diagnóstico</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={hayConducta ? 8 : 5} className="px-4 py-8 text-center text-sand">
                      Sin resultados
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const c = conducta.get(toPath(row.page))
                  return (
                  <tr
                    key={row.page}
                    className="border-b border-maroon/8 hover:bg-maroon/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-sand max-w-xs truncate">
                          {row.page}
                        </span>
                        <a
                          href={`https://${CLIENTE.dominio}${row.page}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sand hover:text-maroon shrink-0"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{row.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sand">{row.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sand">{row.ctr}%</td>
                    <td className="px-4 py-3 text-right">
                      <PositionBadge position={row.position} />
                    </td>
                    {hayConducta && (
                      <>
                        <td className="px-4 py-3 text-right text-sand">
                          {c ? c.sessions.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-sand">
                          {c && c.sessions > 0 ? `${Math.round(c.avgEngagement)}s` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {c ? <VerdictBadge verdict={c.verdict} action={c.action} /> : <span className="text-neutral-400">—</span>}
                        </td>
                      </>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value, fuente }: { label: string; value: string; fuente?: string }) {
  return (
    <div className="relative overflow-hidden border border-maroon/15 bg-white/60 rounded-lg px-5 py-4">
      <span className="absolute right-0 top-0 h-full w-1.5 bg-maroon/70" />
      <p className="text-xs uppercase tracking-wide text-sand mb-1">
        {label}
        {/* De qué fuente sale cada número. Con dos orígenes en la misma fila,
            "sesiones" y "clicks" se leen como lo mismo y no lo son: un clic es
            de Search Console y una sesión es de GA4, y casi nunca coinciden. */}
        {fuente && <span className="ml-1.5 text-[10px] text-sand/60 font-normal">{fuente}</span>}
      </p>
      <p className="text-2xl font-extrabold text-ink">{value}</p>
    </div>
  )
}

/** Colores por tipo de arreglo, no por "bueno/malo": cada veredicto es una
 *  acción distinta y agruparlos por gravedad no ayudaría a decidir. */
const VERDICT_STYLE: Record<string, string> = {
  funcionando: 'bg-green-50 text-green-700 border-green-200',
  'sale y no la clican': 'bg-amber-50 text-amber-800 border-amber-200',
  'casi nadie la ve': 'bg-neutral-50 text-neutral-600 border-neutral-200',
  'entran y se van': 'bg-orange-50 text-orange-800 border-orange-200',
  'leen y no convierten': 'bg-blue-50 text-blue-700 border-blue-200',
  'sin datos en GA4': 'bg-red-50 text-red-700 border-red-200',
}

function VerdictBadge({ verdict, action }: { verdict: string; action: string }) {
  const style = VERDICT_STYLE[verdict] ?? 'bg-neutral-50 text-neutral-600 border-neutral-200'
  return (
    <span
      title={action}
      className={`inline-block border rounded px-2 py-0.5 text-xs whitespace-nowrap cursor-help ${style}`}
    >
      {verdict}
    </span>
  )
}

function PositionBadge({ position }: { position: number }) {
  if (position === 0) return <span className="text-neutral-400">—</span>
  if (position <= 3) return <span className="text-green-600 font-semibold flex items-center justify-end gap-1"><TrendingUp size={12} />#{position}</span>
  if (position <= 10) return <span className="text-yellow-600 font-medium flex items-center justify-end gap-1"><Minus size={12} />#{position}</span>
  return <span className="text-red-500 flex items-center justify-end gap-1"><TrendingDown size={12} />#{position}</span>
}
