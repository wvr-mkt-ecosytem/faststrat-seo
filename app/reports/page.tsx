'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, PenLine, Lightbulb, Check, AlertCircle, ExternalLink } from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'

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
  // Resultado por query: lo que generó "Generar" o sugirió "Idea", para mostrarlo.
  const [results, setResults] = useState<Record<string, {
    kind: 'gen' | 'idea'
    loading: boolean
    ok?: boolean
    error?: string
    gen?: { title: string; slug: string; preview: string; wordCount: number }
    idea?: { title: string; intent: string; rationale: string; outline: string[]; lang: string }
  }>>({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gsc/queries?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [days])

  async function generateArticle(q: Q) {
    setResults((s) => ({ ...s, [q.query]: { kind: 'gen', loading: true } }))
    try {
      const res = await fetch('/api/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q.query }),
      })
      const d = await res.json()
      setResults((s) => ({
        ...s,
        [q.query]: d.ok
          ? { kind: 'gen', loading: false, ok: true, gen: { title: d.title, slug: d.slug, preview: d.preview, wordCount: d.wordCount } }
          : { kind: 'gen', loading: false, ok: false, error: d.error },
      }))
    } catch (e) {
      setResults((s) => ({ ...s, [q.query]: { kind: 'gen', loading: false, ok: false, error: String(e) } }))
    }
  }

  async function suggestIdea(q: Q) {
    setResults((s) => ({ ...s, [q.query]: { kind: 'idea', loading: true } }))
    try {
      const res = await fetch('/api/ideas/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: q.query,
          context: `${q.impressions} impresiones, posición ${q.position}, CTR ${q.ctr}%.`,
        }),
      })
      const d = await res.json()
      setResults((s) => ({
        ...s,
        [q.query]: d.ok
          ? { kind: 'idea', loading: false, ok: true, idea: d.idea }
          : { kind: 'idea', loading: false, ok: false, error: d.error },
      }))
    } catch (e) {
      setResults((s) => ({ ...s, [q.query]: { kind: 'idea', loading: false, ok: false, error: String(e) } }))
    }
  }

  return (
    <main className="min-h-screen">
      <BrandHeader
        subtitle={
          data && !data.error
            ? `Reporte de queries · ${data.startDate} → ${data.endDate} · ${data.totalQueries} queries`
            : 'Oportunidades de Search Console'
        }
      >
        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                days === d ? 'bg-maroon text-cream' : 'bg-maroon/8 text-ink/70 hover:bg-maroon/15'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </BrandHeader>

      <div className="p-6 space-y-8 max-w-5xl">
        {loading && <p className="text-sm text-neutral-500">Cargando reporte…</p>}
        {data?.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">Error: {data.error}</div>
        )}

        {data && !data.error && (
          <>
            <Legend />

            <OpportunityTable
              title="🎯 Striking distance — empujar a página 1"
              subtitle="Búsquedas reales donde apareces, pero estás en posición 5-20 (página 2 o final de la 1)."
              explanation={
                <>
                  <b>Qué significa:</b> Google ya te considera relevante para estas búsquedas, pero los usuarios casi no te ven porque no estás en el top 5.{' '}
                  <b className="text-maroon">Acción:</b> apretá <i>Idea</i> para que el agente te proponga un título y outline, o <i>Generar</i> para que escriba un borrador completo del artículo. Cualquiera de las dos sube tus chances de saltar a página 1.
                </>
              }
              rows={data.strikingDistance}
              results={results}
              onGenerate={generateArticle}
              onSuggestIdea={suggestIdea}
            />

            <OpportunityTable
              title="🚀 Sin explotar — falta contenido"
              subtitle="Búsquedas con muchas impresiones (la gente las hace), pero casi ningún click te llega."
              explanation={
                <>
                  <b>Qué significa:</b> Google te muestra para estos términos, pero no tenés un artículo dedicado que enganche al lector — por eso clickean a otros.{' '}
                  <b className="text-maroon">Acción:</b> esto es escribir contenido nuevo desde cero. Apretá <i>Generar</i> y el agente crea un borrador completo en{' '}
                  <Link href="/blogs" className="text-maroon underline">Blogs</Link>, listo para revisar y publicar en faststrat.ai.
                </>
              }
              rows={data.untapped}
              results={results}
              onGenerate={generateArticle}
              onSuggestIdea={suggestIdea}
            />

            <RefTable
              title="Top queries por clicks"
              caption="Las búsquedas que más tráfico real te están trayendo. Es tu tracción actual — mantenelas vivas con actualizaciones periódicas."
              rows={data.topByClicks}
              metric="clicks"
            />
            <RefTable
              title="Top queries por impresiones"
              caption="Las búsquedas donde más apareces, hagas clicks o no. Si una tiene muchas impresiones y pocos clicks, está en la sección de oportunidades de arriba."
              rows={data.topByImpressions}
              metric="impressions"
            />
          </>
        )}
      </div>
    </main>
  )
}

