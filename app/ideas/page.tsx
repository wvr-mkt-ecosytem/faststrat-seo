'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Lightbulb, TrendingUp, Users, Calendar } from 'lucide-react'

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

const PRIORITY_STYLES: Record<string, string> = {
  alta: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  media: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  baja: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

export default function IdeasPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    fetch('/api/ideas')
      .then((r) => r.json())
      .then((d) => setBatches(d.batches ?? []))
      .finally(() => setLoading(false))
  }, [])

  const batch = batches[selected]

  return (
    <main className="min-h-screen">
      <header className="border-b border-black/10 px-6 py-4 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
            aria-label="Volver al dashboard"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Lightbulb size={18} /> Ideas de Contenido
            </h1>
            <p className="text-sm text-neutral-500">
              {batch
                ? `Semana del ${batch.weekOf} · ${batch.ideas.length} artículos sugeridos`
                : 'Investigación semanal de temas'}
            </p>
          </div>
        </div>
        {batches.length > 1 && (
          <select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            className="text-sm border border-black/10 dark:border-white/10 rounded px-2 py-1 dark:bg-neutral-900"
          >
            {batches.map((b, i) => (
              <option key={b.weekOf} value={i}>
                Semana del {b.weekOf}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="p-6 max-w-4xl space-y-6">
        {loading && <p className="text-sm text-neutral-500">Cargando ideas…</p>}

        {!loading && !batch && (
          <div className="text-sm text-neutral-500 border border-dashed border-black/10 dark:border-white/10 rounded-lg p-8 text-center">
            Aún no hay tandas de ideas. La investigación semanal aparecerá aquí.
          </div>
        )}

        {batch && (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{batch.summary}</p>

            {/* Research */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-black/10 dark:border-white/10 rounded-lg p-4">
                <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <Users size={15} /> Competidores
                </h2>
                <ul className="space-y-1.5">
                  {batch.research.competitors.map((c, i) => (
                    <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      • {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-black/10 dark:border-white/10 rounded-lg p-4">
                <h2 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <TrendingUp size={15} /> Tendencias
                </h2>
                <ul className="space-y-1.5">
                  {batch.research.trends.map((t, i) => (
                    <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      • {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Ideas */}
            <div className="space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Calendar size={15} /> Artículos sugeridos
              </h2>
              {batch.ideas.map((idea, i) => (
                <div
                  key={idea.slug}
                  className="border border-black/10 dark:border-white/10 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-neutral-400 font-mono">#{i + 1}</span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${PRIORITY_STYLES[idea.priority]}`}
                        >
                          {idea.priority}
                        </span>
                        <span className="text-xs uppercase text-neutral-400">{idea.lang}</span>
                      </div>
                      <h3 className="font-semibold">{idea.title}</h3>
                      <p className="text-xs text-neutral-500 mt-1">
                        <span className="font-medium">Keyword:</span> {idea.primaryKeyword} ·{' '}
                        <span className="font-medium">Intención:</span> {idea.intent}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                        <span className="font-medium">Por qué:</span> {idea.rationale}
                      </p>
                      <details className="mt-2">
                        <summary className="text-xs text-neutral-500 cursor-pointer hover:text-black dark:hover:text-white">
                          Ver outline
                        </summary>
                        <ol className="list-decimal list-inside mt-1.5 space-y-0.5">
                          {idea.outline.map((o, j) => (
                            <li key={j} className="text-xs text-neutral-600 dark:text-neutral-400">
                              {o}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
