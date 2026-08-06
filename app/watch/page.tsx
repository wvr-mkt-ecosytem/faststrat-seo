'use client'

import { useEffect, useState } from 'react'
import {
  Eye, Loader2, AlertCircle, ExternalLink, Newspaper, Search, Package, Lightbulb,
} from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'

type Row = {
  name: string
  kind: string
  tier: string
  error: string | null
  note: string | null
  total: number
  newCount: number | null
  newPages: { url: string; lastmod: string }[]
}

type Topic = {
  phrase: string
  sources: string[]
  kinds: string[]
  hits: number
  examples: { source: string; url: string }[]
}

type Resp = {
  available: string[]
  empty?: boolean
  reason?: string
  error?: string
  date?: string
  comparedWith?: string | null
  isBaseline?: boolean
  rows?: Row[]
  blocked?: { name: string; error: string }[]
  totalNew?: number
  topics?: Topic[]
  undatedWithoutDiff?: string[]
}

const GROUPS = [
  { kind: 'producto', label: 'Competidores de producto', hint: 'Compiten por el mismo cliente. Interesa qué mensaje eligen.', Icon: Package },
  { kind: 'busqueda', label: 'Competidores de búsqueda', hint: 'Compiten por el mismo tráfico. Interesa qué tema cubrieron.', Icon: Search },
  { kind: 'medio', label: 'Medios', hint: 'Publican sobre el sector. Interesa qué aceptan publicar.', Icon: Newspaper },
]

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'border-maroon/30 bg-maroon/5' : 'border-line bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wide text-sand">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-maroon' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

