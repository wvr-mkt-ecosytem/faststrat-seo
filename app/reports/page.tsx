'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Loader2, PenLine, Lightbulb, Check, AlertCircle, ExternalLink,
  TrendingUp, TrendingDown, Minus, Sparkles, ChevronDown, ChevronRight,
} from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'

type Q = { query: string; clicks: number; impressions: number; ctr: number; position: number }

type PageDetail = {
  path: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  clicksDelta: number
  impressionsDelta: number
  topQueries: Q[]
  strikingDistance: Q[]
}

type QueriesData = {
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

type PagesData = {
  startDate: string
  endDate: string
  previousStartDate: string
  previousEndDate: string
  pages: PageDetail[]
  error?: string
}

const DAYS = [28, 90]

type ResultMap = Record<string, {
  kind: 'gen' | 'idea' | 'opt'
  loading: boolean
  ok?: boolean
  error?: string
  gen?: { title: string; slug: string; preview: string; wordCount: number }
  idea?: { title: string; intent: string; rationale: string; outline: string[]; lang: string }
  opt?: { title: string; slug: string; preview: string; wordCount: number; capturedQueries: string[] }
}>

export default function ReportsPage() {
  const [queries, setQueries] = useState<QueriesData | null>(null)
  const [pagesData, setPagesData] = useState<PagesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(28)
  const [results, setResults] = useState<ResultMap>({})

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/gsc/queries?days=${days}`).then((r) => r.json()),
      fetch(`/api/gsc/pages-detail?days=${days}`).then((r) => r.json()),
    ])
      .then(([q, p]) => { setQueries(q); setPagesData(p) })
      .finally(() => setLoading(false))
  }, [days])

  // Para que la sección de oportunidades EXCLUYA queries que ya capturan
  // artículos existentes, junto todas las queries que vienen por pages.
  const queriesAlreadyOwned = new Set<string>()
  for (const p of pagesData?.pages ?? []) {
    for (const q of p.topQueries) queriesAlreadyOwned.add(q.query.toLowerCase())
    for (const q of p.strikingDistance) queriesAlreadyOwned.add(q.query.toLowerCase())
  }
  const trulyNew = (queries?.untapped ?? []).filter((q) => !queriesAlreadyOwned.has(q.query.toLowerCase()))

  async function generateArticle(q: Q) {
    setResults((s) => ({ ...s, [q.query]: { kind: 'gen', loading: true } }))
    try {
      const res = await fetch('/api/blog/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q.query }),
      })
      const d = await res.json()
      setResults((s) => ({ ...s, [q.query]: d.ok
        ? { kind: 'gen', loading: false, ok: true, gen: { title: d.title, slug: d.slug, preview: d.preview, wordCount: d.wordCount } }
        : { kind: 'gen', loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setResults((s) => ({ ...s, [q.query]: { kind: 'gen', loading: false, ok: false, error: String(e) } }))
    }
  }

  async function suggestIdea(q: Q) {
    setResults((s) => ({ ...s, [q.query]: { kind: 'idea', loading: true } }))
    try {
      const res = await fetch('/api/ideas/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: q.query, context: `${q.impressions} impr, pos ${q.position}, CTR ${q.ctr}%.` }),
      })
      const d = await res.json()
      setResults((s) => ({ ...s, [q.query]: d.ok
        ? { kind: 'idea', loading: false, ok: true, idea: d.idea }
        : { kind: 'idea', loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setResults((s) => ({ ...s, [q.query]: { kind: 'idea', loading: false, ok: false, error: String(e) } }))
    }
  }

  async function optimizePage(p: PageDetail) {
    const key = `opt:${p.path}`
    setResults((s) => ({ ...s, [key]: { kind: 'opt', loading: true } }))
    try {
      const res = await fetch('/api/blog/optimize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p.path, queries: p.strikingDistance }),
      })
      const d = await res.json()
      setResults((s) => ({ ...s, [key]: d.ok
        ? { kind: 'opt', loading: false, ok: true, opt: d }
        : { kind: 'opt', loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setResults((s) => ({ ...s, [key]: { kind: 'opt', loading: false, ok: false, error: String(e) } }))
    }
  }

  return (
    <main className="min-h-screen">
      <BrandHeader subtitle={queries && !queries.error
        ? `Reporte · ${queries.startDate} → ${queries.endDate} · ${pagesData?.pages.length ?? 0} páginas activas, ${queries.totalQueries} queries`
        : 'Performance de tus artículos + oportunidades nuevas'}>
        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                days === d ? 'bg-maroon text-cream' : 'bg-maroon/8 text-ink/70 hover:bg-maroon/15'
              }`}>{d}d</button>
          ))}
        </div>
      </BrandHeader>

      <div className="p-6 space-y-10 max-w-5xl">
        {loading && <p className="text-sm text-sand">Cargando reporte…</p>}

        {queries?.error && <ErrorBox msg={queries.error} />}
        {pagesData?.error && <ErrorBox msg={pagesData.error} />}

        {pagesData && !pagesData.error && (
          <PublishedSection
            pages={pagesData.pages}
            previousLabel={`${pagesData.previousStartDate} → ${pagesData.previousEndDate}`}
            results={results}
            onOptimize={optimizePage}
          />
        )}

        {queries && !queries.error && (
          <NewOpportunitiesSection
            untapped={trulyNew}
            results={results}
            onGenerate={generateArticle}
            onSuggestIdea={suggestIdea}
          />
        )}
      </div>
    </main>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">Error: {msg}</div>
}

