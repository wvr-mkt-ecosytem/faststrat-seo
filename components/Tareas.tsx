'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Las tareas largas viven AQUÍ, no en la página que las lanzó.
//
// El problema que resuelve: escribir un artículo tardó 15,7 minutos medidos. Si
// el estado vive en la página, cambiar de pestaña la desmonta, se pierde el
// aviso y la petición queda huérfana: el trabajo sigue en el servidor y nadie
// se entera. Ya nos pasó, y el síntoma es el peor posible, que es "no pasó
// nada" cuando en realidad sí pasó.
//
// Poniendo esto en el layout raíz, el proveedor sobrevive a la navegación entre
// pestañas del panel. Puedes lanzar un artículo, irte a Reportes a leer el
// análisis, y volver: sigue ahí, contando.
//
// Lo que NO sobrevive es recargar el navegador o cerrar la pestaña. Eso es un
// límite real del navegador y no lo tapo: la petición se corta, aunque el
// servidor termine su trabajo igualmente y el resultado aparezca en Blogs.

export interface Tarea {
  id: string
  etiqueta: string
  detalle?: string
  /** Segundos que suele tardar. Solo para dar contexto, no para cortar nada. */
  estimadoSeg: number
  inicio: number
  estado: 'corriendo' | 'ok' | 'error'
  /** Qué decir al terminar. Es lo que se lee en la notificación. */
  resultado?: string
  /** A dónde ir a ver el trabajo terminado. */
  enlace?: string
}

interface Ctx {
  tareas: Tarea[]
  /** Lanza una tarea y la sigue hasta el final, pase lo que pase con la pantalla. */
  lanzar: (
    opciones: { etiqueta: string; detalle?: string; estimadoSeg: number; enlace?: string },
    trabajo: () => Promise<{ ok: boolean; resultado: string; enlace?: string }>,
  ) => Promise<void>
  descartar: (id: string) => void
}

const TareasCtx = createContext<Ctx | null>(null)

export const useTareas = () => {
  const c = useContext(TareasCtx)
  if (!c) throw new Error('useTareas fuera del proveedor')
  return c
}

/** Pide permiso de notificación solo cuando hace falta, no al cargar la página. */
async function notificar(titulo: string, cuerpo: string) {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission === 'granted') new Notification(titulo, { body: cuerpo })
  } catch {
    // Un navegador que no deja notificar no puede tumbar la tarea.
  }
}

export function ProveedorTareas({ children }: { children: React.ReactNode }) {
  const [tareas, setTareas] = useState<Tarea[]>([])
  const contador = useRef(0)

  const descartar = useCallback((id: string) => {
    setTareas((t) => t.filter((x) => x.id !== id))
  }, [])

  const lanzar = useCallback<Ctx['lanzar']>(async (opciones, trabajo) => {
    const id = `t${++contador.current}`
    setTareas((t) => [
      ...t,
      { id, etiqueta: opciones.etiqueta, detalle: opciones.detalle, estimadoSeg: opciones.estimadoSeg, inicio: Date.now(), estado: 'corriendo' },
    ])

    try {
      const r = await trabajo()
      setTareas((t) =>
        t.map((x) => (x.id === id ? { ...x, estado: r.ok ? 'ok' : 'error', resultado: r.resultado, enlace: r.enlace ?? opciones.enlace } : x)),
      )
      await notificar(r.ok ? `Listo: ${opciones.etiqueta}` : `Falló: ${opciones.etiqueta}`, r.resultado)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setTareas((t) => t.map((x) => (x.id === id ? { ...x, estado: 'error', resultado: msg } : x)))
      await notificar(`Falló: ${opciones.etiqueta}`, msg)
    }
  }, [])

  return (
    <TareasCtx.Provider value={{ tareas, lanzar, descartar }}>
      {children}
      <PanelTareas />
    </TareasCtx.Provider>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** El panel flotante. Se ve desde cualquier pestaña, que es el punto. */
function PanelTareas() {
  const { tareas, descartar } = useTareas()
  const [, tick] = useState(0)

  // Un latido por segundo mientras haya algo corriendo. Sin esto el tiempo se
  // congelaría al cambiar de pestaña, que es justo cuando hace falta verlo.
  useEffect(() => {
    if (!tareas.some((t) => t.estado === 'corriendo')) return
    const i = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [tareas])

  if (!tareas.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {tareas.map((t) => {
        const seg = Math.floor((Date.now() - t.inicio) / 1000)
        // La barra NO se detiene en el 90%: sigue midiendo. Al pasarse de la
        // estimación se vuelve a llenar en ciclos, para que se vea que sigue
        // viva sin fingir que va a acabar en un punto concreto.
        const pct = t.estado === 'corriendo' ? ((seg / Math.max(t.estimadoSeg, 1)) * 100) % 100 : 100
        const pasado = seg > t.estimadoSeg

        return (
          <div
            key={t.id}
            className={`rounded-lg border shadow-lg px-3 py-2.5 bg-white ${
              t.estado === 'error' ? 'border-red-300' : t.estado === 'ok' ? 'border-green-300' : 'border-maroon/20'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] font-medium text-ink">{t.etiqueta}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-sand tabular-nums">{mmss(seg)}</span>
                {t.estado !== 'corriendo' && (
                  <button onClick={() => descartar(t.id)} className="text-[11px] text-sand hover:text-ink" aria-label="cerrar">
                    ✕
                  </button>
                )}
              </div>
            </div>

            {t.estado === 'corriendo' && (
              <>
                <div className="h-1 w-full rounded-full bg-maroon/10 overflow-hidden mt-1.5">
                  <div className="h-full bg-maroon/70 transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-sand leading-snug mt-1">
                  {pasado
                    ? `Lleva más de los ~${mmss(t.estimadoSeg)} habituales, pero sigue. Puedes cambiar de pestaña: te aviso al terminar.`
                    : (t.detalle ?? 'Puedes cambiar de pestaña: te aviso al terminar.')}
                </p>
              </>
            )}

            {t.estado !== 'corriendo' && (
              <p className={`text-[11px] leading-snug mt-1 ${t.estado === 'error' ? 'text-red-700' : 'text-green-700'}`}>
                {t.resultado}
                {t.enlace && t.estado === 'ok' && (
                  <a href={t.enlace} className="ml-1 underline">
                    ver
                  </a>
                )}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
