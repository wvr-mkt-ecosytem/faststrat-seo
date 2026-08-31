// Helper de fetch robusto para llamadas desde el navegador.
// Maneja el cold-start del free tier de Render (503 con cuerpo vacío/HTML)
// y respuestas no-JSON, para no romper con "Unexpected end of JSON input".

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Despierta la instancia (free tier de Render se duerme). No falla si ya está despierta. */
export async function wake(): Promise<void> {
  try {
    await fetch("/api/health", { cache: "no-store" });
  } catch {
    /* ignore */
  }
}

/**
 * POST con JSON. Si el server está dormido (503/502/504) lo despierta y reintenta
 * una vez. Devuelve el JSON parseado o lanza ApiError con mensaje legible.
 */
export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  opts: { retriedOnWake?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  // Cuándo empezó. Es lo que distingue un arranque en frío (falla en segundos,
  // y reintentar es correcto) de un corte del proxy sobre trabajo ya en marcha
  // (falla en minutos, y reintentar duplica el gasto).
  const arrancoEn = Date.now();

  // Un límite explícito, siempre.
  //
  // No había ninguno, así que un botón que llamaba al agente podía girar
  // indefinidamente: si la plataforma cortaba la petición sin responder, el
  // navegador seguía esperando una respuesta que ya no iba a llegar y no había
  // forma de distinguir "está trabajando" de "se perdió".
  //
  // Veinticinco minutos, no trece. Trece salió de una estimación hecha ANTES de
  // medir. Con el escritor cronometrado en 15,7 minutos, aquel límite cortaba
  // antes de que el trabajo acabara: el cliente decía que se rendía mientras el
  // artículo se escribía igualmente y aparecía en Blogs sin que nada lo
  // avisara. Es el peor síntoma posible, contar que algo falló cuando funcionó.
  const timeoutMs = opts.timeoutMs ?? 25 * 60 * 1000;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError") {
      throw new ApiError(
        `La operación pasó de ${Math.round(timeoutMs / 60000)} minutos sin responder y se dejó de esperar. ` +
          "Puede que el trabajo se completara igualmente en el servidor: recarga la página antes de repetirlo.",
      );
    }
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión y reintenta.");
  }

  // 502/503/504: hay que distinguir DOS cosas que se veían igual.
  //
  //   Arranque en frío: la instancia dormía, falla en SEGUNDOS y reintentar es
  //   lo correcto porque no se había empezado nada.
  //
  //   Corte del proxy: la petición llevaba minutos trabajando y Render cortó la
  //   conexión. Medido: 502 a los 3,2 minutos, con la instancia despierta
  //   (respondía en medio segundo justo después). Aquí reintentar es lo PEOR
  //   que se puede hacer: la primera sigue viva y se lanza una segunda encima.
  //   Es lo que hizo el cron del lunes, que escribió la tanda tres veces.
  //
  // El tiempo transcurrido separa los dos casos sin ambigüedad.
  if ([502, 503, 504].includes(res.status)) {
    const segundos = (Date.now() - arrancoEn) / 1000;

    if (segundos < 60 && !opts.retriedOnWake) {
      await wake();
      await new Promise((r) => setTimeout(r, 12000));
      return postJson<T>(url, body, { retriedOnWake: true });
    }

    if (segundos >= 60) {
      throw new ApiError(
        `La conexión se cortó a los ${Math.round(segundos / 60)} minutos, pero el servidor puede seguir trabajando. ` +
          "NO lo repitas todavía: lanzarías un segundo trabajo encima del primero y gastarías el doble. " +
          "Espera y recarga la página para ver si aparece.",
      );
    }

    throw new ApiError(
      "El servidor estaba despertando (plan gratis de Render). Espera ~30 segundos y vuelve a intentar.",
    );
  }

  // Un "no tienes permiso" NUNCA se reintenta, así que nunca se disfraza.
  //
  // El proxy contesta 401 en texto plano, no en JSON, así que caía en el
  // JSON.parse de más abajo y salía por pantalla como "reintenta en unos
  // segundos". El botón Escribir llevaba así desde que se quitó el login: el
  // usuario esperaba treinta segundos y volvía a intentarlo, para siempre,
  // mientras el problema era una variable sin poner en el servidor.
  //
  // Un error que se puede resolver y uno que solo se puede esperar no pueden
  // dar el mismo mensaje.
  if (res.status === 401 || res.status === 403) {
    const detalle = (await res.text()).trim().slice(0, 300);
    throw new ApiError(
      `El servidor rechazó la acción por permisos (HTTP ${res.status}). ` +
        `Esto no se arregla reintentando. ${detalle || ""} ` +
        `Si el panel debe funcionar sin login, falta ACCIONES_PUBLICAS=true en el servidor.`,
    );
  }

  const text = await res.text();
  if (!text) {
    throw new ApiError(
      res.ok
        ? "El servidor respondió vacío (probablemente la operación tardó demasiado). Reintenta."
        : `Error del servidor (HTTP ${res.status}).`
    );
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new ApiError(`Respuesta inesperada del servidor (HTTP ${res.status}). Reintenta en unos segundos.`);
  }

  // Un fallo del servidor TIENE que llegar como excepción.
  //
  // Esto solo reventaba con error de red, cuerpo vacío o cuerpo no-JSON. Una
  // respuesta `{error: "..."}` con HTTP 500, o la de auth con `connected:false`
  // y HTTP 200, se resolvía como si todo hubiera ido bien. El caso peor estaba
  // en el botón de escribir del calendario: hacía la llamada, tiraba el cuerpo
  // y ponía un tick verde de "Escrito" sin que se hubiera escrito nada.
  // Reproducible hoy: una idea guardada con primaryKeyword vacío hace que
  // /api/blog/generate devuelva 400 "Falta 'keyword' o 'topic'", y el usuario
  // veía una palomita.
  //
  // Aquí es donde tiene que romper: un solo sitio para todos los llamadores,
  // en vez de confiar en que cada uno se acuerde de mirar `error`.
  const cuerpo = data as { error?: unknown; connected?: unknown; action?: unknown } | null;
  if (cuerpo && typeof cuerpo === "object") {
    const err = typeof cuerpo.error === "string" ? cuerpo.error : null;
    if (err) {
      const accion = typeof cuerpo.action === "string" ? ` ${cuerpo.action}` : "";
      throw new ApiError(err + accion);
    }
    // La forma que devuelve apiRoute cuando Google no responde: 200 con
    // connected:false. Sin esto, "sin acceso" se leía como "operación hecha".
    if (cuerpo.connected === false) {
      throw new ApiError("No hay acceso a Google ahora mismo. Revisa la pestaña de Medición.");
    }
  }
  if (!res.ok) {
    throw new ApiError(`Error del servidor (HTTP ${res.status}).`);
  }

  return data;
}
