import type { NextRequest } from "next/server";

// Quién puede disparar los trabajos que cuestan cupo.
//
// POR QUÉ EXISTE: esta comprobación estaba copiada dentro de /api/weekly y de
// /api/ga4/analyst, y el proxy tenía OTRA distinta. Al abrir el panel con
// ACCIONES_PUBLICAS=true, el proxy dejó pasar a todo el mundo y las dos rutas
// siguieron devolviendo "no autorizado", porque no sabían que ese interruptor
// existía. El botón "Analizar ahora" llevaba desde entonces sin funcionar.
//
// Dos copias de una regla de seguridad no son dos capas: son dos versiones que
// se separan en cuanto una cambia. Ahora hay una.

export type Autorizacion = { ok: true } | { ok: false; motivo: string };

/**
 * Autoriza por secreto del cron, por login del panel, o porque el panel está
 * declarado abierto.
 *
 * Las tres vías son deliberadas: el cron del lunes manda la cabecera, una
 * persona con login manda Basic, y un panel abierto no manda nada.
 */
export function puedeGastarCupo(request: NextRequest): Autorizacion {
  // El mismo interruptor que usa proxy.ts. Si el panel está abierto para
  // entrar, lo está para actuar: es lo que significa abrirlo.
  if (process.env.ACCIONES_PUBLICAS === "true") return { ok: true };

  const secreto = process.env.WEEKLY_SECRET;
  const usuario = process.env.DASHBOARD_USER;
  const clave = process.env.DASHBOARD_PASSWORD;

  // Sin nada configurado no hay nada que comprobar. Es el caso de un montaje
  // recién clonado para otro cliente, y negarle el paso sería mentir: no está
  // protegido, simplemente no se ha configurado.
  if (!secreto && !(usuario && clave)) return { ok: true };

  if (secreto && request.headers.get("x-weekly-secret") === secreto) return { ok: true };

  const authz = request.headers.get("authorization");
  if (usuario && clave && authz?.startsWith("Basic ")) {
    const [u, p] = Buffer.from(authz.slice(6), "base64").toString().split(":");
    if (u === usuario && p === clave) return { ok: true };
  }

  // El motivo dice qué falta, no solo que falta algo. "no autorizado" a secas
  // es lo que hizo falta leer el código para entender por qué un botón del
  // propio panel se negaba a funcionar.
  return {
    ok: false,
    motivo: secreto
      ? "Hace falta el login del panel o la cabecera x-weekly-secret. Si quieres que el panel funcione sin login, pon ACCIONES_PUBLICAS=true."
      : "Hace falta el login del panel. Si quieres que funcione sin login, pon ACCIONES_PUBLICAS=true.",
  };
}
