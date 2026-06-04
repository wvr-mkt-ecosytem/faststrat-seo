'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, FileBarChart, Loader2, PenLine, Lightbulb, Check, AlertCircle } from 'lucide-react'

type Q = { query: string; clicks: number; impressions: number; ctr: number; position: number }
type Data = {
  startDate: string
  endDate: string
  totalQueries: number
  totals: { clicks: number; impressions: number }
  strikingDistance: Q[]
  untapped: Q[]
  topByClicks: Q[]
  topByImpressions: Q[]
  error?: string
}

const DAYS = [28, 90]

export default function ReportsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)
  const [actions, setActions] = useState<Record<string, { kind: string; loading?: boolean; msg?: string; ok?: boolean }>>({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gsc/queries?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [days])

  async function generateArticle(q: Q) {
    const key = `gen:${q.query}`
    setActions((a) => ({ ...a, [key]: { kind: 'gen', loading: true } }))
    try {
      const res = await fetch('/api/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q.query }),
      })
      const d = await res.json()
      setActions((a) => ({
        ...a,
        [key]: { kind: 'gen', loading: false, ok: !!d.ok, msg: d.ok ? 'Borrador creado en Blogs' : d.error },
      }))
    } catch (e) {
      setActions((a) => ({ ...a, [key]: { kind: 'gen', loading: false, ok: false, msg: String(e) } }))
    }
  }

  async function addIdea(q: Q) {
    const key = `idea:${q.query}`
    setActions((a) => ({ ...a, [key]: { kind: 'idea', loading: true } }))
    try {
      const title = q.query.charAt(0).toUpperCase() + q.query.slice(1)
      const res = await fetch('/api/ideas/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          primaryKeyword: q.query,
          rationale: `Desde reporte: ${q.impressions} impresiones, posición ${q.position}, CTR ${q.ctr}%.`,
        }),
      })
      const d = await res.json()
      setActions((a) => ({
        ...a,
        [key]: { kind: 'idea', loading: false, ok: !!d.ok, msg: d.ok ? 'Agregada a Ideas' : d.error },
      }))
    } catch (e) {
      setActions((a) => ({ ...a, [key]: { kind: 'idea', loading: false, ok: false, msg: String(e) } }))
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-black/10 px-6 py-4 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-neutral-400 hover:text-black dark:hover:text-white transition-colors" aria-label="Volver">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <FileBarChart size={18} /> Reporte de Queries
            </h1>
            <p className="text-sm text-neutral-500">
              {data && !data.error ? `${data.startDate} → ${data.endDate} · ${data.totalQueries} queries` : 'Oportunidades de Search Console'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                days === d ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      <div className="p-6 space-y-8 max-w-5xl">
        {loading && <p className="text-sm text-neutral-500">Cargando reporte…</p>}
        {data?.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">Error: {data.error}</div>
        )}

        {data && !data.error && (
          <>
            <OpportunityTable
              title="🎯 Striking distance — empujar a página 1"
              subtitle="Posición 5-20 con demanda real. Optimizar o escribir contenido dedicado sube estos a top 5."
              rows={data.strikingDistance}
              actions={actions}
              onGenerate={generateArticle}
              onAddIdea={addIdea}
            />
            <OpportunityTable
              title="🚀 Sin explotar — falta contenido"
              subtitle="Muchas impresiones, casi cero clicks. No tienes página que capture esta demanda."
              rows={data.untapped}
              actions={actions}
              onGenerate={generateArticle}
              onAddIdea={addIdea}
            />
            <RefTable title="Top queries por clicks" rows={data.topByClicks} metric="clicks" />
            <RefTable title="Top queries por impresiones" rows={data.topByImpressions} metric="impressions" />
          </>
        )}
      </div>
    </main>
  )
}

function OpportunityTable({
  title,
  subtitle,
  rows,
  actions,
  onGenerate,
  onAddIdea,
}: {
  title: string
  subtitle: string
  rows: Q[]
  actions: Record<string, { kind: string; loading?: boolean; msg?: string; ok?: boolean }>
  onGenerate: (q: Q) => void
  onAddIdea: (q: Q) => void
}) {
  return (
    <section>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-neutral-500 mb-3">{subtitle}</p>
      <div className="rounded border border-black/10 dark:border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Query</th>
              <th className="text-right px-3 py-2 font-medium">Impr.</th>
              <th className="text-right px-3 py-2 font-medium">Pos.</th>
              <th className="text-right px-3 py-2 font-medium">CTR</th>
              <th className="text-right px-3 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-400">Sin queries en esta categoría</td></tr>
            )}
            {rows.map((q) => {
              const gen = actions[`gen:${q.query}`]
              const idea = actions[`idea:${q.query}`]
              return (
                <tr key={q.query} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-3 py-2">{q.query}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">{q.impressions.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">#{q.position}</td>
                  <td className="px-3 py-2 text-right text-neutral-500">{q.ctr}%</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => onAddIdea(q)}
                        disabled={idea?.loading}
                        title="Agregar a Ideas"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-black/10 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                      >
                        {idea?.loading ? <Loader2 size={12} className="animate-spin" /> : idea?.ok ? <Check size={12} className="text-green-600" /> : <Lightbulb size={12} />}
                        Idea
                      </button>
                      <button
                        onClick={() => onGenerate(q)}
                        disabled={gen?.loading}
                        title="Generar artículo con el agente SEO"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-50"
                      >
                        {gen?.loading ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
                        {gen?.loading ? 'Escribiendo…' : 'Generar'}
                      </button>
                    </div>
                    {(gen?.msg || idea?.msg) && (
                      <p className={`text-xs mt-1 text-right flex items-center gap-1 justify-end ${(gen?.ok ?? idea?.ok) ? 'text-green-600' : 'text-red-500'}`}>
                        {(gen?.ok ?? idea?.ok) ? <Check size={11} /> : <AlertCircle size={11} />}
                        {gen?.msg || idea?.msg}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RefTable({ title, rows, metric }: { title: string; rows: Q[]; metric: 'clicks' | 'impressions' }) {
  return (
    <section>
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="rounded border border-black/10 dark:border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Query</th>
              <th className="text-right px-3 py-2 font-medium">Clicks</th>
              <th className="text-right px-3 py-2 font-medium">Impr.</th>
              <th className="text-right px-3 py-2 font-medium">Pos.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.query} className="border-t border-black/5 dark:border-white/5">
                <td className="px-3 py-2">{q.query}</td>
                <td className={`px-3 py-2 text-right ${metric === 'clicks' ? 'font-semibold' : 'text-neutral-500'}`}>{q.clicks}</td>
                <td className={`px-3 py-2 text-right ${metric === 'impressions' ? 'font-semibold' : 'text-neutral-500'}`}>{q.impressions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-neutral-500">#{q.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
