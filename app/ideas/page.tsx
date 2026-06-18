'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Users, Calendar, Loader2, PenLine, Lightbulb,
  Check, AlertCircle, ExternalLink, RefreshCw,
} from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'
import { postJson, wake, ApiError } from '@/lib/api'

type Idea = {
  title: string
  slug: string
  lang: string
  priority: 'alta' | 'media' | 'baja'
  primaryKeyword: string
  intent: string
  rationale: string
  outline: string[]
}

type Batch = {
  weekOf: string
  generatedAt: string
  source: string
  summary: string
  research: { competitors: string[]; trends: string[] }
  ideas: Idea[]
}

type Q = { query: string; clicks: number; impressions: number; ctr: number; position: number }

const PRIORITY_STYLES: Record<string, string> = {
  alta: 'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  baja: 'bg-neutral-100 text-neutral-600',
}

type ResultMap = Record<string, {
  kind: 'gen' | 'idea'
  loading: boolean
  ok?: boolean
  error?: string
  gen?: { title: string; slug: string; preview: string; wordCount: number }
  idea?: { title: string; intent: string; rationale: string; outline: string[]; lang: string }
}>

export default function IdeasPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(0)

  // Oportunidades de Search Console
  const [untapped, setUntapped] = useState<Q[]>([])
  const [oppLoading, setOppLoading] = useState(true)
  const [results, setResults] = useState<ResultMap>({})

  useEffect(() => {
    wake() // despierta el free tier de Render para que las acciones no fallen
    fetch('/api/ideas')
      .then((r) => r.json())
      .then((d) => setBatches(d.batches ?? []))
      .finally(() => setLoading(false))
  }, [])

  // Carga queries sin explotar + páginas para filtrar las que ya están cubiertas
  useEffect(() => {
    setOppLoading(true)
    Promise.all([
      fetch('/api/gsc/queries?days=90').then((r) => r.json()),
      fetch('/api/gsc/pages-detail?days=90').then((r) => r.json()),
    ])
      .then(([q, p]) => {
        // Solo cuenta como "ya cubierta" si alguna página rankea bien para
        // esa query (posición top 5 o ya recibe clicks). Estar en posición 30
        // con 0 clicks NO es cubrir — significa que Google probó tu artículo
        // y no enganchó: la oportunidad de escribir algo dedicado sigue ahí.
        const owned = new Set<string>()
        for (const page of p.pages ?? []) {
          for (const tq of page.topQueries ?? []) {
            if (tq.position <= 5 || tq.clicks > 0) {
              owned.add(tq.query.toLowerCase())
            }
          }
        }
        const fresh = (q.untapped ?? []).filter((qq: Q) => !owned.has(qq.query.toLowerCase()))
        setUntapped(fresh)
      })
      .finally(() => setOppLoading(false))
  }, [])

  const [refreshing, setRefreshing] = useState(false)

  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  async function refreshResearch() {
    if (!confirm('El agente va a buscar en la web y regenerar la investigación e ideas de esta semana. Toma 1-2 minutos. ¿Continuar?')) return
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const d = await postJson<{ ok?: boolean; error?: string }>('/api/weekly?noEmail=1', {})
      if (d.ok) {
        const fresh = await fetch('/api/ideas').then((r) => r.json())
        setBatches(fresh.batches ?? [])
        setSelected(0)
        setRefreshMsg('✓ Investigación actualizada')
      } else {
        setRefreshMsg('Error: ' + (d.error ?? 'desconocido'))
      }
    } catch (e) {
      setRefreshMsg(e instanceof ApiError ? e.message : 'Error: ' + String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const batch = batches[selected]

  // Genérico: escribe un artículo. `key` identifica la fila (query o slug de idea).
  async function generate(key: string, payload: { keyword?: string; topic?: string; title?: string; lang?: string; category?: string }) {
    setResults((s) => ({ ...s, [key]: { kind: 'gen', loading: true } }))
    try {
      const d = await postJson<{ ok?: boolean; error?: string; title?: string; slug?: string; preview?: string; wordCount?: number }>('/api/blog/generate', payload)
      setResults((s) => ({ ...s, [key]: d.ok
        ? { kind: 'gen', loading: false, ok: true, gen: { title: d.title!, slug: d.slug!, preview: d.preview!, wordCount: d.wordCount! } }
        : { kind: 'gen', loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setResults((s) => ({ ...s, [key]: { kind: 'gen', loading: false, ok: false, error: e instanceof ApiError ? e.message : String(e) } }))
    }
  }

  const generateArticle = (q: Q) => generate(q.query, { keyword: q.query })

  // Escribe TODOS los artículos de la tanda, uno por uno (secuencial).
  const [writingAll, setWritingAll] = useState(false)
  const [writeAllProgress, setWriteAllProgress] = useState<{ done: number; total: number } | null>(null)

  async function writeAllBlogs() {
    if (!batch) return
    const pending = batch.ideas.filter((i) => !results[i.slug]?.ok)
    if (pending.length === 0) { alert('Ya escribiste todos los artículos de esta tanda.'); return }
    if (!confirm(`El agente va a escribir ${pending.length} artículos, uno por uno. Toma varios minutos — no cierres la página. Aparecerán en Blogs como borradores. ¿Continuar?`)) return
    setWritingAll(true)
    let done = 0
    for (const idea of pending) {
      setWriteAllProgress({ done, total: pending.length })
      await generate(idea.slug, { keyword: idea.primaryKeyword, title: idea.title, lang: idea.lang })
      done++
      setWriteAllProgress({ done, total: pending.length })
    }
    setWritingAll(false)
  }

  // Genera un blog a partir de un insight (texto largo de competidor/tendencia).
  // Pasa el insight como `topic`: el agente elige el título y keyword y escribe.
  function generateFromInsight(key: string, insight: string) {
    generate(key, { topic: insight })
  }

  async function suggestIdea(q: Q) {
    setResults((s) => ({ ...s, [q.query]: { kind: 'idea', loading: true } }))
    try {
      const d = await postJson<{ ok?: boolean; error?: string; idea?: ResultMap[string]['idea'] }>('/api/ideas/suggest', { keyword: q.query, context: `${q.impressions} impr, pos ${q.position}, CTR ${q.ctr}%.` })
      setResults((s) => ({ ...s, [q.query]: d.ok
        ? { kind: 'idea', loading: false, ok: true, idea: d.idea }
        : { kind: 'idea', loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setResults((s) => ({ ...s, [q.query]: { kind: 'idea', loading: false, ok: false, error: e instanceof ApiError ? e.message : String(e) } }))
    }
  }

  return (
    <main className="min-h-screen">
      <BrandHeader
        subtitle={
          batch
            ? `Ideas de contenido · semana del ${batch.weekOf} · ${batch.ideas.length} sugeridos + ${untapped.length} oportunidades de queries`
            : 'Investigación semanal de temas + oportunidades nuevas'
        }
      >
        {batches.length > 1 && (
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            className="text-sm border border-maroon/15 bg-white/60 rounded-md px-2 py-1"
          >
            {batches.map((b, i) => (
              <option key={b.weekOf} value={i}>
                Semana del {b.weekOf}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={writeAllBlogs}
          disabled={writingAll || !batch}
          title="El agente escribe un artículo por cada idea de la tanda"
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
        >
          {writingAll ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
          {writingAll && writeAllProgress
            ? `Escribiendo ${writeAllProgress.done}/${writeAllProgress.total}…`
            : 'Escribir todos los blogs'}
        </button>
        <button
          onClick={refreshResearch}
          disabled={refreshing}
          title="El agente busca en la web y regenera competidores, tendencias e ideas nuevas"
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border border-maroon/25 text-maroon hover:bg-maroon/8 disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {refreshing ? 'Buscando…' : 'Más ideas'}
        </button>
      </BrandHeader>

      <div className="p-6 max-w-4xl space-y-8">
        {refreshMsg && (
          <p className={`text-sm ${refreshMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{refreshMsg}</p>
        )}
        {/* === Tanda semanal curada === */}
        {loading && <p className="text-sm text-sand">Cargando ideas…</p>}

        {!loading && !batch && (
          <div className="text-sm text-sand border border-dashed border-maroon/15 rounded-lg p-8 text-center">
            Aún no hay tandas de ideas. La investigación semanal aparecerá aquí.
          </div>
        )}

        {batch && (
          <section className="space-y-4">
            <h2 className="font-semibold text-ink text-lg flex items-center gap-2">
              <Calendar size={18} /> Tanda semanal (investigación curada)
            </h2>
            <p className="text-sm text-ink/80">{batch.summary}</p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-maroon/15 bg-white/60 rounded-lg p-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-2 text-maroon">
                  <Users size={15} /> Competidores
                </h3>
                <ul className="space-y-2">
                  {batch.research.competitors.map((c, i) => (
                    <InsightItem key={`comp-${i}`} insight={c} kind="competidor"
                      result={results[`insight:comp-${i}`]}
                      onGenerate={() => generateFromInsight(`insight:comp-${i}`, c)} />
                  ))}
                </ul>
              </div>
              <div className="border border-maroon/15 bg-white/60 rounded-lg p-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-2 text-maroon">
                  <TrendingUp size={15} /> Tendencias
                </h3>
                <ul className="space-y-2">
                  {batch.research.trends.map((t, i) => (
                    <InsightItem key={`trend-${i}`} insight={t} kind="tendencia"
                      result={results[`insight:trend-${i}`]}
                      onGenerate={() => generateFromInsight(`insight:trend-${i}`, t)} />
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-ink">
                Artículos sugeridos esta semana
              </h3>
              {batch.ideas.map((idea, i) => {
                const r = results[idea.slug]
                return (
                <div key={idea.slug} className="border border-maroon/15 bg-white/60 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-sand font-mono">#{i + 1}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${PRIORITY_STYLES[idea.priority]}`}>{idea.priority}</span>
                        <span className="text-xs uppercase text-sand">{idea.lang}</span>
                      </div>
                      <h4 className="font-semibold text-ink">{idea.title}</h4>
                      <p className="text-xs text-sand mt-1">
                        <b>Keyword:</b> {idea.primaryKeyword} · <b>Intención:</b> {idea.intent}
                      </p>
                      <p className="text-sm text-ink/80 mt-2"><b>Por qué:</b> {idea.rationale}</p>
                      {idea.outline.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-sand cursor-pointer hover:text-maroon">Ver outline</summary>
                          <ol className="list-decimal list-inside mt-1.5 space-y-0.5">
                            {idea.outline.map((o, j) => (
                              <li key={j} className="text-xs text-ink/80">{o}</li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </div>
                    <button
                      onClick={() => generate(idea.slug, { keyword: idea.primaryKeyword, title: idea.title, lang: idea.lang })}
                      disabled={r?.loading}
                      title="Escribir el artículo con el agente SEO"
                      className="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
                    >
                      {r?.loading ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
                      {r?.loading ? 'Escribiendo…' : 'Escribir'}
                    </button>
                  </div>
                  {r && (r.loading || r.ok || r.error) && (
                    <div className="mt-3"><ResultPanel result={r} /></div>
                  )}
                </div>
                )
              })}
            </div>
          </section>
        )}

        {/* === Oportunidades del Search Console === */}
        <section className="space-y-3 pt-4 border-t border-maroon/15">
          <h2 className="font-semibold text-ink text-lg flex items-center gap-2">
            <span>🌱</span> Oportunidades de queries (Search Console · 90 días)
          </h2>
          <p className="text-sm text-ink/80">
            Búsquedas reales de Google donde tu sitio aparece pero <b>no tienes un artículo dedicado</b> que las capture.
          </p>
          <div className="rounded-md bg-maroon/5 border-l-4 border-maroon px-3 py-2 text-sm text-ink/80">
            <b>Cómo se diferencia de la tanda semanal:</b> arriba el agente propone <i>temas estratégicos</i> basados en tendencias del mercado. Aquí abajo son <i>búsquedas exactas de gente real</i> que ya está googleando estos términos pero no encuentra contenido tuyo. Las dos cosas son útiles, pero las de abajo tienen demanda comprobada hoy.
            <br />
            <b className="text-maroon">Acción:</b> <i>Idea</i> = el agente propone título + outline. <i>Generar</i> = el agente escribe el artículo completo. Ambos terminan en{' '}
            <Link href="/blogs" className="text-maroon underline">Blogs</Link>, listo para publicar a faststrat.ai.
          </div>

          {oppLoading && <p className="text-sm text-sand">Cargando oportunidades…</p>}

          {!oppLoading && untapped.length === 0 && (
            <p className="text-sm text-sand italic">No hay queries nuevas en este período — toda la demanda ya está siendo capturada por algún artículo.</p>
          )}

          {!oppLoading && untapped.length > 0 && (
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
                              <button onClick={() => suggestIdea(q)} disabled={r?.loading}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-maroon/20 text-maroon hover:bg-maroon/8 disabled:opacity-50">
                                {r?.loading && r.kind === 'idea' ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                                Idea
                              </button>
                              <button onClick={() => generateArticle(q)} disabled={r?.loading}
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
          )}
        </section>
      </div>
    </main>
  )
}

function InsightItem({
  insight, kind, result, onGenerate,
}: {
  insight: string
  kind: string
  result?: ResultMap[string]
  onGenerate: () => void
}) {
  return (
    <li className="text-xs text-ink/80 leading-relaxed">
      <div className="flex items-start gap-2">
        <span className="flex-1">• {insight}</span>
        <button
          onClick={onGenerate}
          disabled={result?.loading}
          title={`Escribir un blog sobre este ${kind}`}
          className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border border-maroon/20 text-maroon hover:bg-maroon/8 disabled:opacity-50"
        >
          {result?.loading ? <Loader2 size={11} className="animate-spin" /> : <PenLine size={11} />}
          Blog
        </button>
      </div>
      {result && (result.loading || result.ok || result.error) && (
        <div className="mt-1.5"><ResultPanel result={result} /></div>
      )}
    </li>
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
    return <div className="flex items-start gap-1.5 text-xs text-red-500"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {r.error}</div>
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
          <Check size={13} /> Idea propuesta · agregada arriba
        </div>
        <p className="text-sm font-semibold text-ink">{r.idea.title}</p>
        <p className="text-xs text-sand mt-1"><b>Intención:</b> {r.idea.intent} · <span className="uppercase">{r.idea.lang}</span></p>
        <p className="text-xs text-ink/80 mt-1">{r.idea.rationale}</p>
        {r.idea.outline.length > 0 && (
          <ol className="list-decimal list-inside mt-1.5 space-y-0.5">
            {r.idea.outline.map((o, i) => <li key={i} className="text-xs text-sand">{o}</li>)}
          </ol>
        )}
      </div>
    )
  }
  return null
}
