// Reconoce la credencial de Google muerta y la convierte en un estado que la
// interfaz puede mostrar.
//
// Portado del sistema de Leasey, donde el 2 de agosto de 2026 se borró la
// cuenta de Google que había emitido los refresh tokens. Google responde
// `invalid_grant`, y eso rompe de golpe todo lo que toca Search Console.
//
// Aquí entra ANTES de que pase, no después: el modo de fallo es el mismo (un
// token de OAuth que deja de valer) y el coste de descubrirlo sin esto fue una
// tarde entera creyendo que había quince fallos distintos.
//
// Lo que se veía sin esto no era un error: era la app fingiendo. Unas vistas se
// quedaban en "Cargando…" para siempre, y los botones devolvían un 500 con el
// cuerpo VACÍO, así que ni la pantalla ni la consola decían qué pasaba. Quince
// pestañas rotas parecían quince fallos distintos cuando era una sola causa.
//
// Un fallo de credencial no es un fallo de datos, y la diferencia importa: con
// "no hay datos" uno busca en la hoja, con "no hay acceso" uno reconecta la
// cuenta. La app tiene que decir cuál de los dos es.

export type GoogleFailure = "auth" | "not-configured" | "other";

export interface GoogleErrorInfo {
  kind: GoogleFailure;
  message: string;
  /** Qué hacer, en una frase. Va directo a la pantalla. */
  action: string;
}

const AUTH_SIGNS =
  /invalid_grant|invalid_rapt|unauthorized_client|Token has been expired or revoked|Account has been deleted|invalid_token|401/i;

/** ¿Este error es "perdimos el acceso" y no "falló la consulta"? */
export function isAuthFailure(e: unknown): boolean {
  if (!e) return false;
  const err = e as { message?: string; response?: { data?: { error?: string; error_description?: string } } };
  const parts = [
    err.message,
    err.response?.data?.error,
    err.response?.data?.error_description,
  ]
    .filter(Boolean)
    .join(" ");
  return AUTH_SIGNS.test(parts);
}

/** Traduce cualquier fallo de una API de Google a algo que se pueda enseñar. */
export function describeGoogleError(e: unknown): GoogleErrorInfo {
  const err = e as { message?: string; response?: { data?: { error_description?: string } } };
  const detail = err?.response?.data?.error_description || err?.message || "Unknown error";

  if (isAuthFailure(e)) {
    return {
      kind: "auth",
      message: `Google access is not valid any more: ${detail}`,
      action:
        "The account that issued the tokens no longer has access. Reconnect with an account that can reach the sheets, and update GOOGLE_SHEETS_REFRESH_TOKEN and GOOGLE_REFRESH_TOKEN here and in Render.",
    };
  }
  return {
    kind: "other",
    message: detail.slice(0, 300),
    action: "Retry. If it keeps failing, check the server log for the full error.",
  };
}

/**
 * Envuelve un handler de ruta entero.
 *
 * Seis rutas no tenían try/catch: cualquier fallo de Google salía como un 500
 * con el cuerpo VACÍO, que en pantalla es un botón que no hace nada y en la
 * consola no es nada. Con esto, el mismo fallo llega como JSON explicando qué
 * pasó y qué hacer.
 */
export function apiRoute<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      const info = describeGoogleError(e);
      console.error("[api]", (e as Error)?.message);
      return Response.json(
        { connected: false, error: info.message, action: info.action, kind: info.kind },
        // Un fallo de credencial no es una caída del servidor: la petición se
        // atendió, falta el acceso. Con 500 el cliente reintenta en bucle.
        { status: info.kind === "auth" ? 200 : 500 },
      );
    }
  };
}

/**
 * Envuelve una llamada suelta para que un fallo de Google salga como respuesta
 * legible en vez de un 500 con el cuerpo vacío.
 *
 * Devuelve 200 con `connected: false` cuando es un problema de credenciales:
 * la petición se atendió correctamente, lo que falta es el acceso. Un 500 haría
 * que el cliente lo trate como caída del servidor y lo reintente en bucle.
 */
export async function withGoogle<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; info: GoogleErrorInfo }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // El error completo al log del servidor; a la respuesta solo lo mostrable.
    // El objeto de googleapis trae el refresh token dentro, así que nunca se
    // devuelve tal cual al cliente.
    console.error("[google]", (e as Error)?.message);
    return { ok: false, info: describeGoogleError(e) };
  }
}
