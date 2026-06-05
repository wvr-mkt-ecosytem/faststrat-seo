'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Loader2, Check, AlertCircle, ExternalLink,
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

type PagesData = {
  startDate: string
  endDate: string
  previousStartDate: string
  previousEndDate: string
  pages: PageDetail[]
  error?: string
}

const DAYS = [28, 90]

type OptResult = {
  loading: boolean
  ok?: boolean
  error?: string
  data?: { title: string; slug: string; preview: string; wordCount: number; capturedQueries: string[] }
}

export default function ReportsPage() {
  const [pagesData, setPagesData] = useState<PagesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(28)
  const [optResults, setOptResults] = useState<Record<string, OptResult>>({})

  useEffect(() => {
    setLoading(true)
    fetch(`/api/gsc/pages-detail?days=${days}`)
      .then((r) => r.json())
      .then(setPagesData)
      .finally(() => setLoading(false))
  }, [days])

  async function optimizePage(p: PageDetail) {
    setOptResults((s) => ({ ...s, [p.path]: { loading: true } }))
    try {
      const res = await fetch('/api/blog/optimize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p.path, queries: p.strikingDistance }),
      })
      const d = await res.json()
      setOptResults((s) => ({ ...s, [p.path]: d.ok
        ? { loading: false, ok: true, data: d }
        : { loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setOptResults((s) => ({ ...s, [p.path]: { loading: false, ok: false, error: String(e) } }))
    }
  }

  return (
    <main className="min-h-screen">
      <BrandHeader subtitle={pagesData && !pagesData.error
        ? `Performance · ${pagesData.startDate} → ${pagesData.endDate} · ${pagesData.pages.length} páginas con tráfico`
        : 'Cómo le va a tus artículos publicados'}>
        <div className="flex gap-1">
          {DAYS.map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                days === d ? 'bg-maroon text-cream' : 'bg-maroon/8 text-ink/70 hover:bg-maroon/15'
              }`}>{d}d</button>
          ))}
        </div>
      </BrandHeader>

      <div className="p-6 space-y-6 max-w-5xl">
        <PrimerSection />

        {loading && <p className="text-sm text-sand">Cargando reporte…</p>}
        {pagesData?.error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3">Error: {pagesData.error}</div>
        )}

        {pagesData && !pagesData.error && (
          <PublishedSection
            pages={pagesData.pages}
            previousLabel={`${pagesData.previousStartDate} → ${pagesData.previousEndDate}`}
            results={optResults}
            onOptimize={optimizePage}
          />
        )}

        <CrossLink />
      </div>
    </main>
  )
}

/* ========== Explicación inicial ========== */

function PrimerSection() {
  return (
    <details className="rounded-lg border border-maroon/15 bg-white/60 px-4 py-3" open>
      <summary className="cursor-pointer font-semibold text-ink text-sm flex items-center gap-2">
        <span className="text-maroon">📖</span> ¿Qué es esto y cómo lo uso? (lee esto primero si no eres de SEO)
      </summary>
      <div className="mt-3 space-y-3 text-sm text-ink/85 leading-relaxed">
        <p>
          Cuando alguien busca algo en Google y aparece tu sitio en los resultados, Google va anotando todo: qué buscaron,
          en qué posición saliste, cuántas veces te mostró, y si clickearon o no. Este reporte es ese expediente, traducido a algo accionable.
        </p>

        <div className="rounded-md bg-maroon/5 border border-maroon/15 p-3 space-y-2">
          <p className="font-semibold text-maroon">Las 4 métricas que ves, explicadas sin tecnicismos</p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <b>Impresiones:</b> cuántas veces Google le mostró tu artículo a alguien que buscó algo relacionado.
              Es <i>visibilidad</i>. Si tienes 1.000 impresiones, mil personas vieron tu link en los resultados.
            </li>
            <li>
              <b>Clicks:</b> de esas veces que apareciste, cuántas la persona realmente clickeó tu link.
              Es <i>tráfico real</i> que llega a la página.
            </li>
            <li>
              <b>CTR (click-through rate):</b> el porcentaje de los que vieron tu link y clickearon.
              Si tienes 1.000 impresiones y 30 clicks, tu CTR es 3%. <b>CTR bajo</b> = la gente te ve pero no le interesa hacer click
              (probablemente tu título o descripción no engancha, o estás muy abajo en la lista).
            </li>
            <li>
              <b>Posición:</b> en qué número de resultado apareces en promedio.
              <span className="text-green-700"> #1-3 = top de la página 1</span> (donde llegan la mayoría de los clicks).
              <span className="text-yellow-700"> #4-10 = el resto de la página 1.</span>
              <span className="text-red-600"> #11+ = página 2 o más</span> (a donde casi nadie llega).
            </li>
          </ul>
        </div>

        <div className="rounded-md bg-maroon/5 border border-maroon/15 p-3 space-y-2">
          <p className="font-semibold text-maroon">La idea clave: &quot;striking-distance&quot;</p>
          <p>
            Si tienes un artículo que aparece en <b>posición 7 para una búsqueda con 200 impresiones</b>,
            está literalmente a un empujón de la página 1. La gente está googleando esa búsqueda,
            Google ya te considera relevante para ella, pero estás justo afuera del top 5 donde llegan los clicks.
          </p>
          <p>
            Eso es <b>striking distance</b>: estás cerca de capturar tráfico real con poco esfuerzo.
            Reescribir o expandir ese artículo para que cubra mejor esa búsqueda puede subirte al top 5
            y multiplicar tus clicks <i>sin escribir un artículo nuevo</i>.
          </p>
        </div>

        <div className="rounded-md bg-maroon/5 border border-maroon/15 p-3 space-y-2">
          <p className="font-semibold text-maroon">Cómo se usa este reporte</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Mira la tabla de abajo: cada fila es un artículo de tu sitio.</li>
            <li>Las que tienen <b className="text-maroon">&quot;N en striking-distance&quot;</b> en rojo granate son las de mayor oportunidad — son artículos a un empujón del top.</li>
            <li>Click en una fila para ver qué búsquedas la podrían empujar.</li>
            <li>El botón <b>Optimizar con IA</b> hace ese empujón: el agente reescribe el artículo para cubrir mejor esas búsquedas y deja un nuevo borrador en <Link href="/blogs" className="text-maroon underline">Blogs</Link>. Tú lo revisas y lo publicas.</li>
          </ol>
        </div>
      </div>
    </details>
  )
}

/* ========== Sección: páginas publicadas ========== */

function PublishedSection({
  pages, previousLabel, results, onOptimize,
}: {
  pages: PageDetail[]
  previousLabel: string
  results: Record<string, OptResult>
  onOptimize: (p: PageDetail) => void
}) {
  return (
    <section>
      <h2 className="font-semibold text-ink text-lg flex items-center gap-2">
        <span>📊</span> Tus artículos publicados
      </h2>
      <p className="text-sm text-sand mb-3">
        Cada fila es una página real de faststrat.ai. La columna <b>Δ</b> (delta) muestra si va subiendo o
        bajando vs los {previousLabel.includes('→') ? previousLabel : 'días previos'} ({previousLabel}).
      </p>

      {pages.length === 0 && (
        <p className="text-sm text-sand italic">Sin páginas con tráfico en este período.</p>
      )}

      <div className="space-y-2">
        {pages.map((p) => (
          <PageRow key={p.path} page={p} result={results[p.path]} onOptimize={onOptimize} />
        ))}
      </div>
    </section>
  )
}

function PageRow({
  page, result, onOptimize,
}: {
  page: PageDetail
  result?: OptResult
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
            {page.topQueries.length} búsquedas la encuentran · posición promedio #{page.position}
            {hasStriking && <span className="text-maroon ml-2">· {page.strikingDistance.length} en striking-distance</span>}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <Metric label="Clicks" value={page.clicks} delta={page.clicksDelta} />
          <Metric label="Impr." value={page.impressions} delta={page.impressionsDelta} />
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
          <div className="flex sm:hidden items-center gap-4 text-sm flex-wrap">
            <Metric label="Clicks" value={page.clicks} delta={page.clicksDelta} />
            <Metric label="Impr." value={page.impressions} delta={page.impressionsDelta} />
            <span className="text-sand">CTR <b className="text-ink">{page.ctr}%</b></span>
          </div>

          {hasStriking && (
            <div className="rounded-md bg-white/70 border border-maroon/15 p-3">
              <p className="text-xs font-semibold text-maroon mb-1">
                🎯 Búsquedas en striking-distance ({page.strikingDistance.length})
              </p>
              <p className="text-xs text-ink/80 mb-2">
                Este artículo aparece para estas búsquedas pero <b>fuera del top 5</b>. Si lo optimizas para cubrirlas mejor, probablemente suba a página 1 y empieces a recibir clicks.
              </p>
              <ul className="text-xs space-y-1">
                {page.strikingDistance.map((q) => (
                  <li key={q.query} className="flex justify-between gap-2">
                    <span className="text-ink">&quot;{q.query}&quot;</span>
                    <span className="text-sand shrink-0">posición #{q.position} · {q.impressions} impresiones</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onOptimize(page)}
                disabled={result?.loading}
                className="mt-3 flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
              >
                {result?.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {result?.loading ? 'El agente está reescribiendo…' : 'Optimizar con IA'}
              </button>
              <p className="text-xs text-sand mt-1.5">
                El agente lee el artículo actual y lo reescribe para capturar mejor estas búsquedas.
                El borrador queda en <Link href="/blogs" className="text-maroon underline">Blogs</Link> como{' '}
                <code className="text-ink">{page.path.replace(/^\/|\/$/g, '')}-optimized</code> para que lo revises antes de publicarlo.
              </p>

              {result?.error && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-red-500"><AlertCircle size={12} className="mt-0.5" /> {result.error}</p>
              )}
              {result?.data && (
                <div className="mt-3 rounded-md border border-maroon/15 bg-white p-3">
                  <p className="text-xs font-semibold text-maroon mb-1 flex items-center gap-1">
                    <Check size={12} /> Versión optimizada · {result.data.wordCount} palabras (borrador)
                  </p>
                  <p className="text-sm font-semibold text-ink">{result.data.title}</p>
                  <p className="text-xs text-sand mt-1">
                    Captura las búsquedas: {result.data.capturedQueries.slice(0, 3).join(' · ')}{result.data.capturedQueries.length > 3 ? '…' : ''}
                  </p>
                  <p className="text-xs text-sand mt-1 line-clamp-3">{result.data.preview}…</p>
                  <Link href="/blogs" className="inline-flex items-center gap-1 text-xs font-medium text-maroon hover:underline mt-2">
                    Revisar y publicar en Blogs <ExternalLink size={11} />
                  </Link>
                </div>
              )}
            </div>
          )}

          {!hasStriking && (
            <p className="text-xs text-sand italic">
              Este artículo no tiene búsquedas en striking-distance: o ya rankea bien para sus términos principales, o las búsquedas que lo trajeron tienen poco volumen para empujar.
            </p>
          )}

          <div>
            <p className="text-xs font-semibold text-ink mb-1.5">Top búsquedas que la encuentran</p>
            <table className="w-full text-xs">
              <tbody>
                {page.topQueries.map((q) => (
                  <tr key={q.query} className="border-t border-maroon/8">
                    <td className="py-1.5 text-ink">&quot;{q.query}&quot;</td>
                    <td className="py-1.5 text-right text-sand">{q.clicks} clicks</td>
                    <td className="py-1.5 text-right text-sand">{q.impressions} impresiones</td>
                    <td className="py-1.5 text-right text-sand">posición #{q.position}</td>
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

function Metric({ label, value, delta }: { label: string; value: number; delta: number }) {
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const color = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-sand'
  return (
    <span className="flex items-center gap-1 text-sand whitespace-nowrap">
      {label} <b className="text-ink">{value.toLocaleString()}</b>
      <span className={`flex items-center gap-0.5 text-xs ${color}`}>
        <Icon size={11} /> {delta > 0 ? '+' : ''}{delta}
      </span>
    </span>
  )
}

function CrossLink() {
  return (
    <div className="rounded-lg border border-maroon/15 bg-maroon/5 p-4 text-sm text-ink/80">
      <p className="font-semibold text-maroon mb-1">¿Buscas oportunidades para artículos NUEVOS?</p>
      <p>
        Este reporte es solo sobre cómo le va a lo que YA publicaste. Las oportunidades para escribir contenido nuevo
        (búsquedas reales donde aún no tienes nada) están en{' '}
        <Link href="/ideas" className="text-maroon underline font-medium">Ideas</Link>, junto con la tanda semanal que arma el agente.
      </p>
    </div>
  )
}
