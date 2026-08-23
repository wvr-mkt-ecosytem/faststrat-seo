'use client'

import { useEffect, useState } from 'react'

// La barra de progreso de las acciones que llaman al agente.
//
// Existe por un caso concreto: se pulsó "Escribir", la petición tardó y la
// pantalla solo mostraba un icono girando de trece píxeles. Desde fuera eso es
// indistinguible de un botón que no hace nada, así que la conclusión razonable
// fue "no pasa nada" cuando en realidad estaba trabajando.
//
// Tres decisiones sobre qué enseñar:
//
// 1. El tiempo TRANSCURRIDO, no un porcentaje inventado. No sabemos cuánto va a
//    tardar el modelo; fingir un 40% sería mentir con una barra bonita. Lo que
//    sí sabemos es cuánto lleva, y eso ya distingue "acaba de empezar" de
//    "lleva ocho minutos".
//
// 2. La estimación, dicha como estimación. Sale de corridas reales medidas, no
//    de un número redondo: escribir tardó entre 6 y 10 minutos, el analista 8,8,
//    el corrector entre 1 y 9 según lo que hubiera que arreglar.
//
// 3. Qué pasa al pasarse de la estimación. La barra se detiene al 90% y el
//    texto cambia a "sigue trabajando": no se completa sola, porque completarla
//    diría que terminó, y no se pone en rojo, porque tardar más de lo previsto
//    no es un fallo.

export interface ProgresoProps {
  /** Qué está haciendo, en presente. Ej: "Escribiendo el artículo". */
  etiqueta: string
  /** Segundos que suele tardar, medidos en corridas reales. */
  estimadoSeg: number
  /** Detalle opcional bajo la barra: qué pasos incluye. */
  detalle?: string
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function Progreso({ etiqueta, estimadoSeg, detalle }: ProgresoProps) {
  const [seg, setSeg] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setSeg((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const pasado = seg > estimadoSeg
  // Tope al 90%: llegar al 100% sin haber terminado se lee como "ya está".
  const pct = Math.min(90, Math.round((seg / Math.max(estimadoSeg, 1)) * 90))

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-ink">{etiqueta}</span>
        <span className="text-sand tabular-nums">
          {mmss(seg)}
          {!pasado && ` de ~${mmss(estimadoSeg)}`}
        </span>
      </div>

      <div className="h-1 w-full rounded-full bg-maroon/10 overflow-hidden">
        <div
          className="h-full bg-maroon/70 transition-all duration-1000 ease-linear"
          style={{ width: `${pasado ? 90 : pct}%` }}
        />
      </div>

      <p className="text-[10px] text-sand leading-snug">
        {pasado
          ? 'Está tardando más de lo habitual, pero sigue trabajando. No cierres ni recargues: al recargar se pierde el aviso, aunque el trabajo continúa en el servidor.'
          : detalle}
      </p>
    </div>
  )
}
