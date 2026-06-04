'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ExternalLink, FileText, Lightbulb, FileBarChart } from 'lucide-react'
import { SeoCharts } from '@/components/SeoCharts'

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
      <header className="border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">FastStrat · SEO Dashboard</h1>
            <p className="text-sm text-neutral-500">
              {data ? `${data.startDate} → ${data.endDate}` : 'Google Search Console'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    days === d
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Link
              href="/reports"
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded border border-black/10 hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-neutral-800 transition-colors"
            >
              <FileBarChart size={16} />
              Reportes
            </Link>
            <Link
              href="/ideas"
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded border border-black/10 hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-neutral-800 transition-colors"
            >
              <Lightbulb size={16} />
              Ideas
            </Link>
            <Link
              href="/blogs"
              className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded border border-black/10 hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-neutral-800 transition-colors"
            >
              <FileText size={16} />
              Blogs
            </Link>
          </div>
        </div>
      </header>

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
          className="w-full border border-black/10 rounded px-3 py-2 text-sm dark:border-white/10 dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-black/20"
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
          <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-neutral-50 dark:border-white/10 dark:bg-neutral-900">
                  <th className="text-left px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Página</th>
                  <th className="text-right px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Clicks</th>
                  <th className="text-right px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Impresiones</th>
                  <th className="text-right px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">CTR</th>
                  <th className="text-right px-4 py-3 font-medium text-neutral-600 dark:text-neutral-400">Posición</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                      Sin resultados
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr
                    key={row.page}
                    className="border-b border-black/5 hover:bg-neutral-50 dark:border-white/5 dark:hover:bg-neutral-900 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-neutral-500 max-w-xs truncate">
                          {row.page}
                        </span>
                        <a
                          href={`https://faststrat.ai${row.page}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-neutral-400 hover:text-black dark:hover:text-white shrink-0"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{row.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{row.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{row.ctr}%</td>
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
    <div className="border border-black/10 dark:border-white/10 rounded-lg px-5 py-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function PositionBadge({ position }: { position: number }) {
  if (position === 0) return <span className="text-neutral-400">—</span>
  if (position <= 3) return <span className="text-green-600 font-semibold flex items-center justify-end gap-1"><TrendingUp size={12} />#{position}</span>
  if (position <= 10) return <span className="text-yellow-600 font-medium flex items-center justify-end gap-1"><Minus size={12} />#{position}</span>
  return <span className="text-red-500 flex items-center justify-end gap-1"><TrendingDown size={12} />#{position}</span>
}
