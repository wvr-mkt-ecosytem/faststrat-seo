'use client'

import { useEffect, useState } from 'react'
import { Activity, Loader2, AlertCircle } from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'

type Page = {
  path: string
  clicks: number
  impressions: number
  position: number
  sessions: number
  avgEngagement: number
  engagementRate: number
  conversions: number
  verdict: string
  action: string
}

type Resp = {
  connected: boolean
  reason?: string
  action?: string
  days?: number
  property?: string
  pages?: Page[]
  byVerdict?: Record<string, number>
  totals?: { sessions: number; conversions: number; clicks: number }
  onlyInSearch?: number
}

// Cada veredicto es un arreglo distinto, y el color lo dice antes de leer.
const VERDICT: Record<string, { tone: string; hint: string }> = {
  'sin datos en GA4': { tone: 'bg-red-100 text-red-800', hint: 'Problema de medición, no de tráfico' },
  'casi nadie la ve': { tone: 'bg-neutral-100 text-neutral-700', hint: 'Alcance' },
  'sale y no la clican': { tone: 'bg-amber-100 text-amber-800', hint: 'Título y meta' },
  'entran y se van': { tone: 'bg-orange-100 text-orange-800', hint: 'La página no cumple el título' },
  'leen y no convierten': { tone: 'bg-blue-100 text-blue-800', hint: 'Falta el paso siguiente' },
  funcionando: { tone: 'bg-green-100 text-green-700', hint: 'Déjala' },
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'border-maroon/30 bg-maroon/5' : 'border-line bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wide text-sand">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-maroon' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

export default function TrafficPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(28)
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ga4?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ connected: false, reason: 'No se pudo consultar GA4.' }))
      .finally(() => setLoading(false))
  }, [days])

  const pages = (data?.pages ?? []).filter((p) => !filter || p.verdict === filter)

  return (
    <>
      <BrandHeader subtitle={data?.property ? `Propiedad GA4 ${data.property}` : undefined}>
        <div className="flex bg-cream-2 rounded-lg p-0.5">
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-2.5 py-1 rounded-md ${days === d ? 'bg-white text-ink shadow-sm' : 'text-sand'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </BrandHeader>

      <main className="p-6 flex flex-col gap-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
            <Activity size={22} className="text-maroon" /> Qué pasa después del clic
          </h1>
          <p className="text-sm text-sand mt-1 max-w-3xl leading-relaxed">
            Search Console se acaba en el clic y GA4 empieza ahí. Juntas dicen si el problema de una
            página es que no la ven, que no la clican, que entran y se van, o que leen y no convierten.
            Son cuatro arreglos distintos.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-sand flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Cruzando GSC con GA4…
          </p>
        )}

        {!loading && data && !data.connected && (
          <div className="rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-ink leading-relaxed">{data.reason}</p>
            {data.action && <p className="text-[12px] text-sand mt-2">{data.action}</p>}
          </div>
        )}

        {!loading && data?.connected && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Clics desde búsqueda" value={(data.totals?.clicks ?? 0).toLocaleString()} />
              <Stat label="Sesiones" value={(data.totals?.sessions ?? 0).toLocaleString()} />
              <Stat label="Conversiones" value={data.totals?.conversions ?? 0} accent />
              <Stat label="Solo en GSC" value={data.onlyInSearch ?? 0} />
            </div>

            {/* Un desajuste grande entre lo que ve GSC y lo que ve GA4 es señal
                de medición, y conviene decirlo antes de que alguien saque
                conclusiones de tráfico sobre datos incompletos. */}
            {!!data.onlyInSearch && data.onlyInSearch > 5 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 leading-relaxed">
                Hay {data.onlyInSearch} páginas que Search Console ve y GA4 no. Eso suele ser medición,
                no falta de tráfico: revísalo en la pestaña Medición antes de sacar conclusiones de
                estos números.
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setFilter('')}
                className={`text-xs px-2.5 py-1 rounded-full border ${!filter ? 'bg-ink text-cream border-ink' : 'bg-white text-sand border-line hover:text-ink'}`}
              >
                Todas {data.pages?.length ?? 0}
              </button>
              {Object.entries(data.byVerdict ?? {}).map(([v, n]) => (
                <button
                  key={v}
                  onClick={() => setFilter(v === filter ? '' : v)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${filter === v ? 'bg-ink text-cream border-ink' : 'bg-white text-sand border-line hover:text-ink'}`}
                >
                  {v} {n}
                </button>
              ))}
            </div>

            <section className="rounded-lg border border-line bg-white p-5 flex flex-col gap-2.5">
              {pages.map((p) => (
                <div key={p.path} className="border-t border-line pt-2.5 first:border-0 first:pt-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm text-ink font-medium truncate max-w-xl">{p.path}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${VERDICT[p.verdict]?.tone ?? 'bg-neutral-100'}`}>
                      {p.verdict}
                    </span>
                  </div>
                  <p className="text-[11px] text-sand tabular-nums mt-0.5">
                    {p.clicks} clics · {p.impressions.toLocaleString()} impr · pos {p.position} ·{' '}
                    {p.sessions} sesiones · {p.avgEngagement}s de media · {p.conversions} conv.
                  </p>
                  <p className="text-[11px] text-ink/80 leading-snug mt-0.5">{p.action}</p>
                </div>
              ))}
              {!pages.length && <p className="text-sm text-sand">Nada en esta categoría.</p>}
            </section>
          </>
        )}

        <p className="text-[11px] text-sand leading-relaxed max-w-3xl">
          <strong className="text-ink">El orden de las preguntas importa.</strong> Primero si llegan,
          luego si se quedan, luego si convierten. Una página que nadie ve no tiene un problema de
          conversión aunque convierta cero, y tratarla como si lo tuviera lleva a reescribir lo que
          solo necesitaba que lo vieran.
        </p>
      </main>
    </>
  )
}
