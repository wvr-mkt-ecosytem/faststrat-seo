'use client'

import { useEffect, useState } from 'react'
import { Send, Check, Loader2, ExternalLink, AlertCircle, Sparkles, Wand2, Languages } from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'
import { Progreso } from '@/components/Progreso'
import { postJson, wake, ApiError } from '@/lib/api'
import { CLIENTE } from "@/lib/cliente";

type Post = {
  slug: string
  title: string
  excerpt: string
  keywords: string[]
  lang: string
  category: string
  status: string
  wordCount: number
  coverUrl: string | null
  wpStatus: string | null
  wpLink: string | null
  /** Por qué esta keyword: qué busca quien la escribe y por qué respondemos mejor. */
  keywordRationale?: string
  /** Hacia dónde va la demanda de la keyword, según Google Trends. */
  keywordTrend?: { direccion: 'sube' | 'baja' | 'estable' | 'sin-volumen'; cambioAnual: number; nivelActual: number }
  /** La versión en el otro idioma, si ya existe. */
  alternate?: { lang: string; slug: string }
  /** Fecha programada de publicación, si tiene. */
  publishAt?: string
}

/**
 * La tendencia de una keyword, en una línea.
 *
 * Los dos números van juntos a propósito. La dirección sola engaña: un tema al
 * 12/100 que sube un 30% es un tema muerto rebotando, y uno al 90 que baja un
 * 10% sigue teniendo diez veces más demanda.
 */
function Tendencia({ t }: { t: NonNullable<Post['keywordTrend']> }) {
  // Sin volumen NO es "estable". Trends devuelve la serie a cero cuando el
  // término es demasiado long-tail para medirlo, y pintar "→ 0% · 0/100" se
  // leía como "la demanda se mantiene", que es lo contrario de lo que pasa.
  if (t.direccion === 'sin-volumen') {
    return (
      <span
        className="text-xs text-neutral-400"
        title="Google Trends no registra volumen para este término. Suele significar que es muy long-tail: poca competencia, pero también poca demanda."
      >
        sin volumen medible
      </span>
    )
  }

  const color =
    t.direccion === 'sube'
      ? 'text-green-700 dark:text-green-400'
      : t.direccion === 'baja'
        ? 'text-red-700 dark:text-red-400'
        : 'text-neutral-500'
  const flecha = t.direccion === 'sube' ? '↑' : t.direccion === 'baja' ? '↓' : '→'
  return (
    <span
      className={`text-xs font-medium ${color}`}
      title="Google Trends: últimos 12 meses frente a los 12 anteriores, sobre 5 años de datos. El segundo número es dónde está hoy respecto a su propio máximo histórico."
    >
      {flecha} {t.cambioAnual > 0 ? '+' : ''}
      {t.cambioAnual}% interanual · {t.nivelActual}/100 de su máximo
    </span>
  )
}

type Finding = { severity: string; rule: string; detail: string; excerpt?: string }

type PublishState = {
  loading: boolean
  result?: {
    ok: boolean
    link?: string
    action?: string
    error?: string
    status?: string
    live?: boolean
    /** Programado para más adelante. NO es un borrador. */
    scheduled?: boolean
    scheduledFor?: string
    /** Lo que impidió publicar. Va aquí y no en un error suelto porque hay que
     *  poder leer QUÉ arreglar, no solo que algo falló. */
    blocking?: Finding[]
    warnings?: Finding[]
    /** Con qué páginas publicadas se pisa. La ruta ya lo devolvía; faltaba leerlo. */
    choques?: { titulo: string; slug?: string; parecido: number; motivo: string; origen: string }[]
    explicacion?: string
  }
}

type EditState = {
  open: boolean
  instruction: string
  loading: boolean
  message?: { ok: boolean; text: string }
}