/* ========== SECCIÓN 1: ARTÍCULOS PUBLICADOS ========== */

function PublishedSection({
  pages, previousLabel, results, onOptimize,
}: {
  pages: PageDetail[]
  previousLabel: string
  results: ResultMap
  onOptimize: (p: PageDetail) => void
}) {
  return (
    <section>
      <h2 className="font-semibold text-ink text-lg flex items-center gap-2">
        <span>📊</span> Tus artículos publicados
      </h2>
      <p className="text-sm text-sand mb-2">
        Cómo le va a cada página de faststrat.ai en el período seleccionado.
      </p>
      <div className="rounded-md bg-maroon/5 border-l-4 border-maroon px-3 py-2 mb-3 text-sm text-ink/80">
        <b>Qué ver:</b> clicks reales que recibe cada artículo, <b>tendencia (Δ)</b> vs el período anterior ({previousLabel}), y las búsquedas que lo están trayendo.
        <br />
        <b className="text-maroon">Acción:</b> click en una fila para ver sus queries. Si hay <b>striking-distance dentro de la página</b> (rankea pos 5-20 para esas búsquedas), apretá <i>Optimizar con IA</i> — el agente reescribe el artículo para capturar mejor esas queries y deja un nuevo borrador en{' '}
        <Link href="/blogs" className="text-maroon underline">Blogs</Link>.
      </div>

      {pages.length === 0 && (
        <p className="text-sm text-sand italic">Sin páginas con tráfico en este período.</p>
      )}

      <div className="space-y-2">
        {pages.map((p) => (
          <PageRow key={p.path} page={p} result={results[`opt:${p.path}`]} onOptimize={onOptimize} />
        ))}
      </div>
    </section>
  )
}

