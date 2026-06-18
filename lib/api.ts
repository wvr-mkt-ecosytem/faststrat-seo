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
  return data;
}
