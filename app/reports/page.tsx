'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Loader2, Check, AlertCircle, ExternalLink,
  TrendingUp, TrendingDown, Minus, Sparkles, ChevronDown, ChevronRight, PenLine,
} from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'
import { Progreso } from '@/components/Progreso'
import { postJson, wake, ApiError } from '@/lib/api'

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

  useEffect(() => { wake() }, [])

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
      const d = await postJson<OptResult['data'] & { ok?: boolean; error?: string }>('/api/blog/optimize', { path: p.path, queries: p.strikingDistance })
      setOptResults((s) => ({ ...s, [p.path]: d.ok
        ? { loading: false, ok: true, data: d }
        : { loading: false, ok: false, error: d.error } }))
    } catch (e) {
      setOptResults((s) => ({ ...s, [p.path]: { loading: false, ok: false, error: e instanceof ApiError ? e.message : String(e) } }))
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
        {/* El análisis del agente, con su historial semanal.
            Estaba en el Dashboard, que es donde se miran los números de un
            vistazo. Un informe escrito se lee, no se ojea, y la pestaña que se
            llama Reportes es donde uno lo busca. */}
        <AnalisisSemanal />

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

/* ========== Diagnóstico personalizado por artículo ========== */

type Diagnosis = {
  headline: string
  posture: 'star' | 'rising' | 'stuck' | 'untapped' | 'declining' | 'new'
  bullets: { label: string; text: React.ReactNode }[]
  whatToDo: React.ReactNode
}

/**
 * Lee los números reales del artículo y devuelve un diagnóstico en lenguaje
 * cotidiano: qué le está pasando, por qué, y qué hacer al respecto.
 */
function diagnosePage(p: PageDetail): Diagnosis {
  const bullets: Diagnosis['bullets'] = []

  // === Lectura de tráfico ===
  if (p.clicks === 0 && p.impressions > 100) {
    bullets.push({
      label: 'Tráfico',
      text: <>
        Apareciste <b>{p.impressions.toLocaleString()} veces</b> en resultados de Google, pero <b className="text-red-600">cero personas hicieron click</b> en tu link.
        Eso significa que estás siendo visible (Google te considera relevante), pero el título o la descripción no engancha — o estás tan abajo en la lista que ni te ven.
      </>,
    })
  } else if (p.clicks > 0) {
    bullets.push({
      label: 'Tráfico',
      text: <>
        <b>{p.clicks} {p.clicks === 1 ? 'persona llegó' : 'personas llegaron'}</b> a esta página desde Google,
        de las <b>{p.impressions.toLocaleString()}</b> veces que apareciste en resultados.
        Es decir, de cada 100 personas que te vieron, <b>{p.ctr.toFixed(1)}</b> hicieron click.
      </>,
    })
  } else {
    bullets.push({
      label: 'Tráfico',
      text: <>Pocas impresiones ({p.impressions.toLocaleString()}) y ningún click — esta página apenas está empezando a aparecer en Google.</>,
    })
  }

  // === Tendencia ===
  if (p.clicksDelta > 0 && p.clicks > 0) {
    bullets.push({
      label: 'Tendencia',
      text: <>
        <span className="text-green-700">Subiendo.</span> Recibes <b>+{p.clicksDelta}</b> clicks comparado con el período anterior.
        {p.impressionsDelta > 0 && <> Google también te muestra más veces (<b>+{p.impressionsDelta.toLocaleString()}</b> impresiones).</>}
      </>,
    })
  } else if (p.clicksDelta < 0) {
    bullets.push({
      label: 'Tendencia',
      text: <>
        <span className="text-red-600">Bajando.</span> {Math.abs(p.clicksDelta)} clicks menos que el período anterior.
        {p.impressionsDelta < -20 && <> Y también te muestran menos veces — probablemente un competidor te está pasando o Google reorganizó resultados.</>}
        {p.impressionsDelta > 0 && <> Curiosamente te muestran <i>más</i> que antes pero clickean menos — algo cambió en tu título/snippet o aparece un competidor más atractivo arriba tuyo.</>}
      </>,
    })
  } else if (p.impressionsDelta > 0 && p.clicks === 0) {
    bullets.push({
      label: 'Tendencia',
      text: <>Google te está mostrando más (<b>+{p.impressionsDelta.toLocaleString()}</b> impresiones nuevas) pero todavía no convierte en clicks. Buena señal de visibilidad emergente.</>,
    })
  } else if (p.clicksDelta === 0 && p.impressionsDelta === 0 && p.clicks === 0) {
    // sin info de tendencia útil
  } else {
    bullets.push({
      label: 'Tendencia',
      text: <>Estable. Métricas casi idénticas al período anterior.</>,
    })
  }

  // === Posición ===
  if (p.position > 0 && p.position <= 3) {
    bullets.push({
      label: 'Posición',
      text: <>
        Estás en el <b className="text-green-700">top 3 de Google</b> en promedio (posición #{p.position}).
        Esa es la mejor zona — la mayoría de los clicks de cualquier búsqueda van a los 3 primeros resultados.
      </>,
    })
  } else if (p.position > 0 && p.position <= 5) {
    bullets.push({
      label: 'Posición',
      text: <>
        Estás en el <b className="text-green-700">top 5</b> de la página 1 (posición #{p.position}). Buena zona — recibes una parte considerable de los clicks de cada búsqueda.
      </>,
    })
  } else if (p.position > 0 && p.position <= 10) {
    bullets.push({
      label: 'Posición',
      text: <>
        Estás en la <b className="text-yellow-700">página 1 pero abajo del top 5</b> (posición #{p.position}). Te ven pero la mayoría de los clicks van a los resultados de arriba.
        Subir al top 5 puede multiplicar tus clicks varias veces.
      </>,
    })
  } else if (p.position > 0) {
    bullets.push({
      label: 'Posición',
      text: <>
        Estás <b className="text-red-600">en la página 2 o más abajo</b> en promedio (posición #{p.position}). Muy poca gente llega a esa zona — para ganar clicks reales necesitas subir significativamente.
      </>,
    })
  }

  // === Striking distance / oportunidad ===
  if (p.strikingDistance.length > 0) {
    const top = p.strikingDistance[0]
    const totalOppImpr = p.strikingDistance.reduce((s, q) => s + q.impressions, 0)
    bullets.push({
      label: 'Oportunidad',
      text: <>
        Hay <b className="text-maroon">{p.strikingDistance.length} {p.strikingDistance.length === 1 ? 'búsqueda' : 'búsquedas'}</b> donde
        este artículo aparece en posición 5-20 con buena demanda{' '}
        (<b>{totalOppImpr.toLocaleString()}</b> impresiones combinadas).
        Por ejemplo, para <b>&quot;{top.query}&quot;</b> sales en posición #{top.position} con {top.impressions} impresiones — estás a un empujón del top.
      </>,
    })
  }

  // === Postura general (para el título de la card) ===
  let posture: Diagnosis['posture']
  let headline: string
  let whatToDo: React.ReactNode

  if (p.clicks >= 5 && p.position <= 5) {
    posture = 'star'
    headline = '⭐ Este artículo está funcionando bien'
    whatToDo = <>
      <b>Qué hacer:</b> mantenelo vivo. Actualizá datos cada 6 meses, agregá ejemplos nuevos, y monitoreá si algún competidor te empieza a pasar. No lo dejes envejecer.
    </>
  } else if (p.clicksDelta > 0 && p.clicks > 0) {
    posture = 'rising'
    headline = '📈 Este artículo está creciendo'
    whatToDo = p.strikingDistance.length > 0 ? <>
      <b>Qué hacer:</b> ya viene subiendo, y todavía hay búsquedas donde no rankea óptimo. Apretá <b>Optimizar con IA</b> para reescribirlo cubriendo las búsquedas striking-distance — puede acelerar el salto al top 5.
    </> : <>
      <b>Qué hacer:</b> ya viene subiendo solo. Mantenelo actualizado y dale tiempo a Google para asentar las posiciones.
    </>
  } else if (p.strikingDistance.length >= 2) {
    posture = 'untapped'
    headline = '🎯 Este artículo tiene oportunidad sin explotar'
    whatToDo = <>
      <b>Qué hacer:</b> aparece para varias búsquedas pero ranquea fuera del top 5 en todas. El botón <b>Optimizar con IA</b> reescribe el artículo para cubrir mejor esas búsquedas específicas. Es la palanca con mejor retorno para esta página.
    </>
  } else if (p.clicksDelta < 0 && p.clicks > 0) {
    posture = 'declining'
    headline = '📉 Este artículo está perdiendo tracción'
    whatToDo = <>
      <b>Qué hacer:</b> revisalo. Probablemente esté desactualizado o un competidor publicó algo mejor. Si tiene búsquedas en striking-distance, <b>Optimizar con IA</b> puede revivirlo; si no, considerá rescribir el artículo desde otro ángulo o consolidarlo con otro post.
    </>
  } else if (p.impressions >= 100 && p.clicks === 0) {
    posture = 'stuck'
    headline = '👀 Este artículo lo ven pero no lo clickean'
    whatToDo = <>
      <b>Qué hacer:</b> tienes visibilidad pero el título o descripción no engancha — o ranqueás demasiado abajo. Si está en posición 5-20, <b>Optimizar con IA</b> ayuda a subirlo. Si está en posición 20+, el problema es más estructural y conviene reescribirlo en serio o crear un artículo nuevo más enfocado.
    </>
  } else {
    posture = 'new'
    headline = '🌱 Este artículo está empezando'
    whatToDo = <>
      <b>Qué hacer:</b> aún tiene poca señal en Google. Dale tiempo (los artículos nuevos suelen tardar semanas en posicionarse) y monitoreá el reporte semanal. Si después de 60 días sigue sin moverse, conviene reescribirlo.
    </>
  }

  return { headline, posture, bullets, whatToDo }
}

const POSTURE_COLORS: Record<Diagnosis['posture'], string> = {
  star: 'border-l-green-600 bg-green-50',
  rising: 'border-l-green-600 bg-green-50',
  untapped: 'border-l-maroon bg-maroon/8',
  stuck: 'border-l-yellow-600 bg-yellow-50',
  declining: 'border-l-red-500 bg-red-50',
  new: 'border-l-blue-500 bg-blue-50',
}

function DiagnosisPanel({ page }: { page: PageDetail }) {
  const d = diagnosePage(page)
  return (
    <div className={`rounded-md border border-maroon/15 border-l-4 ${POSTURE_COLORS[d.posture]} p-3 space-y-2`}>
      <p className="font-semibold text-ink">{d.headline}</p>
      <ul className="space-y-1.5 text-sm text-ink/85">
        {d.bullets.map((b, i) => (
          <li key={i}><b className="text-maroon">{b.label}:</b> {b.text}</li>
        ))}
      </ul>
      <p className="text-sm text-ink/85 pt-1.5 border-t border-maroon/10">{d.whatToDo}</p>
    </div>
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
        Cada fila es una página real de faststrat.ai. <b>Click en una fila</b> para ver qué le está pasando y qué hacer al respecto.
        Comparamos contra el período anterior ({previousLabel}).
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

          <DiagnosisPanel page={page} />

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

type Rec = {
  kind: string
  target: string
  reason: string
  evidence: string
  suggestion: string
  priority: string
  cause?: string
  sourceUrl?: string
}

type Informe = {
  generadoEn: string
  days: number
  report?: string
  recommendations?: Rec[]
  limits?: string[]
  totals?: { clicks: number; sessions: number; conversions: number }
}

/**
 * El análisis semanal, igual que las tandas de ideas: se genera solo cada lunes
 * y se consulta cuando quieras.
 *
 * Antes vivía solo en memoria: recargar la página lo perdía y recuperarlo
 * costaba nueve minutos de agente. Y sin histórico no se puede responder "¿esto
 * mejoró?", que es la única pregunta que importa después de actuar: un informe
 * describe un momento, dos describen una dirección.
 */
type Medida = { texto: string; caracteres: number; enSerp: number; seCorta: boolean }

type TituloEstado = {
  cargando: boolean
  propuesto: string
  error?: string
  datos?: {
    actual?: Medida
    propuesto?: Medida | null
    sufijo?: string
    limiteSerp?: number
    applied?: boolean
    slugIntacto?: boolean
    tituloEnVivo?: string | null
    link?: string
  }
}

function AnalisisSemanal() {
  const [lista, setLista] = useState<{ generadoEn: string; days: number; recomendaciones: number }[]>([])
  const [actual, setActual] = useState<Informe | null>(null)
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // Aplicar un título desde su recomendación.
  //
  // Directo, pero nunca sin ver antes qué cambia: cambiar el título de una
  // página que rankea tarda semanas en reevaluarse y no tiene deshacer. La ruta
  // solo escribe con `apply: true`, así que el primer clic es siempre una
  // consulta.
  const [titulo, setTitulo] = useState<Record<string, TituloEstado>>({})

  async function pedirTitulo(clave: string, path: string, propuesto: string, aplicar = false) {
    setTitulo((t) => ({ ...t, [clave]: { ...(t[clave] ?? { propuesto }), cargando: true, propuesto } }))
    try {
      const r = await fetch('/api/wordpress/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, title: propuesto, ...(aplicar ? { apply: true } : {}) }),
      })
      const d = await r.json()
      setTitulo((t) => ({ ...t, [clave]: { cargando: false, propuesto, datos: d, error: d.error } }))
    } catch (e) {
      setTitulo((t) => ({ ...t, [clave]: { cargando: false, propuesto, error: String(e) } }))
    }
  }

  const cargar = () => {
    setCargando(true)
    fetch('/api/ga4/analyst')
      .then((r) => r.json())
      .then((d) => {
        setLista(d.informes ?? [])
        setActual(d.ultimo ?? null)
      })
      .catch((e) => setAviso(String(e)))
      .finally(() => setCargando(false))
  }

  useEffect(cargar, [])

  async function generar() {
    setGenerando(true)
    setAviso(null)
    try {
      const r = await fetch('/api/ga4/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 28 }),
      })
      const d = await r.json()
      if (d.error) setAviso(d.error)
      else {
        setActual(d)
        cargar()
      }
    } catch (e) {
      setAviso(String(e))
    } finally {
      setGenerando(false)
    }
  }

  const fecha = (iso: string) => iso.slice(0, 10)

  return (
    <section className="rounded-lg border border-maroon/15 bg-white/60 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Sparkles size={15} className="text-maroon" /> Análisis semanal
          </h2>
          <p className="text-[11px] text-sand mt-0.5">
            Se genera solo cada lunes. Cruza Search Console con GA4 y busca en la web por qué pasa lo que pasa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lista.length > 1 && (
            <select
              value={actual?.generadoEn ?? ''}
              onChange={(e) => {
                const el = lista.find((x) => x.generadoEn === e.target.value)
                if (!el) return
                setCargando(true)
                fetch('/api/ga4/analyst')
                  .then((r) => r.json())
                  .then((d) => {
                    // El GET devuelve el último completo; para uno antiguo se
                    // pide su fecha. Mientras solo haya uno completo, se avisa.
                    setActual(d.ultimo?.generadoEn === el.generadoEn ? d.ultimo : null)
                    if (d.ultimo?.generadoEn !== el.generadoEn) {
                      setAviso('Ese informe está guardado pero solo se sirve el más reciente completo.')
                    }
                  })
                  .finally(() => setCargando(false))
              }}
              className="text-xs border border-maroon/20 rounded px-2 py-1 bg-white"
            >
              {lista.map((x) => (
                <option key={x.generadoEn} value={x.generadoEn}>
                  {fecha(x.generadoEn)} · {x.recomendaciones} acciones
                </option>
              ))}
            </select>
          )}
          <button
            onClick={generar}
            disabled={generando}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
          >
            {generando ? <Loader2 size={13} className="animate-spin" /> : <PenLine size={13} />}
            {generando ? 'Analizando… (unos 9 min)' : 'Analizar ahora'}
          </button>
        </div>
      </div>

      {aviso && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">{aviso}</p>
      )}

      {generando && (
        <Progreso
          etiqueta="Analizando Search Console y GA4"
          estimadoSeg={530}
          detalle="Cruza las dos fuentes, calcula canibalización y consultas de IA, y busca en la web qué prometen los que te ganan el clic."
        />
      )}

      {cargando && !generando && <p className="text-sm text-sand">Cargando informes…</p>}

      {!cargando && !actual && !generando && (
        <p className="text-sm text-sand">
          Todavía no hay ningún análisis. El del lunes aparecerá aquí, o púlsalo ahora.
        </p>
      )}

      {actual?.report && (
        <div className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap border-t border-maroon/10 pt-3">
          {actual.report}
        </div>
      )}

      {!!actual?.limits?.length && (
        <ul className="flex flex-col gap-0.5">
          {actual.limits.map((l, i) => (
            <li key={i} className="text-[11px] text-amber-800 leading-relaxed">⚠ {l}</li>
          ))}
        </ul>
      )}

      {!!actual?.recommendations?.length && (
        <div className="flex flex-col gap-2.5 border-t border-maroon/10 pt-3">
          {actual.recommendations.map((r, i) => (
            <div key={i} className="border-t border-maroon/10 pt-2.5 first:border-0 first:pt-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-maroon/10 text-maroon">{r.priority}</span>
                <span className="text-[11px] text-sand">{r.kind}</span>
                <span className="text-sm text-ink font-medium">{r.target}</span>
              </div>
              <p className="text-[11px] text-sand leading-snug mt-0.5">{r.reason}</p>
              {r.cause && (
                <p className="text-[12px] text-ink/90 leading-snug mt-1">
                  <span className="text-sand">Por qué: </span>{r.cause}
                  {r.sourceUrl && (
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-maroon underline decoration-dotted">fuente</a>
                  )}
                </p>
              )}
              <p className="text-[12px] text-ink leading-snug mt-1">
                <span className="text-sand">Qué hacer: </span>{r.suggestion}
              </p>
              <p className="text-[11px] font-mono text-maroon mt-1">{r.evidence}</p>

              {/* Solo los títulos se aplican desde aquí: es la única acción
                  reversible con un clic. No toca el cuerpo, no rompe enlaces y
                  no cambia el slug, cosa que la respuesta confirma. */}
              {r.kind === 'rewrite-title' && r.target.startsWith('/') && (() => {
                const clave = `t${i}`
                const est = titulo[clave]
                const d = est?.datos
                return (
                  <div className="mt-2 border-t border-maroon/10 pt-2">
                    {!est && (
                      <button
                        onClick={() => pedirTitulo(clave, r.target, r.suggestion.slice(0, 120))}
                        className="text-[11px] font-medium px-2.5 py-1 rounded bg-maroon/10 text-maroon hover:bg-maroon/20"
                      >
                        Ver y aplicar título
                      </button>
                    )}

                    {est?.cargando && (
                      <p className="text-[11px] text-sand flex items-center gap-1">
                        <Loader2 size={11} className="animate-spin" /> Leyendo la página…
                      </p>
                    )}

                    {est?.error && <p className="text-[11px] text-red-700">{est.error}</p>}

                    {d && !est?.cargando && !est?.error && (
                      <div className="flex flex-col gap-1.5">
                        {/* Los caracteres son los del RESULTADO DE BÚSQUEDA,
                            con el sufijo que añade el sitio. Contar solo el
                            título decía que 58 estaba bien y salía cortado. */}
                        <div className="text-[11px]">
                          <span className="text-sand">Ahora ({d.actual?.enSerp}): </span>
                          <span className={d.actual?.seCorta ? 'text-red-700' : 'text-ink'}>
                            {d.actual?.texto}{d.sufijo}
                          </span>
                        </div>

                        <textarea
                          value={est.propuesto}
                          onChange={(e) =>
                            setTitulo((t) => ({ ...t, [clave]: { ...est, propuesto: e.target.value, datos: undefined } }))
                          }
                          rows={2}
                          className="w-full text-[12px] border border-maroon/20 rounded px-2 py-1 bg-white/70"
                        />

                        {d.propuesto && (
                          <div className="text-[11px]">
                            <span className="text-sand">Quedaría ({d.propuesto.enSerp}): </span>
                            <span className={d.propuesto.seCorta ? 'text-red-700' : 'text-green-700'}>
                              {d.propuesto.texto}{d.sufijo}
                            </span>
                            {d.propuesto.seCorta && <span className="text-red-700"> · se corta en {d.limiteSerp}</span>}
                          </div>
                        )}

                        {d.applied ? (
                          <p className="text-[11px] text-green-700">
                            Aplicado. En vivo: &ldquo;{d.tituloEnVivo}&rdquo;
                            {d.slugIntacto && ' · el slug no cambió, no hacen falta redirecciones'}
                            {d.link && (
                              <a href={d.link} target="_blank" rel="noopener noreferrer" className="ml-1 underline">ver</a>
                            )}
                          </p>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => pedirTitulo(clave, r.target, est.propuesto)}
                              className="text-[11px] px-2 py-1 rounded border border-maroon/20 text-maroon hover:bg-maroon/8"
                            >
                              Recalcular
                            </button>
                            <button
                              onClick={() => pedirTitulo(clave, r.target, est.propuesto, true)}
                              className="text-[11px] font-medium px-2.5 py-1 rounded bg-maroon text-cream hover:bg-maroon-hover"
                            >
                              Aplicar en el sitio
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
