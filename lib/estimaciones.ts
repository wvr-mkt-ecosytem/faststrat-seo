'use client'

import { useEffect, useState } from 'react'

// Las dos barras de progreso, midiendo lo mismo.
//
// Había dos números escritos a mano en sitios distintos, y ninguno era verdad:
// la barra de la tarjeta decía "~8:00" para escribir un artículo cuando la
// corrida medida tardó 23,8 minutos. Peor: al lado del 480 había un comentario
// afirmando que "los tiempos salen de corridas medidas". Un número inventado
// con un comentario que jura lo contrario es peor que ningún número, porque
// nadie lo cuestiona.
//
// Ahora las dos leen la MISMA fuente, y esa fuente son las corridas que de
// verdad terminaron (ver lib/duraciones.ts). Se corrige sola.

export type Tarea = 'escribir' | 'adaptar' | 'ideas' | 'tanda' | 'analista' | 'corregir'

type Estimacion = { segundos: number; corridas: number }

// Lo mismo que hay en el servidor. Se repite aquí para el primer pintado,
// antes de que llegue la respuesta: sin esto la barra aparecería sin escala y
// daría un salto en cuanto cargara.
const POR_DEFECTO: Record<Tarea, Estimacion> = {
  escribir: { segundos: 1430, corridas: 0 },
  adaptar: { segundos: 1500, corridas: 0 },
  ideas: { segundos: 180, corridas: 0 },
  tanda: { segundos: 300, corridas: 0 },
  analista: { segundos: 500, corridas: 0 },
  corregir: { segundos: 120, corridas: 0 },
}

let cache: Record<Tarea, Estimacion> | null = null
let pidiendo: Promise<void> | null = null

/**
 * Cuánto suele tardar una tarea, según lo medido.
 *
 * Se pide una vez por sesión y se comparte: dos barras abiertas a la vez no
 * tienen que hacer dos peticiones para saber lo mismo.
 */
export function useEstimacion(tarea: Tarea): Estimacion {
  // El valor inicial se lee de la caché en el propio useState, no dentro del
  // efecto. Llamar a setEst nada más entrar provoca un render encadenado —React
  // avisa de ello— y además parpadea: pinta el valor por defecto y lo cambia al
  // instante. Si ya está cacheado, se pinta bien a la primera.
  const [est, setEst] = useState<Estimacion>(() => cache?.[tarea] ?? POR_DEFECTO[tarea])

  useEffect(() => {
    if (cache) return
    let vivo = true
    pidiendo ??= fetch('/api/duraciones')
      .then((r) => r.json())
      .then((d) => {
        if (d?.estimaciones) cache = d.estimaciones
      })
      .catch(() => {
        /* se queda el valor por defecto */
      })
    // El setState va en la respuesta de algo externo, que es justo para lo que
    // sirve un efecto. `vivo` evita tocar el estado de un componente que ya se
    // desmontó mientras la petición volvía.
    pidiendo.then(() => {
      if (vivo && cache) setEst(cache[tarea])
    })
    return () => {
      vivo = false
    }
  }, [tarea])

  return est
}
