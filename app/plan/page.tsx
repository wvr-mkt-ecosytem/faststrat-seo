'use client'

import { useEffect, useState } from 'react'
import {
  CalendarDays, Loader2, PenLine, Check, AlertCircle, Sparkles, X,
} from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'
import { postJson, ApiError } from '@/lib/api'

type Piece = {
  date: string
  slug: string
  title: string
  keyword: string
  lang: string
  priority: string
  batch: string
  written?: boolean
}

type Plan = {
  cadence: { weekdays: number[]; perWeek: number }
  updatedAt: string
  pieces: Piece[]
}

type Proposal = {
  ok?: boolean
  dryRun?: boolean
  planned?: Piece[]
  skipped?: { title: string; reason: string }[]
  available?: number
  exhausted?: boolean
  added?: number
  note?: string
  error?: string
}

const PRIORITY: Record<string, string> = {
  alta: 'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  baja: 'bg-neutral-100 text-neutral-600',
}

const DAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const dayName = (iso: string) => DAY[new Date(iso + 'T00:00:00Z').getUTCDay()]

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'border-maroon/30 bg-maroon/5' : 'border-line bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wide text-sand">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-maroon' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

export default function PlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState(6)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [writing, setWriting] = useState<Record<string, { loading: boolean; ok?: boolean; error?: string }>>({})

  const load = () => {
    setLoading(true)
    fetch('/api/plan')
      .then((r) => r.json())
      .then((j: Plan & { error?: string; connected?: boolean }) => {
        // Se comprueba la forma antes de aceptarla. Si /api/plan devuelve el
        // objeto de error (sin `cadence`), el render hacía plan.cadence.perWeek
        // y la pantalla se quedaba en blanco sin decir por qué.
        if (j.error || j.connected === false || !j.cadence || !j.pieces) {
          setError(j.error ?? 'El plan llegó incompleto.')
          return
        }
        setPlan(j)
      })
      .catch(() => setError('No se pudo cargar el plan.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function propose(dryRun: boolean) {
    setBusy(true)
    setError('')
    try {
      const j = await postJson<Proposal>('/api/plan', { weeks, dryRun })
      if (j.error) setError(j.error)
      else if (dryRun) setProposal(j)
      else {
        setProposal(null)
        load()
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Escribe la pieza con el agente, usando la keyword que la idea traía. */
  async function write(p: Piece) {
    setWriting((w) => ({ ...w, [p.slug]: { loading: true } }))
    try {
      await postJson('/api/blog/generate', { keyword: p.keyword, title: p.title, lang: p.lang })
      setWriting((w) => ({ ...w, [p.slug]: { loading: false, ok: true } }))
      load() // el estado "escrito" se relee de content/blog, no se asume
    } catch (e) {
      setWriting((w) => ({
        ...w,
        [p.slug]: { loading: false, error: e instanceof ApiError ? e.message : String(e) },
      }))
    }
  }

  if (loading && !plan) {
    return (
      <>
        <BrandHeader />
        <main className="p-6 flex items-center gap-2 text-sand text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando el plan…
        </main>
      </>
    )
  }

  const pieces = plan?.pieces ?? []
  const written = pieces.filter((p) => p.written).length
  const pending = pieces.length - written

  // Agrupar por semana para que se lea como un calendario y no como una lista.
  const weeksMap = new Map<string, Piece[]>()
  for (const p of pieces) {
    const d = new Date(p.date + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // lunes
    const k = d.toISOString().slice(0, 10)
    if (!weeksMap.has(k)) weeksMap.set(k, [])
    weeksMap.get(k)!.push(p)
  }

  return (
    <>
      <BrandHeader subtitle={plan?.updatedAt ? `Actualizado el ${plan.updatedAt}` : undefined} />

      <main className="p-6 flex flex-col gap-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
            <CalendarDays size={22} className="text-maroon" /> Plan editorial
          </h1>
          <p className="text-sm text-sand mt-1 max-w-3xl leading-relaxed">
            Reparte en fechas las ideas que ya existen. No genera ideas nuevas: eso lo hace la
            investigación semanal. Lo que faltaba era decidir cuándo va cada una.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Programadas" value={pieces.length} />
          <Stat label="Pendientes de escribir" value={pending} accent />
          <Stat label="Ya escritas" value={written} />
          <Stat
            label="Cadencia"
            value={plan ? `${plan.cadence.perWeek}/semana` : '—'}
          />
        </div>

        {/* La cadencia va declarada, no deducida: sin historial de publicación
            deducirla sería inventarla. Se dice para que se pueda discutir. */}
        {plan && (
          <p className="text-[11px] text-sand -mt-3">
            Publicando los {plan.cadence.weekdays.map((d) => DAY[d]).join(' y ')}. Se declara en{' '}
            <code className="font-mono">data/plan.json</code>, no se deduce.
          </p>
        )}

        <section className="rounded-lg border border-line bg-white p-5 flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Sparkles size={15} className="text-maroon" /> Programar ideas pendientes
          </h2>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            <label className="text-sand">
              Semanas:{' '}
              <input
                type="number"
                min={1}
                max={26}
                value={weeks}
                onChange={(e) => {
                  setWeeks(Number(e.target.value))
                  setProposal(null)
                }}
                className="w-16 border border-line rounded-md px-2 py-1 tabular-nums bg-white"
              />
            </label>
            <button
              onClick={() => propose(true)}
              disabled={busy}
              className="px-3 py-1.5 rounded-md bg-maroon text-cream text-sm font-medium hover:bg-maroon-hover disabled:opacity-50 flex items-center gap-1.5"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Ver qué se programaría
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-700 flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          {proposal && (
            <div className="border-t border-line pt-3 flex flex-col gap-2">
              <p className="text-sm text-ink">
                <strong>{proposal.planned?.length ?? 0}</strong> piezas se programarían ·{' '}
                {proposal.available} ideas disponibles
              </p>

              {/* Que las ideas se agoten es un resultado, no un hueco que se
                  rellene con temas inventados. */}
              {proposal.exhausted && (
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Las ideas se acaban antes que las semanas pedidas. El resto no se rellena con temas
                  inventados: corre la investigación semanal en Ideas para tener más.
                </p>
              )}

              <ul className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                {(proposal.planned ?? []).map((p) => (
                  <li key={p.date + p.slug} className="text-[11px] text-sand">
                    <span className="font-mono tabular-nums">{p.date}</span>{' '}
                    <span className={`px-1 rounded ${PRIORITY[p.priority] ?? ''}`}>{p.priority}</span>{' '}
                    <span className="text-ink">{p.title}</span>
                  </li>
                ))}
              </ul>

              {!!proposal.skipped?.length && (
                <details className="text-[11px] text-sand">
                  <summary className="cursor-pointer hover:text-ink">
                    {proposal.skipped.length} saltadas, y por qué
                  </summary>
                  <ul className="mt-1 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
                    {proposal.skipped.map((s, i) => (
                      <li key={i}>
                        {s.title.slice(0, 64)} — <span className="italic">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {!!proposal.planned?.length && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => propose(false)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-md bg-maroon text-cream text-sm font-medium hover:bg-maroon-hover disabled:opacity-50"
                  >
                    Añadir al plan ({proposal.planned.length})
                  </button>
                  <button
                    onClick={() => setProposal(null)}
                    className="text-xs text-sand hover:text-ink flex items-center gap-1"
                  >
                    <X size={12} /> Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {pieces.length === 0 ? (
          <p className="text-sm text-sand">
            El plan está vacío. Programa las ideas pendientes con el botón de arriba.
          </p>
        ) : (
          [...weeksMap.entries()].map(([monday, list]) => (
            <section key={monday} className="rounded-lg border border-line bg-white p-5">
              <h2 className="text-sm font-bold text-ink mb-3">
                Semana del {monday}{' '}
                <span className="font-normal text-sand">({list.length})</span>
              </h2>
              <div className="flex flex-col gap-2.5">
                {list.map((p) => {
                  const w = writing[p.slug]
                  return (
                    <div key={p.slug + p.date} className="border-t border-line pt-2.5 first:border-0 first:pt-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[11px] font-mono tabular-nums text-sand">
                          {p.date} · {dayName(p.date)}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY[p.priority] ?? ''}`}>
                          {p.priority}
                        </span>
                        {p.written && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-1">
                            <Check size={10} /> escrito
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink leading-snug mt-0.5">{p.title}</p>
                      <p className="text-[11px] text-sand">keyword: {p.keyword}</p>

                      {!p.written && (
                        <button
                          onClick={() => write(p)}
                          disabled={w?.loading}
                          className="mt-1.5 px-2.5 py-1 rounded-md border border-line text-xs font-medium text-ink hover:border-maroon/40 hover:text-maroon disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {w?.loading ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Escribiendo…
                            </>
                          ) : w?.ok ? (
                            <>
                              <Check size={12} /> Escrito
                            </>
                          ) : (
                            <>
                              <PenLine size={12} /> Escribir con el agente
                            </>
                          )}
                        </button>
                      )}
                      {w?.error && (
                        <p className="text-[11px] text-red-700 mt-0.5 flex items-center gap-1">
                          <AlertCircle size={11} /> {w.error}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </>
  )
}