export default function BlogsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [states, setStates] = useState<Record<string, PublishState>>({})
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const [fixing, setFixing] = useState<string | null>(null)
  const [wpError, setWpError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [publishingAll, setPublishingAll] = useState(false)
  const [traduciendo, setTraduciendo] = useState<string | null>(null)
  const [renombrando, setRenombrando] = useState<Record<string, string>>({})
  const [publishAllProgress, setPublishAllProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => {
    wake()
    fetch('/api/blog')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setPosts(d.posts ?? [])
        // Si WordPress no respondió, el estado de publicación de cada post es
        // desconocido, no "no publicado". Decirlo evita dos cosas: creer que
        // nada está en vivo, y que "Publicar todos" reempuje al sitio en vivo
        // artículos que ya estaban publicados.
        setWpError(d.wpError ?? null)
      })
      .catch((e) => setLoadError(String(e?.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  /** Salta a la tarjeta de la otra versión y la resalta un momento. */
  function irAlSlug(slug: string) {
    const el = document.getElementById(`post-${slug}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-maroon')
    setTimeout(() => el.classList.remove('ring-2', 'ring-maroon'), 1800)
  }

  /**
   * Escribe la versión en el otro idioma.
   *
   * Va en una llamada aparte y no dentro de la generación porque escribir un
   * artículo tarda unos 24 minutos y el límite de la plataforma son 13: pedir
   * los dos de una vez cortaría la petición a media faena y perdería el trabajo
   * ya pagado. Así, si esta falla, el original sigue guardado.
   */
  async function escribirOtroIdioma(post: Post) {
    const otro = post.lang === 'es' ? 'inglés' : 'español'
    if (!confirm(
      `El agente va a mirar la SERP en ${otro} y ADAPTAR el artículo a ese mercado: otros competidores, ` +
      `precios en su moneda y fuentes que le sirvan a ese lector. No es una traducción.

` +
      `Tarda unos 25 minutos. ¿Sigo?`
    )) return

    setTraduciendo(post.slug)
    try {
      const d = await postJson<{ ok?: boolean; slug?: string; title?: string; error?: string; explicacion?: string }>(
        '/api/blog/translate',
        { slug: post.slug, lang: post.lang === 'es' ? 'en' : 'es' },
      )
      if (d.ok) {
        const fresh = await fetch('/api/blog').then((r) => r.json())
        setPosts(fresh.posts ?? [])
        setTimeout(() => d.slug && irAlSlug(d.slug), 300)
      } else {
        alert(d.explicacion ?? d.error ?? 'No se pudo escribir la otra versión.')
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : String(e))
    } finally {
      setTraduciendo(null)
    }
  }

  function toggleEdit(slug: string) {
    setEdits((e) => ({
      ...e,
      [slug]: e[slug]?.open
        ? { ...e[slug], open: false }
        : { open: true, instruction: '', loading: false },
    }))
  }

  function setInstruction(slug: string, instruction: string) {
    setEdits((e) => ({ ...e, [slug]: { ...e[slug], instruction } }))
  }

  async function applyEdit(slug: string) {
    const instruction = edits[slug]?.instruction?.trim()
    if (!instruction) return
    setEdits((e) => ({ ...e, [slug]: { ...e[slug], loading: true, message: undefined } }))
    try {
      const data = await postJson<{ saved?: boolean; markdown?: string; error?: string }>('/api/blog/edit', { slug, instruction })
      if (data.saved) {
        // refresca el conteo de palabras del post
        const words = (data.markdown ?? '').split(/\s+/).filter(Boolean).length
        setPosts((ps) => ps.map((p) => (p.slug === slug ? { ...p, wordCount: words } : p)))
        setEdits((e) => ({
          ...e,
          [slug]: { ...e[slug], loading: false, instruction: '', message: { ok: true, text: 'Cambios aplicados y guardados.' } },
        }))
      } else {
        setEdits((e) => ({
          ...e,
          [slug]: { ...e[slug], loading: false, message: { ok: false, text: data.error ?? 'Error desconocido' } },
        }))
      }
    } catch (err) {
      setEdits((e) => ({
        ...e,
        [slug]: { ...e[slug], loading: false, message: { ok: false, text: err instanceof ApiError ? err.message : String(err) } },
      }))
    }
  }

  // Corrige lo que bloqueó la compuerta y vuelve a comprobar.
  //
  // Lo que se pinta después NO es lo que el agente dice haber hecho: la ruta
  // vuelve a correr la compuerta sobre el texto corregido y devuelve ESE
  // resultado. Por eso aquí se leen los hallazgos que quedan y se dejan a la
  // vista si siguen bloqueando, en vez de borrar el aviso y dar por bueno.
  async function fixPost(slug: string) {
    setFixing(slug)
    try {
      const data = await postJson<{
        changed: boolean
        publishable: boolean
        message?: string
        markdown?: string
        qa?: { despues?: { blocking?: Finding[]; warnings?: Finding[] } }
      }>('/api/blog/fix', { slug })

      const quedan = data.qa?.despues?.blocking ?? []
      setStates((s) => ({
        ...s,
        [slug]: {
          loading: false,
          result: {
            ok: data.publishable,
            error: data.publishable ? undefined : (data.message ?? (data as { error?: string }).error ?? 'No se pudo corregir.'),
            action: data.publishable ? data.message : undefined,
            blocking: quedan.length ? quedan : undefined,
            warnings: data.qa?.despues?.warnings,
          },
        },
      }))

      if (data.changed && data.markdown) {
        const words = data.markdown.split(/\s+/).filter(Boolean).length
        setPosts((ps) => ps.map((p) => (p.slug === slug ? { ...p, wordCount: words } : p)))
      }
    } catch (e) {
      setStates((s) => ({
        ...s,
        [slug]: { loading: false, result: { ok: false, error: e instanceof ApiError ? e.message : String(e) } },
      }))
    } finally {
      setFixing(null)
    }
  }

  /**
   * Renombra un borrador para que deje de pisarse con una página publicada.
   *
   * Es la salida al bloqueo. Un freno sin alternativa se acaba rodeando, y aquí
   * el rodeo sería publicar igual y crear la canibalización que el freno existe
   * para evitar.
   */
  async function renombrar(slug: string) {
    const nuevo = renombrando[slug]?.trim()
    if (!nuevo) return
    try {
      const d = await postJson<{ ok?: boolean; slug?: string; error?: string; explicacion?: string }>(
        '/api/blog/rename', { slug, title: nuevo },
      )
      if (d.ok) {
        const fresh = await fetch('/api/blog').then((r) => r.json())
        setPosts(fresh.posts ?? [])
        setStates((st) => { const n = { ...st }; delete n[slug]; return n })
        setRenombrando((r) => { const n = { ...r }; delete n[slug]; return n })
      } else {
        alert(d.explicacion ?? d.error ?? 'No se pudo renombrar.')
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : String(e))
    }
  }

  /**
   * "Publicar en vivo" tiene que significar en vivo.
   *
   * Con una fecha programada guardada, el botón dejaba el artículo en cola y la
   * pantalla decía "guardado como borrador": se pedía una cosa, pasaba otra, y
   * el mensaje contaba una tercera. Ahora se pregunta antes.
   */
  async function publicarEnVivo(post: Post) {
    const futura = post.publishAt && new Date(post.publishAt).getTime() > Date.now()
    if (!futura) return publish(post.slug, true)

    const cuando = new Date(post.publishAt!).toLocaleString('es', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })
    const ahora = confirm(
      `Este artículo está programado para el ${cuando}.

` +
      `Aceptar = publicarlo AHORA y quitar la programación.
` +
      `Cancelar = dejarlo programado.`
    )
    if (!ahora) return
    return publish(post.slug, true, false, true)
  }

  async function publish(slug: string, live: boolean, force = false, ahora = false) {
    setStates((s) => ({ ...s, [slug]: { loading: true } }))
    try {
      const data = await postJson<{
        results?: PublishState['result'][]
        error?: string
        blocked?: boolean
        message?: string
        findings?: { slug: string; blocking: Finding[]; warnings: Finding[] }[]
      }>('/api/wordpress/publish', { slug, live, draft: !live, force, ahora })

      // La compuerta responde con `blocked` y los hallazgos, no con results.
      const gate = data.blocked ? data.findings?.find((f) => f.slug === slug) : undefined
      const result = gate
        ? {
            ok: false,
            error: data.message ?? 'Bloqueado por la compuerta de calidad',
            blocking: gate.blocking,
            warnings: gate.warnings,
          }
        : (data.results?.[0] ?? { ok: false, error: data.error ?? 'Error desconocido' })
      setStates((s) => ({ ...s, [slug]: { loading: false, result } }))
      // Actualiza el badge de estado al instante (sin necesidad de refresh).
      if (result.ok && result.status) {
        setPosts((ps) => ps.map((p) =>
          p.slug === slug ? { ...p, wpStatus: result.status ?? p.wpStatus, wpLink: result.link ?? p.wpLink } : p
        ))
      }
    } catch (e) {
      setStates((s) => ({
        ...s,
        [slug]: { loading: false, result: { ok: false, error: e instanceof ApiError ? e.message : String(e) } },
      }))
    }
  }

  // Publica TODOS en vivo, uno por uno (robusto: cada uno es una petición corta,
  // con progreso y confirmación real; evita el timeout de una sola request gigante).
  async function publishAll() {
    // Con el estado de WordPress desconocido, "los que faltan" es una lista
    // inventada: serían TODOS, y esto reempujaría al sitio en vivo artículos
    // ya publicados. Mejor no hacer nada que hacer eso.
    if (wpError) return
    const pending = posts.filter((p) => p.wpStatus !== 'publish')
    const targets = pending.length > 0 ? pending : posts // si ya están todos live, re-publica todos
    setPublishingAll(true)
    let done = 0
    for (const p of targets) {
      setPublishAllProgress({ done, total: targets.length })
      await publish(p.slug, true)
      done++
      setPublishAllProgress({ done, total: targets.length })
    }
    setPublishingAll(false)
    setPublishAllProgress(null)
  }

  return (
    <main className="min-h-screen">
      <BrandHeader subtitle={`Blogs · ${posts.length} posts para publicar en WordPress`}>
        <button
          onClick={publishAll}
          disabled={publishingAll || posts.length === 0 || !!wpError}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50 transition-colors"
        >
          {publishingAll ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {publishingAll && publishAllProgress
            ? `Publicando ${publishAllProgress.done}/${publishAllProgress.total}…`
            : 'Publicar todos en vivo'}
        </button>
      </BrandHeader>

      <div className="p-6 space-y-4 max-w-3xl">
        {loading && <p className="text-sm text-neutral-500">Cargando posts…</p>}

        {!loading && loadError && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3">
            No se pudieron cargar los posts: {loadError}
          </div>
        )}

        {wpError && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3">
            {wpError} El estado de publicación que ves abajo es desconocido, no
            &quot;no publicado&quot;: no uses &quot;Publicar todos&quot; hasta que esto se resuelva.
          </div>
        )}

        {posts.map((post) => {
          const state = states[post.slug]
          const edit = edits[post.slug]
          return (
            <div
              key={post.slug}
              // El id permite saltar de una versión de idioma a la otra.
              id={`post-${post.slug}`}
              className="border border-black/10 dark:border-white/10 rounded-lg p-5 transition-shadow scroll-mt-24"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {post.coverUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={post.coverUrl}
                      alt={`Portada: ${post.title}`}
                      className="w-full rounded-md border border-black/10 dark:border-white/10 mb-3"
                    />
                  )}
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-maroon/10 text-maroon">
                      {post.category}
                    </span>
                    <span className="text-xs uppercase text-sand">{post.lang}</span>
                    <span className="text-xs text-sand">· {post.wordCount} palabras</span>
                    {post.wpStatus === 'publish' ? (
                      <a href={post.wpLink ?? '#'} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 hover:bg-green-200">
                        ● En vivo
                      </a>
                    ) : post.wpStatus === 'draft' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        ● Borrador en WP
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600">
                        ○ No publicado
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold">{post.title}</h2>
                  <p className="text-sm text-neutral-500 mt-1">{post.excerpt}</p>
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    {post.keywords.slice(0, 4).map((k) => (
                      <span
                        key={k}
                        className="text-xs px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 text-neutral-500"
                      >
                        {k}
                      </span>
                    ))}
                    {post.keywordTrend && <Tendencia t={post.keywordTrend} />}
                  </div>
                  {post.keywordRationale && (
                    <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                      <b className="text-neutral-600 dark:text-neutral-400">Por qué esta keyword:</b>{' '}
                      {post.keywordRationale}
                    </p>
                  )}
                </div>

                <div className="shrink-0 w-44 text-right space-y-2">
                  <button
                    onClick={() => publicarEnVivo(post)}
                    disabled={state?.loading}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50 transition-colors"
                  >
                    {state?.loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {post.wpStatus === 'publish' ? 'Actualizar (en vivo)' : 'Publicar en vivo'}
                  </button>
                  <button
                    onClick={() => publish(post.slug, false)}
                    disabled={state?.loading}
                    className="w-full flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md border border-maroon/20 text-maroon hover:bg-maroon/8 disabled:opacity-50 transition-colors"
                  >
                    Guardar como borrador
                  </button>

                  {state?.result?.ok && (
                    <div className="mt-2 text-right">
                      {/* Tres estados, no dos. WordPress distingue borrador
                          (nadie lo verá hasta que alguien actúe), programado
                          (sale solo en su fecha) y publicado. Llamar "borrador"
                          a un artículo programado para dentro de dos días
                          decía que se había quedado a medias cuando no. */}
                      {state.result.live ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                          <Check size={12} /> En vivo en {CLIENTE.dominio}
                        </span>
                      ) : state.result.scheduled ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                            <Check size={12} /> Programado
                          </span>
                          <span className="text-[11px] text-neutral-500">
                            {state.result.scheduledFor
                              ? `saldrá solo el ${new Date(state.result.scheduledFor).toLocaleString('es', {
                                  day: 'numeric',
                                  month: 'long',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}`
                              : 'saldrá solo en su fecha'}
                          </span>
                          <button
                            onClick={() => publish(post.slug, true, false, true)}
                            className="text-[11px] text-maroon hover:underline"
                          >
                            Publicar ahora en vez de esperar
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-700">
                          <AlertCircle size={12} /> Guardado como borrador
                        </span>
                      )}
                      <a
                        href={state.result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 justify-end text-xs text-maroon hover:underline mt-0.5"
                      >
                        Ver en el sitio <ExternalLink size={11} />
                      </a>
                    </div>
                  )}
                  {/* La canibalización se explica y se resuelve aquí mismo.
                      Antes decía solo "compite con una página que ya está
                      publicada": ni cuál, ni qué hacer. Un freno sin salida se
                      acaba rodeando, y el rodeo es publicar igual. */}
                  {!!state?.result?.choques?.length && (
                    <div className="mt-2 text-left rounded-md border border-red-200 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900/40 p-3">
                      <p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" />
                        Se pisa con una página que ya está publicada
                      </p>

                      {state.result.choques.map((c, i) => (
                        <div key={i} className="mt-2 text-xs">
                          <p className="font-medium text-ink dark:text-neutral-200">{c.titulo}</p>
                          <p className="text-neutral-500 mt-0.5">
                            {c.parecido}% de parecido · {c.motivo}
                          </p>
                          {c.slug && (
                            <a
                              href={`https://${CLIENTE.dominio}/${c.slug}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-maroon hover:underline mt-1"
                            >
                              Ver la página publicada <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      ))}

                      <p className="text-[11px] text-neutral-500 mt-3 leading-snug">
                        Dos páginas propias con la misma intención se reparten la autoridad en vez de
                        sumarla: ninguna de las dos sube. O le cambias el ángulo a esta, o publicas
                        igual si de verdad responden a búsquedas distintas.
                      </p>

                      <div className="mt-3 flex flex-col gap-2">
                        <input
                          value={renombrando[post.slug] ?? post.title}
                          onChange={(e) => setRenombrando((r) => ({ ...r, [post.slug]: e.target.value }))}
                          placeholder="Título nuevo, con otro ángulo"
                          className="w-full text-xs px-2 py-1.5 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => renombrar(post.slug)}
                            disabled={!renombrando[post.slug]?.trim() || renombrando[post.slug] === post.title}
                            className="flex-1 text-xs font-medium px-3 py-1.5 rounded-md bg-maroon text-white disabled:opacity-40"
                          >
                            Cambiar el título
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(
                                'Vas a publicar dos páginas propias que compiten por la misma búsqueda. ' +
                                'Google reparte la autoridad entre ellas y suele acabar en una redirección 301 ' +
                                'semanas después.\n\n¿Seguro que responden a búsquedas distintas?'
                              )) publish(post.slug, true, true)
                            }}
                            className="text-xs font-medium px-3 py-1.5 rounded-md border border-black/15 dark:border-white/15 text-neutral-600 dark:text-neutral-300"
                          >
                            Publicar igual
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {state?.result && !state.result.ok && !state.result.choques?.length && (
                    <p className="flex items-start gap-1 justify-end text-xs text-red-500 mt-2 text-right">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      {state.result.error}
                      {/* Los hallazgos, no solo el hecho de que falló: sin la
                          frase concreta nadie puede arreglar nada. */}
                      {!!state.result.blocking?.length && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {state.result.blocking.map((f, i) => (
                            <li key={i} className="text-[11px] leading-snug">
                              <span className="font-medium">{f.detail}</span>
                              {f.excerpt && (
                                <span className="block text-[10px] opacity-70 font-mono mt-0.5">
                                  …{f.excerpt}…
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </p>
                  )}

                  {/* El arreglo va justo debajo de lo que bloqueó, no en otra
                      pantalla: los hallazgos ya están delante y la acción que
                      corresponde es esa. Solo aparece cuando hay algo que
                      arreglar. */}
                  {!!state?.result?.blocking?.length && (
                    <button
                      onClick={() => fixPost(post.slug)}
                      disabled={fixing === post.slug}
                      className="w-full flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md bg-maroon/10 text-maroon hover:bg-maroon/20 transition-colors disabled:opacity-50"
                    >
                      <Wand2 size={14} />
                      {fixing === post.slug ? 'Corrigiendo…' : 'Corregir para publicar'}
                    </button>
                  )}

                  {fixing === post.slug && (
                    <div className="px-1">
                      <Progreso
                        etiqueta="Buscando fuentes y corrigiendo"
                        estimadoSeg={200}
                        detalle="Busca en la web la fuente de cada cifra. Si no existe, quita el dato en vez de inventar un enlace."
                      />
                    </div>
                  )}

                  <button
                    onClick={() => toggleEdit(post.slug)}
                    className="w-full flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md text-sand hover:bg-maroon/8 hover:text-maroon transition-colors"
                  >
                    <Sparkles size={14} />
                    Editar con IA
                  </button>

                  {/* La otra versión: ir a ella si existe, o escribirla si no.
                      El mismo sitio para las dos cosas, porque para quien mira
                      es la misma pregunta: "¿y en el otro idioma?" */}
                  {post.alternate ? (
                    <button
                      onClick={() => irAlSlug(post.alternate!.slug)}
                      className="w-full flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md text-maroon hover:bg-maroon/8 transition-colors"
                      title={`Ver la versión en ${post.alternate.lang === 'es' ? 'español' : 'inglés'}`}
                    >
                      <Languages size={14} />
                      Ver en {post.alternate.lang === 'es' ? 'español' : 'inglés'}
                    </button>
                  ) : (
                    <button
                      onClick={() => escribirOtroIdioma(post)}
                      disabled={traduciendo === post.slug}
                      className="w-full flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md text-sand hover:bg-maroon/8 hover:text-maroon transition-colors disabled:opacity-50"
                      title={`El agente vuelve a mirar la SERP en el otro idioma y adapta el artículo: fuentes, precios y ejemplos de ese mercado. No es una traducción. Tarda unos 25 minutos.`}
                    >
                      {traduciendo === post.slug ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                      {traduciendo === post.slug
                        ? 'Adaptando…'
                        : `Escribir en ${post.lang === 'es' ? 'inglés' : 'español'}`}
                    </button>
                  )}
                </div>
              </div>

              {/* Panel de edición con el agente SEO */}
              {edit?.open && (
                <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
                  <label className="text-xs font-medium text-neutral-500 flex items-center gap-1.5 mb-2">
                    <Sparkles size={13} /> Pídele un cambio al agente de SEO
                  </label>
                  <textarea
                    value={edit.instruction}
                    onChange={(e) => setInstruction(post.slug, e.target.value)}
                    placeholder="Ej: hazlo más conversacional, agrega una sección sobre GEO, acorta la intro, traduce la conclusión al español…"
                    rows={3}
                    className="w-full border border-black/10 dark:border-white/10 rounded px-3 py-2 text-sm dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-black/20 resize-y"
                  />
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => applyEdit(post.slug)}
                      disabled={edit.loading || !edit.instruction.trim()}
                      className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50 transition-colors"
                    >
                      {edit.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {edit.loading ? 'Reescribiendo…' : 'Aplicar cambio'}
                    </button>
                    {edit.message && (
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          edit.message.ok ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        {edit.message.ok ? <Check size={12} /> : <AlertCircle size={12} />}
                        {edit.message.text}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-2">
                    El agente reescribe el contenido y lo guarda. Después puedes volver a publicar para
                    actualizar en WordPress.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
