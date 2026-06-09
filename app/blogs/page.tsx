'use client'

import { useEffect, useState } from 'react'
import { Send, Check, Loader2, ExternalLink, AlertCircle, Sparkles } from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'

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
}

type PublishState = {
  loading: boolean
  result?: { ok: boolean; link?: string; action?: string; error?: string; status?: string; live?: boolean }
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
  const [publishingAll, setPublishingAll] = useState(false)

  useEffect(() => {
    fetch('/api/blog')
      .then((r) => r.json())
      .then((d) => setPosts(d.posts ?? []))
      .finally(() => setLoading(false))
  }, [])

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
      const res = await fetch('/api/blog/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, instruction }),
      })
      const data = await res.json()
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
        [slug]: { ...e[slug], loading: false, message: { ok: false, text: String(err) } },
      }))
    }
  }

  async function publish(slug: string, live: boolean) {
    setStates((s) => ({ ...s, [slug]: { loading: true } }))
    try {
      const res = await fetch('/api/wordpress/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, live, draft: !live }),
      })
      const data = await res.json()
      const result = data.results?.[0] ?? { ok: false, error: data.error ?? 'Error desconocido' }
      setStates((s) => ({ ...s, [slug]: { loading: false, result } }))
    } catch (e) {
      setStates((s) => ({
        ...s,
        [slug]: { loading: false, result: { ok: false, error: String(e) } },
      }))
    }
  }

  async function publishAll() {
    setPublishingAll(true)
    setStates(Object.fromEntries(posts.map((p) => [p.slug, { loading: true }])))
    try {
      const res = await fetch('/api/wordpress/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, live: true }),
      })
      const data = await res.json()
      const next: Record<string, PublishState> = {}
      for (const r of data.results ?? []) {
        next[r.slug] = { loading: false, result: r }
      }
      setStates(next)
    } finally {
      setPublishingAll(false)
    }
  }

  return (
    <main className="min-h-screen">
      <BrandHeader subtitle={`Blogs · ${posts.length} posts para publicar en WordPress`}>
        <button
          onClick={publishAll}
          disabled={publishingAll || posts.length === 0}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50 transition-colors"
        >
          {publishingAll ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Publicar todos
        </button>
      </BrandHeader>

      <div className="p-6 space-y-4 max-w-3xl">
        {loading && <p className="text-sm text-neutral-500">Cargando posts…</p>}

        {posts.map((post) => {
          const state = states[post.slug]
          const edit = edits[post.slug]
          return (
            <div
              key={post.slug}
              className="border border-black/10 dark:border-white/10 rounded-lg p-5"
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
                  <div className="flex flex-wrap gap-1 mt-2">
                    {post.keywords.slice(0, 4).map((k) => (
                      <span
                        key={k}
                        className="text-xs px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 text-neutral-500"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 w-44 text-right space-y-2">
                  <button
                    onClick={() => publish(post.slug, true)}
                    disabled={state?.loading}
                    className="w-full flex items-center justify-center gap-2 text-sm font-medium px-3 py-2 rounded-md bg-maroon text-cream hover:bg-maroon-hover disabled:opacity-50 transition-colors"
                  >
                    {state?.loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Publicar en vivo
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
                      {state.result.live ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                          <Check size={12} /> En vivo en faststrat.ai
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
                  {state?.result && !state.result.ok && (
                    <p className="flex items-start gap-1 justify-end text-xs text-red-500 mt-2 text-right">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      {state.result.error}
                    </p>
                  )}

                  <button
                    onClick={() => toggleEdit(post.slug)}
                    className="w-full flex items-center justify-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md text-sand hover:bg-maroon/8 hover:text-maroon transition-colors"
                  >
                    <Sparkles size={14} />
                    Editar con IA
                  </button>
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
