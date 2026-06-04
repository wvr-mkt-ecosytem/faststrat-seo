'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react'
import { SeoCharts } from '@/components/SeoCharts'
import { BrandHeader } from '@/components/BrandHeader'

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

const DAYS_OPTIONS = [7, 14, 28, 90]

export default function SeoPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(28)
  const [search, setSearch] = useState('')

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

  const rows = (data?.rows ?? []).filter((r) =>
    r.page.toLowerCase().includes(search.toLowerCase())
  )

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0)
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0)
  const avgPosition =
    rows.length > 0
      ? Math.round((rows.reduce((s, r) => s + r.position, 0) / rows.length) * 10) / 10
      : 0

  return (
    <main className="min-h-screen">
      <BrandHeader subtitle={data ? `Search Console · ${data.startDate} → ${data.endDate}` : 'Google Search Console'}>
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
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Clicks totales" value={totalClicks.toLocaleString()} />
          <StatCard label="Impresiones" value={totalImpressions.toLocaleString()} />
          <StatCard label="Posición promedio" value={avgPosition > 0 ? `#${avgPosition}` : '—'} />
        </div>

        {/* Charts */}
        {!loading && !error && data && <SeoCharts rows={data.rows} days={days} />}

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
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sand">
                      Sin resultados
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
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
                          href={`https://faststrat.ai${row.page}`}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative overflow-hidden border border-maroon/15 bg-white/60 rounded-lg px-5 py-4">
      <span className="absolute right-0 top-0 h-full w-1.5 bg-maroon/70" />
      <p className="text-xs uppercase tracking-wide text-sand mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-ink">{value}</p>
    </div>
  )
}

function PositionBadge({ position }: { position: number }) {
  if (position === 0) return <span className="text-neutral-400">—</span>
  if (position <= 3) return <span className="text-green-600 font-semibold flex items-center justify-end gap-1"><TrendingUp size={12} />#{position}</span>
  if (position <= 10) return <span className="text-yellow-600 font-medium flex items-center justify-end gap-1"><Minus size={12} />#{position}</span>
  return <span className="text-red-500 flex items-center justify-end gap-1"><TrendingDown size={12} />#{position}</span>
}
