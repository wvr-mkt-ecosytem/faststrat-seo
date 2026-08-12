'use client'

import { useEffect, useState } from 'react'
import { Gauge, Loader2, AlertCircle, CheckCircle2, PauseCircle } from 'lucide-react'
import { BrandHeader } from '@/components/BrandHeader'

type Tag = {
  name: string
  type: string
  measurementId?: string
  paused: boolean
  firingTriggers: number
}

type Finding = { severity: 'block' | 'warn' | 'ok'; detail: string }

type Container = {
  account: string
  container: string
  publicId: string
  workspace: string
  tags: Tag[]
  measurementIds: string[]
  findings: Finding[]
}

type Resp = {
  connected: boolean
  reason?: string
  /** Lo que devuelve apiRoute cuando Google falla. La pantalla solo pintaba
   *  `reason`, que apiRoute NO manda, así que un fallo de credenciales salía
   *  como una caja blanca sin explicación. */
  error?: string
  action?: string
  containers?: Container[]
  blocking?: (Finding & { container: string })[]
  measuring?: boolean
}

const TONE: Record<string, string> = {
  block: 'border-red-300 bg-red-50 text-red-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  ok: 'border-green-300 bg-green-50 text-green-900',
}

export default function MeasurementPage() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/measurement')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ connected: false, reason: 'No se pudo consultar Tag Manager.' }))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <BrandHeader />
      <main className="p-6 flex flex-col gap-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
            <Gauge size={22} className="text-maroon" /> Medición
          </h1>
          {/* Lo primero, porque es lo que más se malinterpreta de GTM. */}
          <p className="text-sm text-sand mt-1 max-w-3xl leading-relaxed">
            Tag Manager no guarda datos de rendimiento: eso vive en GA4. Lo que se comprueba aquí es
            si la medición está bien montada, que es la pregunta que va <strong>antes</strong> de mirar
            cualquier número. Un panel bonito sobre una medición rota da confianza sin base.
          </p>
        </div>

        {loading && (
          <p className="text-sm text-sand flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Leyendo el contenedor…
          </p>
        )}

        {!loading && data && !data.connected && (
          <div className="rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-ink leading-relaxed">{data.reason ?? data.error}</p>
            {data.action && (
              <p className="text-[12px] text-sand mt-2 leading-relaxed">
                {data.action}
              </p>
            )}
          </div>
        )}

        {!loading && data?.connected && !data.containers?.length && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-900 leading-relaxed">
            {data.reason ?? data.error}
          </div>
        )}

        {!loading && !!data?.containers?.length && (
          <>
            <div
              className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${
                data.measuring ? TONE.ok : TONE.block
              }`}
            >
              <strong>
                {data.measuring
                  ? 'La medición se ve montada correctamente.'
                  : 'La medición tiene problemas que invalidan los datos.'}
              </strong>
              {!data.measuring && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {(data.blocking ?? []).map((b, i) => (
                    <li key={i} className="text-[12px]">
                      <span className="font-medium">{b.container}:</span> {b.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {data.containers.map((c) => (
              <section key={c.publicId || c.container} className="rounded-lg border border-line bg-white p-5">
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <h2 className="text-sm font-bold text-ink">{c.container}</h2>
                  <span className="text-[11px] font-mono text-sand">{c.publicId}</span>
                  <span className="text-[11px] text-sand">· {c.account}</span>
                </div>
                {!!c.measurementIds.length && (
                  <p className="text-[11px] text-sand mb-2">
                    Mide contra: <span className="font-mono text-ink">{c.measurementIds.join(', ')}</span>
                  </p>
                )}

                <div className="flex flex-col gap-1.5 mb-3">
                  {c.findings.map((f, i) => (
                    <p key={i} className={`text-[12px] rounded-md border px-2.5 py-1.5 leading-snug ${TONE[f.severity]}`}>
                      {f.severity === 'ok' ? (
                        <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />
                      ) : (
                        <AlertCircle size={12} className="inline mr-1 -mt-0.5" />
                      )}
                      {f.detail}
                    </p>
                  ))}
                </div>

                <details className="text-[11px] text-sand">
                  <summary className="cursor-pointer hover:text-ink">
                    Las {c.tags.length} etiquetas del contenedor
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {c.tags.map((t) => (
                      <li key={t.name} className="flex items-baseline gap-2 flex-wrap">
                        {t.paused && <PauseCircle size={10} className="text-amber-700" />}
                        <span className={t.paused ? 'line-through opacity-60' : 'text-ink'}>{t.name}</span>
                        <span className="font-mono opacity-70">{t.type}</span>
                        {t.measurementId && <span className="font-mono text-maroon">{t.measurementId}</span>}
                        {/* Una etiqueta sin activador nunca se dispara: está y
                            no hace nada, que es el caso difícil de ver. */}
                        {t.firingTriggers === 0 && (
                          <span className="text-red-700">sin activador</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            ))}
          </>
        )}

        <p className="text-[11px] text-sand leading-relaxed max-w-3xl">
          Se lee el <strong>workspace</strong>, no la versión publicada. Una etiqueta bien configurada
          y sin publicar no mide nada, y esa diferencia es justo la que separa &quot;ya lo configuré&quot;
          de &quot;está midiendo&quot;.
        </p>
      </main>
    </>
  )
}