export default function WatchPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/watch${date ? `?date=${date}` : ''}`)
      .then((r) => r.json())
      .then((j: Resp) => setData(j))
      .catch(() => setData({ available: [], error: 'No se pudo cargar la vigilancia.' }))
      .finally(() => setLoading(false))
  }, [date])

  if (loading && !data) {
    return (
      <>
        <BrandHeader />
        <main className="p-6 flex items-center gap-2 text-sand text-sm">
          <Loader2 size={16} className="animate-spin" /> Cargando la vigilancia…
        </main>
      </>
    )
  }

  if (!data || data.empty || data.error) {
    return (
      <>
        <BrandHeader />
        <main className="p-6">
          <div className="rounded-lg border border-line bg-white p-5 max-w-2xl">
            <h1 className="text-lg font-bold text-ink mb-1">Vigilancia de competidores y medios</h1>
            <p className="text-sm text-sand leading-relaxed">{data?.reason || data?.error}</p>
          </div>
        </main>
      </>
    )
  }

  const rows = data.rows || []

  return (
    <>
      <BrandHeader subtitle={`Instantánea del ${data.date}${data.comparedWith ? ` · comparada con la del ${data.comparedWith}` : ''}`}>
        {(data.available || []).length > 1 && (
          <select
            value={data.date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs border border-line rounded-md px-2 py-1 bg-white text-ink"
          >
            {data.available.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </BrandHeader>

      <main className="p-6 flex flex-col gap-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
            <Eye size={22} className="text-maroon" /> Qué publican competidores y medios
          </h1>
          <p className="text-sm text-sand mt-1 max-w-3xl leading-relaxed">
            Leído de sus sitemaps y, cuando no tienen, de su RSS. Lo que importa no es la foto de hoy:
            es qué apareció desde la semana pasada.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Fuentes" value={rows.length} />
          <Stat label="Piezas nuevas" value={data.isBaseline ? '—' : (data.totalNew ?? 0)} accent />
          <Stat label="URLs registradas" value={rows.reduce((s, r) => s + r.total, 0).toLocaleString()} />
          <Stat label="Sin poder leer" value={(data.blocked || []).length} />
        </div>

        {/* La primera instantánea no tiene con qué compararse, y decirlo evita
            que un cero se lea como "no publicaron nada". */}
        {data.isBaseline && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
            Esta es la instantánea más antigua que hay, así que no tiene con qué compararse. Lo que ves
            son los totales registrados, no publicaciones nuevas. El diff aparece con la segunda corrida.
          </div>
        )}

        {!!(data.undatedWithoutDiff || []).length && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
            Estas fuentes no publican fecha en su sitemap y solo hay una instantánea, así que entró su
            archivo entero como candidato, no solo lo reciente: {data.undatedWithoutDiff!.join(', ')}.
            Se corrige con la segunda corrida semanal.
          </div>
        )}

        {/* Los temas del sector. Van arriba porque son lo accionable: el resto
            es el detalle que los respalda. */}
        {!!(data.topics || []).length && (
          <section className="rounded-lg border border-line bg-white p-5">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2 mb-1">
              <Lightbulb size={15} className="text-maroon" /> De qué habla el sector ({data.topics!.length})
            </h2>
            <p className="text-xs text-sand mb-3 leading-relaxed max-w-3xl">
              Temas que tocan <strong>dos fuentes o más</strong>. Una sola es su apuesta; dos ya es el
              sector. El tema es el par de palabras que comparten, no un titular: quien escriba decide
              el titular.
            </p>
            <div className="flex flex-col gap-2">
              {data.topics!.map((t) => (
                <details key={t.phrase} className="border-l-2 border-maroon/30 pl-3">
                  <summary className="cursor-pointer text-sm text-ink flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium">{t.phrase}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-maroon/10 text-maroon">
                      {t.sources.length} fuentes
                    </span>
                    <span className="text-[11px] text-sand">{t.sources.slice(0, 3).join(', ')}</span>
                  </summary>
                  {/* Un enlace por fuente: "lo cubren cinco" se comprueba
                      abriendo cinco, no creyendo el número. */}
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {t.examples.map((e) => (
                      <li key={e.url} className="text-[11px] text-sand">
                        <span className="text-ink">{e.source}</span>{' '}
                        <a href={e.url} target="_blank" rel="noreferrer" className="text-maroon hover:underline break-all">
                          {e.url.replace(/^https?:\/\//, '').slice(0, 78)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        )}

        {GROUPS.map(({ kind, label, hint, Icon }) => {
          const group = rows.filter((r) => r.kind === kind)
          if (!group.length) return null
          return (
            <section key={kind} className="rounded-lg border border-line bg-white p-5">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Icon size={15} className="text-maroon" /> {label}
                <span className="font-normal text-sand">({group.length})</span>
              </h2>
              <p className="text-xs text-sand mb-3">{hint}</p>

              <div className="flex flex-col gap-2.5">
                {group.map((r) => (
                  <div key={r.name} className="border-t border-line pt-2.5 first:border-0 first:pt-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">{r.name}</span>
                      {r.tier && <span className="text-[11px] text-sand">{r.tier}</span>}
                      <span className="ml-auto text-xs tabular-nums text-sand">
                        {r.newCount === null ? `${r.total.toLocaleString()} en total` : (
                          <>
                            <strong className="text-maroon">{r.newCount}</strong> nuevas ·{' '}
                            {r.total.toLocaleString()} en total
                          </>
                        )}
                      </span>
                    </div>

                    {r.error && (
                      <p className="text-[11px] text-amber-800 flex items-center gap-1 mt-0.5">
                        <AlertCircle size={11} /> {r.error}
                      </p>
                    )}
                    {/* La nota es la que impide leer un cero como silencio. */}
                    {r.note && <p className="text-[11px] text-sand italic mt-0.5">{r.note}</p>}

                    {!!r.newPages.length && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {r.newPages.map((p) => (
                          <li key={p.url} className="text-[11px] text-sand flex items-baseline gap-1.5">
                            <span className="font-mono tabular-nums">{p.lastmod || 'sin fecha'}</span>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-maroon hover:underline break-all inline-flex items-center gap-1"
                            >
                              {p.url.replace(/^https?:\/\//, '').slice(0, 84)}
                              <ExternalLink size={9} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        <p className="text-[11px] text-sand leading-relaxed max-w-3xl">
          <strong className="text-ink">Una URL nueva de un competidor no prueba que le funcione.</strong>{' '}
          Dice de qué ha decidido hablar, que es una decisión de recursos y sí informa. Si le rinde,
          eso solo se sabe con tiempo.
        </p>
      </main>
    </>
  )
}