type ResultMap = Record<string, {
  kind: 'gen' | 'idea'
  loading: boolean
  ok?: boolean
  error?: string
  gen?: { title: string; slug: string; preview: string; wordCount: number }
  idea?: { title: string; intent: string; rationale: string; outline: string[]; lang: string }
}>

function Legend() {
  return (
    <details className="rounded-lg border border-maroon/15 bg-white/60 px-4 py-3">
      <summary className="cursor-pointer font-semibold text-ink text-sm flex items-center gap-2">
        <span className="text-maroon">📖</span> Cómo leer este reporte
      </summary>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm text-ink/80">
        <p><b className="text-maroon">Query</b> — la búsqueda exacta que escribió alguien en Google y para la que apareciste.</p>
        <p><b className="text-maroon">Impr. (impresiones)</b> — cuántas veces Google te mostró en los resultados de esa búsqueda.</p>
        <p><b className="text-maroon">Pos. (posición promedio)</b> — qué número de resultado eres en promedio. #1-3 = top de la página 1. #10+ = página 2 o más.</p>
        <p><b className="text-maroon">CTR</b> — de las veces que te mostraron, qué % hizo click. Bajo CTR = el título/descripción no engancha.</p>
        <p className="sm:col-span-2 pt-1 border-t border-maroon/10"><b className="text-maroon">Acciones por fila:</b>{' '}
          <span className="inline-block px-2 py-0.5 rounded border border-maroon/20 text-xs">💡 Idea</span> = el agente propone título + outline y lo guarda en <Link href="/ideas" className="text-maroon underline">Ideas</Link>.{' '}
          <span className="inline-block px-2 py-0.5 rounded bg-maroon text-cream text-xs">✍️ Generar</span> = el agente escribe el artículo completo como borrador en <Link href="/blogs" className="text-maroon underline">Blogs</Link>; desde ahí lo publicas a faststrat.ai con un click.
        </p>
      </div>
    </details>
  )
}

