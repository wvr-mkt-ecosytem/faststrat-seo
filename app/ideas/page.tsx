'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Users, Calendar, Loader2, PenLine, Lightbulb,
  Check, AlertCircle, ExternalLink, RefreshCw, Plus,
} from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'
import { Progreso } from '@/components/Progreso'
import { useTareas } from '@/components/Tareas'
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

type MemoriaResp = {
  totales: { propuestas: number; titulosUnicos: number; escritos: number; keywords: number; tandas: number }
  propuestas: { title: string; keyword: string; weekOf: string; source: string; escrita: boolean }[]
  repetidas: { titulo: string; veces: number }[]
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
  const { lanzar } = useTareas()
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(0)

  // Oportunidades de Search Console
  const [untapped, setUntapped] = useState<Q[]>([])
  const [oppLoading, setOppLoading] = useState(true)
  const [oppError, setOppError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [results, setResults] = useState<ResultMap>({})

  // La memoria de ideas, visible.
  //
  // Vivía solo dentro del prompt: el sistema sabía qué se había propuesto ya y
  // quien lo usaba no. Sin verla no se puede contestar la única pregunta que
  // importa cuando salen repetidas: ¿el agente repitió, o el tema de verdad
  // sigue sin cubrirse?
  const [memoria, setMemoria] = useState<MemoriaResp | null>(null)
  const [memoriaAbierta, setMemoriaAbierta] = useState(false)

  useEffect(() => {
    if (!memoriaAbierta || memoria) return
    fetch('/api/ideas/memory')
      .then((r) => r.json())
      .then((d) => setMemoria(d.error ? null : d))
      .catch(() => setMemoria(null))
  }, [memoriaAbierta, memoria])

  useEffect(() => {
    wake() // despierta el free tier de Render para que las acciones no fallen
    fetch('/api/ideas')
      .then((r) => r.json())
      .then((d) => {
        // Sin esto, un fallo dejaba la lista vacía y la pantalla decía "aún no
        // hay tandas de ideas", indistinguible de un sistema recién estrenado.
        if (d.error || d.connected === false) throw new Error(d.error ?? 'Sin acceso')
        setBatches(d.batches ?? [])
      })
      .catch((e) => setLoadError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  // Carga queries sin explotar + páginas para filtrar las que ya están cubiertas.
  //
  // Vive en una función y no dentro del useEffect para poder repetirla desde el
  // botón: antes solo corría al abrir la página, así que la única forma de ver
  // datos frescos de Search Console era recargar el navegador.
  const cargarOportunidades = () => {
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
        // Si Search Console no respondió, `untapped` se quedaba en [] y la
        // pantalla imprimía "toda la demanda ya está siendo capturada por
        // algún artículo": una afirmación de negocio construida sobre una
        // petición fallida. Ahora se dice que no se pudo leer.
        if (q.error || q.connected === false) throw new Error(q.error ?? 'Sin acceso a Search Console')
        if (p.error || p.connected === false) throw new Error(p.error ?? 'Sin acceso a Search Console')
        const fresh = (q.untapped ?? []).filter((qq: Q) => !owned.has(qq.query.toLowerCase()))
        setUntapped(fresh)
        setOppError(null)
      })
      .catch((e) => setOppError(String(e?.message ?? e)))
      .finally(() => setOppLoading(false))
  }

  useEffect(cargarOportunidades, [])

  const [refreshing, setRefreshing] = useState(false)

  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [moreLoading, setMoreLoading] = useState(false)

  // Agrega MÁS artículos sugeridos a la tanda, alimentado por clicks, striking-distance
  // y research de competidores/industria. No reemplaza la tanda, suma.
  async function generateMore() {
    setMoreLoading(true)
    setRefreshMsg(null)
    try {
      const d = await postJson<{ ok?: boolean; added?: number; error?: string }>('/api/ideas/more', {})
      if (d.ok) {
        const fresh = await fetch('/api/ideas').then((r) => r.json())
        setBatches(fresh.batches ?? [])
        setSelected(0)
        setRefreshMsg(`✓ ${d.added} artículos nuevos agregados a la tanda`)
      } else {
        setRefreshMsg('Error: ' + (d.error ?? 'desconocido'))
      }
    } catch (e) {
      setRefreshMsg(e instanceof ApiError ? e.message : 'Error: ' + String(e))
    } finally {
      setMoreLoading(false)
    }
  }

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
  // La escritura se delega al gestor de tareas, que vive en el layout raíz.
  //
  // Así sobrevive a cambiar de pestaña: puedes lanzar un artículo, irte a
  // Reportes a leer el análisis, y volver. Antes el estado moría con la página
  // y una corrida de 15,7 minutos se quedaba huérfana, terminando en el
  // servidor sin que nadie se enterara.
  async function generate(key: string, payload: { keyword?: string; topic?: string; title?: string; lang?: string; category?: string }) {
    setResults((s) => ({ ...s, [key]: { kind: 'gen', loading: true } }))
    await lanzar(
      {
        etiqueta: `Escribiendo: ${(payload.title ?? payload.keyword ?? '').slice(0, 40)}`,
        estimadoSeg: 900,
        detalle: 'Tres pasos: elegir el título, escribir y corregirse. Puedes cambiar de pestaña.',
        enlace: '/blogs',
      },
      async () => {
        try {
          const d = await postJson<{ ok?: boolean; error?: string; title?: string; slug?: string; preview?: string; wordCount?: number }>('/api/blog/generate', payload)
          setResults((s) => ({ ...s, [key]: d.ok
            ? { kind: 'gen', loading: false, ok: true, gen: { title: d.title!, slug: d.slug!, preview: d.preview!, wordCount: d.wordCount! } }
            : { kind: 'gen', loading: false, ok: false, error: d.error } }))
          return d.ok
            ? { ok: true, resultado: `${d.wordCount} palabras. Está en Blogs como borrador.`, enlace: '/blogs' }
            : { ok: false, resultado: d.error ?? 'Error desconocido' }
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : String(e)
          setResults((s) => ({ ...s, [key]: { kind: 'gen', loading: false, ok: false, error: msg } }))
          return { ok: false, resultado: msg }
        }
      },
    )
  }



  const generateArticle = (q: Q) => generate(q.query, { keyword: q.query })

  // Escribe TODOS los artículos de la tanda, de dos en dos.
  const [writingAll, setWritingAll] = useState(false)
  const [writeAllProgress, setWriteAllProgress] = useState<{ done: number; total: number } | null>(null)

  async function writeAllBlogs() {
    if (!batch) return
    const pending = batch.ideas.filter((i) => !results[i.slug]?.ok)
    if (pending.length === 0) { alert('Ya escribiste todos los artículos de esta tanda.'); return }
    if (!confirm(`El agente va a escribir ${pending.length} artículos, uno por uno. Toma varios minutos — no cierres la página. Aparecerán en Blogs como borradores. ¿Continuar?`)) return
    setWritingAll(true)
    setWriteAllResumen(null)
    let done = 0
    // Dos a la vez, no de una en una.
    //
    // Escribir un artículo tarda entre dos y seis minutos y casi todo ese
    // tiempo es espera, no cálculo nuestro: doce artículos en serie son más de
    // una hora delante de una pantalla. De dos en dos se reduce a la mitad.
    //
    // Dos y no diez: cada uno es una llamada al agente con búsqueda web, y
    // lanzarlas todas de golpe agota el límite de sesión antes y hace que
    // fallen en bloque en vez de que fallen las últimas. Con dos, si el límite
    // llega, lo que ya se escribió está guardado.
    //
    // Ojo con lo que esto NO arregla: el límite de sesión es el mismo, así que
    // el paralelismo acorta el reloj, no aumenta cuántos artículos caben.
    const EN_PARALELO = 2
    const cola = [...pending]
    const trabajador = async () => {
      for (;;) {
        const idea = cola.shift()
        if (!idea) return
        await generate(idea.slug, { keyword: idea.primaryKeyword, title: idea.title, lang: idea.lang })
        done++
        setWriteAllProgress({ done, total: pending.length })
      }
    }
    setWriteAllProgress({ done, total: pending.length })
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajador))
    setWritingAll(false)
    // El recuento real, no un "hecho" incondicional.
    //
    // Antes esto era `setWriteAllDone(true)` a secas, así que el banner verde
    // "✓ Artículos escritos. Ya están en Blogs" salía igual aunque hubieran
    // fallado los N. Se cuenta cuántos quedaron con ok y se dice el número.
    setWriteAllResumen({
      ok: pending.filter((i) => results[i.slug]?.ok).length,
      total: pending.length,
    })
  }
  const [writeAllResumen, setWriteAllResumen] = useState<{ ok: number; total: number } | null>(null)

  // Genera un blog a partir de un insight (texto largo de competidor/tendencia).
  // Pasa el insight como `topic`: el agente elige el título y keyword y escribe.

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
          onClick={generateMore}
          disabled={moreLoading}
          title="Suma más artículos a la tanda: basados en lo que más clicks da, striking-distance y research de competidores/industria"
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50"
        >
          {moreLoading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {moreLoading ? 'Investigando…' : 'Generar más artículos'}
        </button>
        <button
          onClick={refreshResearch}
          disabled={refreshing}
          title="Regenera la tanda completa desde cero (research + ideas nuevas)"
          className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border border-maroon/25 text-maroon hover:bg-maroon/8 disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {refreshing ? 'Buscando…' : 'Tanda nueva'}
        </button>
      </BrandHeader>

      <div className="p-6 max-w-4xl space-y-8">
        {(moreLoading || refreshing) && (
          <div className="rounded-md border border-maroon/15 bg-white/60 px-4 py-3">
            <Progreso
              etiqueta={moreLoading ? 'Buscando ideas nuevas' : 'Regenerando la investigación de la semana'}
              estimadoSeg={moreLoading ? 180 : 240}
              detalle="El agente busca en la web y compara con todo lo que ya se propuso alguna vez."
            />
          </div>
        )}

        {refreshMsg && (
          <p className={`text-sm ${refreshMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{refreshMsg}</p>
        )}
        {writeAllResumen && (
          <div
            className={`rounded-md border px-4 py-3 text-sm flex items-center justify-between gap-3 ${
              writeAllResumen.ok === writeAllResumen.total
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <span>
              {writeAllResumen.ok === writeAllResumen.total
                ? `✓ ${writeAllResumen.ok} artículos escritos. Ya están en Blogs como borradores.`
                : `${writeAllResumen.ok} de ${writeAllResumen.total} escritos. Los que fallaron tienen el motivo en su fila.`}
            </span>
            {writeAllResumen.ok > 0 && (
              <Link href="/blogs" className="font-semibold underline shrink-0">Ir a Blogs y publicar →</Link>
            )}
          </div>
        )}
        {/* === Tanda semanal curada === */}
        {loading && <p className="text-sm text-sand">Cargando ideas…</p>}

        {/* "No se pudo cargar" y "no hay nada" llevan a decisiones opuestas:
            una se arregla mirando las credenciales y la otra generando ideas.
            Antes las dos pintaban el mismo mensaje de sistema vacío. */}
        {!loading && loadError && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3">
            No se pudieron cargar las ideas: {loadError}
          </div>
        )}

        {!loading && !loadError && !batch && (
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

            {/* El bloque de Competidores y Tendencias vivía aquí y se ha
                quitado: la pestaña Competencia ya cubre qué publican, y con
                datos rastreados de sus sitemaps en vez de con el recuerdo del
                modelo. Tener las dos cosas obligaba a leer dos versiones de lo
                mismo y a decidir cuál creer. Esta pantalla se queda con lo que
                sí es suyo: qué escribir. */}

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

        {/* La memoria: qué se ha propuesto ya y qué llegó a escribirse.
            Plegada por defecto porque no es lo que se viene a hacer aquí, pero
            a un clic porque es lo que contesta "¿por qué salen las mismas?" */}
        <section className="pt-4 border-t border-maroon/15">
          <button
            onClick={() => setMemoriaAbierta((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-ink hover:text-maroon transition-colors"
          >
            <Lightbulb size={15} className="text-maroon" />
            Memoria de ideas
            <span className="text-xs font-normal text-sand">
              {memoriaAbierta ? 'ocultar' : 'todo lo que ya se propuso alguna vez'}
            </span>
          </button>

          {memoriaAbierta && !memoria && <p className="text-sm text-sand mt-2">Cargando memoria…</p>}

          {memoriaAbierta && memoria && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-4 flex-wrap text-xs text-sand">
                <span><b className="text-ink">{memoria.totales.titulosUnicos}</b> títulos únicos</span>
                <span><b className="text-ink">{memoria.totales.escritos}</b> escritos</span>
                <span><b className="text-ink">{memoria.totales.keywords}</b> keywords</span>
                <span><b className="text-ink">{memoria.totales.tandas}</b> tandas</span>
              </div>

              {/* Lo que hay que vigilar: propuesto más de una vez y nunca
                  escrito es una idea que nadie quiso, no una que falte. */}
              {!!memoria.repetidas.length && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-xs font-medium text-amber-900 mb-1">
                    Propuestas más de una vez ({memoria.repetidas.length})
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {memoria.repetidas.slice(0, 8).map((r) => (
                      <li key={r.titulo} className="text-[11px] text-amber-800">
                        {r.veces}× · {r.titulo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-md border border-maroon/15">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-maroon/5 text-maroon">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-semibold">Título</th>
                      <th className="text-left px-2 py-1.5 font-semibold">Keyword</th>
                      <th className="text-left px-2 py-1.5 font-semibold">Tanda</th>
                      <th className="text-left px-2 py-1.5 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memoria.propuestas.map((p, i) => (
                      <tr key={i} className="border-t border-maroon/8">
                        <td className="px-2 py-1 text-ink">{p.title}</td>
                        <td className="px-2 py-1 text-sand">{p.keyword || '—'}</td>
                        <td className="px-2 py-1 text-sand font-mono">{p.weekOf}</td>
                        <td className="px-2 py-1">
                          {p.escrita
                            ? <span className="text-green-700">escrita</span>
                            : <span className="text-sand">solo propuesta</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* === Oportunidades del Search Console === */}
        <section className="space-y-3 pt-4 border-t border-maroon/15">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-ink text-lg flex items-center gap-2">
              <span>🌱</span> Oportunidades de queries (Search Console · 90 días)
            </h2>
            {/* Search Console se actualiza a diario y esto solo se leía al
                abrir la página: para ver algo nuevo había que recargar el
                navegador, cosa que nadie adivina. */}
            <button
              onClick={cargarOportunidades}
              disabled={oppLoading}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-maroon/10 text-maroon hover:bg-maroon/20 disabled:opacity-50 transition-colors"
            >
              {oppLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {oppLoading ? 'Leyendo…' : 'Volver a leer'}
            </button>
          </div>
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
            oppError ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                No se pudieron leer las oportunidades: {oppError}. Esto NO significa que no las haya.
              </p>
            ) : (
              <p className="text-sm text-sand italic">No hay queries nuevas en este período — toda la demanda ya está siendo capturada por algún artículo.</p>
            )
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


function ResultPanel({ result: r }: { result: ResultMap[string] }) {
  if (r.loading) {
    // Los tiempos salen de corridas medidas, no de un número redondo.
    return r.kind === 'gen' ? (
      <Progreso
        etiqueta="Escribiendo el artículo"
        estimadoSeg={480}
        detalle="Son tres pasos encadenados: elegir el título, escribir, y corregirse si la compuerta lo bloquea."
      />
    ) : (
      <Progreso etiqueta="Armando la idea" estimadoSeg={30} detalle="Busca en la web y propone título y guion." />
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
