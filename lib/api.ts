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
  opts: { retriedOnWake?: boolean } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión y reintenta.");
  }

  // Cold start del free tier: 503/502/504 sin JSON. Despertamos y reintentamos 1 vez.
  if ([502, 503, 504].includes(res.status)) {
    if (!opts.retriedOnWake) {
      await wake();
      await new Promise((r) => setTimeout(r, 12000));
      return postJson<T>(url, body, { retriedOnWake: true });
    }
    throw new ApiError(
      "El servidor estaba despertando (plan gratis de Render). Espera ~30 segundos y vuelve a intentar."
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