function OpportunityTable({
  title,
  subtitle,
  explanation,
  rows,
  results,
  onGenerate,
  onSuggestIdea,
}: {
  title: string
  subtitle: string
  explanation?: React.ReactNode
  rows: Q[]
  results: ResultMap
  onGenerate: (q: Q) => void
  onSuggestIdea: (q: Q) => void
}) {
  return (
    <section>
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="text-sm text-sand mb-2">{subtitle}</p>
      {explanation && (
        <div className="rounded-md bg-maroon/5 border-l-4 border-maroon px-3 py-2 mb-3 text-sm text-ink/80">
          {explanation}
        </div>
      )}
      <div className="rounded-lg border border-maroon/15 bg-white/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-maroon/5 text-maroon">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Query</th>
              <th className="text-right px-3 py-2 font-semibold">Impr.</th>
              <th className="text-right px-3 py-2 font-semibold">Pos.</th>
              <th className="text-right px-3 py-2 font-semibold">CTR</th>
              <th className="text-right px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sand">Sin queries en esta categoría</td></tr>
            )}
            {rows.map((q) => {
              const r = results[q.query]
              return (
                <Fragment key={q.query}>
                  <tr className="border-t border-maroon/8">
                    <td className="px-3 py-2 text-ink">{q.query}</td>
                    <td className="px-3 py-2 text-right text-sand">{q.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-sand">#{q.position}</td>
                    <td className="px-3 py-2 text-right text-sand">{q.ctr}%</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => onSuggestIdea(q)}
                          disabled={r?.loading}
                          title="Pedir una idea de artículo al agente"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-maroon/20 text-maroon hover:bg-maroon/8 disabled:opacity-50"
                        >
                          {r?.loading && r.kind === 'idea' ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                          Idea
                        </button>
                        <button
                          onClick={() => onGenerate(q)}
                          disabled={r?.loading}
                          title="Generar artículo con el agente SEO"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
                        >
                          {r?.loading && r.kind === 'gen' ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
                          {r?.loading && r.kind === 'gen' ? 'Escribiendo…' : 'Generar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {r && (r.loading || r.ok || r.error) && (
                    <tr className="bg-cream/60">
                      <td colSpan={5} className="px-3 pb-3 pt-1">
                        <ResultPanel result={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ResultPanel({ result: r }: { result: ResultMap[string] }) {
  if (r.loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-sand">
        <Loader2 size={13} className="animate-spin" />
        {r.kind === 'gen' ? 'El agente está escribiendo el artículo…' : 'El agente está armando la idea…'}
      </div>
    )
  }
  if (r.error) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-red-500">
        <AlertCircle size={13} className="mt-0.5 shrink-0" /> {r.error}
      </div>
    )
  }
  if (r.kind === 'gen' && r.gen) {
    return (
      <div className="rounded-md border border-maroon/15 bg-white/70 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-maroon mb-1">
          <Check size={13} /> Artículo generado · {r.gen.wordCount} palabras (borrador)
        </div>
        <p className="text-sm font-semibold text-ink">{r.gen.title}</p>
        <p className="text-xs text-sand mt-1 whitespace-pre-line line-clamp-4">{r.gen.preview}…</p>
        <Link href="/blogs" className="inline-flex items-center gap-1 text-xs font-medium text-maroon hover:underline mt-2">
          Ver y editar en Blogs <ExternalLink size={11} />
        </Link>
      </div>
    )
  }
  if (r.kind === 'idea' && r.idea) {
    return (
      <div className="rounded-md border border-maroon/15 bg-white/70 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-maroon mb-1">
          <Check size={13} /> Idea propuesta · agregada a Ideas
        </div>
        <p className="text-sm font-semibold text-ink">{r.idea.title}</p>
        <p className="text-xs text-sand mt-1"><span className="font-medium">Intención:</span> {r.idea.intent} · <span className="uppercase">{r.idea.lang}</span></p>
        <p className="text-xs text-ink/80 mt-1">{r.idea.rationale}</p>
        {r.idea.outline.length > 0 && (
          <ol className="list-decimal list-inside mt-1.5 space-y-0.5">
            {r.idea.outline.map((o, i) => <li key={i} className="text-xs text-sand">{o}</li>)}
          </ol>
        )}
        <Link href="/ideas" className="inline-flex items-center gap-1 text-xs font-medium text-maroon hover:underline mt-2">
          Ver en Ideas <ExternalLink size={11} />
        </Link>
      </div>
    )
  }
  return null
}

function RefTable({ title, caption, rows, metric }: { title: string; caption?: string; rows: Q[]; metric: 'clicks' | 'impressions' }) {
  return (
    <section>
      <h2 className="font-semibold text-ink">{title}</h2>
      {caption && <p className="text-sm text-sand mb-3">{caption}</p>}
      <div className="rounded-lg border border-maroon/15 bg-white/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-maroon/5 text-maroon">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Query</th>
              <th className="text-right px-3 py-2 font-semibold">Clicks</th>
              <th className="text-right px-3 py-2 font-semibold">Impr.</th>
              <th className="text-right px-3 py-2 font-semibold">Pos.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.query} className="border-t border-maroon/8">
                <td className="px-3 py-2 text-ink">{q.query}</td>
                <td className={`px-3 py-2 text-right ${metric === 'clicks' ? 'font-semibold text-ink' : 'text-sand'}`}>{q.clicks}</td>
                <td className={`px-3 py-2 text-right ${metric === 'impressions' ? 'font-semibold text-ink' : 'text-sand'}`}>{q.impressions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-sand">#{q.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