function PageRow({
  page, result, onOptimize,
}: {
  page: PageDetail
  result?: ResultMap[string]
  onOptimize: (p: PageDetail) => void
}) {
  const [open, setOpen] = useState(false)
  const hasStriking = page.strikingDistance.length > 0

  return (
    <div className="rounded-lg border border-maroon/15 bg-white/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-maroon/5 transition-colors"
      >
        {open ? <ChevronDown size={16} className="text-maroon shrink-0" /> : <ChevronRight size={16} className="text-maroon shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-ink truncate">{page.path}</p>
          <p className="text-xs text-sand">
            {page.topQueries.length} queries · pos. promedio #{page.position}
            {hasStriking && <span className="text-maroon ml-2">· {page.strikingDistance.length} en striking-distance</span>}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <Metric label="Clicks" value={page.clicks} delta={page.clicksDelta} />
          <Metric label="Impr." value={page.impressions} delta={page.impressionsDelta} sandIfNeutral />
          <span className="text-sand">CTR <b className="text-ink">{page.ctr}%</b></span>
        </div>
        <a href={`https://faststrat.ai${page.path}`} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sand hover:text-maroon shrink-0">
          <ExternalLink size={14} />
        </a>
      </button>

      {open && (
        <div className="border-t border-maroon/10 px-4 py-3 space-y-3 bg-cream/40">
          {/* En mobile las métricas no caben arriba — las muestro acá también */}
          <div className="flex sm:hidden items-center gap-4 text-sm">
            <Metric label="Clicks" value={page.clicks} delta={page.clicksDelta} />
            <Metric label="Impr." value={page.impressions} delta={page.impressionsDelta} sandIfNeutral />
            <span className="text-sand">CTR <b className="text-ink">{page.ctr}%</b></span>
          </div>

          {hasStriking && (
            <div className="rounded-md bg-white/70 border border-maroon/15 p-3">
              <p className="text-xs font-semibold text-maroon mb-2">
                🎯 Striking-distance dentro de esta página ({page.strikingDistance.length})
              </p>
              <p className="text-xs text-sand mb-2">
                Esta página ya aparece para estas búsquedas en pos 5-20. Optimizarla puede empujarla al top 5.
              </p>
              <ul className="text-xs space-y-1">
                {page.strikingDistance.map((q) => (
                  <li key={q.query} className="flex justify-between gap-2">
                    <span className="text-ink">{q.query}</span>
                    <span className="text-sand shrink-0">#{q.position} · {q.impressions} impr</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onOptimize(page)}
                disabled={result?.loading}
                className="mt-3 flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
              >
                {result?.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {result?.loading ? 'Optimizando…' : 'Optimizar con IA'}
              </button>

              {result && !result.loading && (
                <div className="mt-3">
                  {result.error && (
                    <p className="flex items-start gap-1.5 text-xs text-red-500"><AlertCircle size={12} className="mt-0.5" /> {result.error}</p>
                  )}
                  {result.opt && (
                    <div className="rounded-md border border-maroon/15 bg-white p-3">
                      <p className="text-xs font-semibold text-maroon mb-1 flex items-center gap-1">
                        <Check size={12} /> Versión optimizada · {result.opt.wordCount} palabras (borrador)
                      </p>
                      <p className="text-sm font-semibold text-ink">{result.opt.title}</p>
                      <p className="text-xs text-sand mt-1">
                        Capturando: {result.opt.capturedQueries.slice(0, 3).join(' · ')}{result.opt.capturedQueries.length > 3 ? '…' : ''}
                      </p>
                      <p className="text-xs text-sand mt-1 line-clamp-3">{result.opt.preview}…</p>
                      <Link href="/blogs" className="inline-flex items-center gap-1 text-xs font-medium text-maroon hover:underline mt-2">
                        Revisar y publicar en Blogs <ExternalLink size={11} />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!hasStriking && (
            <p className="text-xs text-sand italic">
              Esta página no tiene queries en striking-distance — ya rankea bien o tiene poca demanda secundaria que empujar.
            </p>
          )}

          <div>
            <p className="text-xs font-semibold text-ink mb-1.5">Top queries que la traen</p>
            <table className="w-full text-xs">
              <tbody>
                {page.topQueries.map((q) => (
                  <tr key={q.query} className="border-t border-maroon/8">
                    <td className="py-1.5 text-ink">{q.query}</td>
                    <td className="py-1.5 text-right text-sand">{q.clicks} clk</td>
                    <td className="py-1.5 text-right text-sand">{q.impressions} impr</td>
                    <td className="py-1.5 text-right text-sand">#{q.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, delta, sandIfNeutral = false }: { label: string; value: number; delta: number; sandIfNeutral?: boolean }) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : sandIfNeutral ? 'text-sand' : 'text-sand'
  return (
    <span className="flex items-center gap-1 text-sand whitespace-nowrap">
      {label} <b className="text-ink">{value.toLocaleString()}</b>
      <span className={`flex items-center gap-0.5 text-xs ${color}`}>
        <Icon size={11} /> {delta > 0 ? '+' : ''}{delta}
      </span>
    </span>
  )
}

/* ========== SECCIÓN 2: OPORTUNIDADES NUEVAS ========== */

function NewOpportunitiesSection({
  untapped, results, onGenerate, onSuggestIdea,
}: {
  untapped: Q[]
  results: ResultMap
  onGenerate: (q: Q) => void
  onSuggestIdea: (q: Q) => void
}) {
  return (
    <section>
      <h2 className="font-semibold text-ink text-lg flex items-center gap-2">
        <span>🌱</span> Oportunidades para escribir nuevo
      </h2>
      <p className="text-sm text-sand mb-2">
        Búsquedas con demanda real donde Google te muestra, pero <b>NO tienes un artículo dedicado</b> que las capture.
      </p>
      <div className="rounded-md bg-maroon/5 border-l-4 border-maroon px-3 py-2 mb-3 text-sm text-ink/80">
        <b>Qué ver:</b> queries que pasaron el filtro "ya está cubierta por un artículo existente". Lo que queda son temas nuevos para escribir.
        <br />
        <b className="text-maroon">Acción:</b> <i>Idea</i> = el agente propone título + outline y lo guarda en <Link href="/ideas" className="text-maroon underline">Ideas</Link>. <i>Generar</i> = el agente escribe el artículo completo como borrador en <Link href="/blogs" className="text-maroon underline">Blogs</Link>, listo para publicar.
      </div>

      <div className="rounded-lg border border-maroon/15 bg-white/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-maroon/5 text-maroon">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Query</th>
              <th className="text-right px-3 py-2 font-semibold">Impr.</th>
              <th className="text-right px-3 py-2 font-semibold">Pos.</th>
              <th className="text-right px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {untapped.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sand">
                No hay queries nuevas — toda la demanda actual ya está siendo capturada por algún artículo.
              </td></tr>
            )}
            {untapped.map((q) => {
              const r = results[q.query]
              return (
                <Fragment key={q.query}>
                  <tr className="border-t border-maroon/8">
                    <td className="px-3 py-2 text-ink">{q.query}</td>
                    <td className="px-3 py-2 text-right text-sand">{q.impressions.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-sand">#{q.position}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => onSuggestIdea(q)} disabled={r?.loading}
                          title="Pedir una idea de artículo al agente"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-maroon/20 text-maroon hover:bg-maroon/8 disabled:opacity-50">
                          {r?.loading && r.kind === 'idea' ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                          Idea
                        </button>
                        <button onClick={() => onGenerate(q)} disabled={r?.loading}
                          title="Generar artículo con el agente SEO"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50">
                          {r?.loading && r.kind === 'gen' ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
                          {r?.loading && r.kind === 'gen' ? 'Escribiendo…' : 'Generar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {r && (r.loading || r.ok || r.error) && (
                    <tr className="bg-cream/60">
                      <td colSpan={4} className="px-3 pb-3 pt-1">
                        <NewOppResultPanel result={r} />
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

function NewOppResultPanel({ result: r }: { result: ResultMap[string] }) {
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
        <p className="text-xs text-sand mt-1 line-clamp-4">{r.gen.preview}…</p>
        <Link href="/blogs" className="inline-flex items-center gap-1 text-xs font-medium text-maroon hover:underline mt-2">
          Ver y publicar en Blogs <ExternalLink size={11} />
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
        <p className="text-xs text-sand mt-1"><b>Intención:</b> {r.idea.intent} · <span className="uppercase">{r.idea.lang}</span></p>
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
