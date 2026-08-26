// ¿Este tema sube o baja?
//
// Es lo único que el sistema no sabía por ningún lado. Search Console dice qué
// se busca AHORA y dónde apareces; no dice si la demanda lleva dos años
// cayendo. Escribir en 2026 sobre un tema en declive es trabajo perdido, y
// hasta ahora nada lo habría detectado.
//
// NO HAY API OFICIAL. Google Trends se consulta con dos peticiones al endpoint
// interno de la web: una pide un token y la otra los datos. Consecuencias que
// hay que asumir y que están tratadas abajo:
//
//   - Sin la cookie NID devuelve 429 a la primera. Medido: con cookie, las
//     cuatro consultas de prueba respondieron; sin ella, ninguna.
//   - Puede cambiar sin aviso, porque no es un contrato público.
//   - Hay límite de ritmo, así que las consultas van de una en una y espaciadas.
//
// Por eso NADA de esto puede frenar la generación de ideas. Si Trends falla, la
// tanda sale igual y sin tendencia: es un dato que ayuda a priorizar, no un
// requisito.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/** Las respuestas vienen con basura delante para que no se puedan pedir por XHR. */
const limpiar = (t: string) => JSON.parse(t.replace(/^\)\]\}'?,?\s*/, ""));

let cookie: { valor: string; cuando: number } | null = null;
const COOKIE_MS = 30 * 60 * 1000;

async function conseguirCookie(): Promise<string> {
  if (cookie && Date.now() - cookie.cuando < COOKIE_MS) return cookie.valor;
  try {
    const r = await fetch("https://trends.google.com/trends/explore?q=test", {
      headers: { "User-Agent": UA, "Accept-Language": "es" },
      signal: AbortSignal.timeout(20000),
    });
    const valor = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    cookie = { valor, cuando: Date.now() };
    return valor;
  } catch {
    return "";
  }
}

export interface Tendencia {
  termino: string;
  /**
   * Sube, baja, se mantiene, o no hay volumen suficiente para saberlo.
   *
   * "sin-volumen" es un estado propio y no un "estable" disfrazado. Google
   * Trends devuelve la serie entera a cero cuando el término es demasiado
   * long-tail para medirlo, y la cuenta interanual sobre ceros da 0%: eso se
   * leía como "la demanda se mantiene", que es exactamente lo contrario de lo
   * que pasa. De 19 keywords reales del blog, 8 salían así.
   *
   * Y la distinción es útil por sí misma: un término que Trends no ve es muy
   * long-tail, o sea poca competencia y poco volumen. Eso cambia qué esperar
   * del artículo, no si escribirlo.
   */
  direccion: "sube" | "baja" | "estable" | "sin-volumen";
  /** El cambio interanual, en porcentaje. */
  cambioAnual: number;
  /**
   * Dónde está hoy respecto a su propio máximo histórico, de 0 a 100.
   *
   * Importa tanto como la dirección. Un tema al 12 de su máximo que sube un 30%
   * sigue siendo un tema muerto rebotando; uno al 90 que baja un 10% sigue
   * teniendo diez veces más demanda. Sin este número, "sube un 71%" se lee como
   * una oportunidad cuando puede ser ruido sobre una base mínima: pasó en la
   * primera prueba con "fax machine".
   */
  nivelActual: number;
  meses: number;
}

/**
 * El interés de un término en los últimos cinco años.
 *
 * Se piden cinco años y se compara AÑO CONTRA AÑO en vez de la primera mitad
 * del periodo contra la segunda. Comparar mitades confunde estacionalidad con
 * tendencia: cualquier tema con pico en primavera "sube" si el periodo empieza
 * en invierno. Interanual cancela la estación.
 *
 * Devuelve null si algo falla, siempre. Nunca lanza.
 */
export async function tendencia(termino: string, geo = ""): Promise<Tendencia | null> {
  try {
    const ck = await conseguirCookie();
    const req = { comparisonItem: [{ keyword: termino, geo, time: "today 5-y" }], category: 0, property: "" };
    const cabeceras = { "User-Agent": UA, "Accept-Language": "es", Cookie: ck };

    const r1 = await fetch(
      `https://trends.google.com/trends/api/explore?hl=es&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`,
      { headers: cabeceras, signal: AbortSignal.timeout(25000) },
    );
    if (!r1.ok) return null;
    const w = (limpiar(await r1.text()).widgets ?? []).find(
      (x: { id: string }) => x.id === "TIMESERIES",
    );
    if (!w) return null;

    const r2 = await fetch(
      `https://trends.google.com/trends/api/widgetdata/multiline?hl=es&tz=0&req=${encodeURIComponent(
        JSON.stringify(w.request),
      )}&token=${encodeURIComponent(w.token)}`,
      { headers: cabeceras, signal: AbortSignal.timeout(25000) },
    );
    if (!r2.ok) return null;

    const puntos: number[] = (limpiar(await r2.text()).default?.timelineData ?? []).map(
      (p: { value?: number[] }) => p.value?.[0] ?? 0,
    );
    // Hacen falta dos años completos para comparar uno con otro.
    if (puntos.length < 24) return null;

    const media = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
    const ultimos = puntos.slice(-12);
    const anteriores = puntos.slice(-24, -12);
    const a = media(anteriores);
    const b = media(ultimos);
    const pico = Math.max(...puntos);

    // Serie plana a cero: Trends no ve el término. No es "estable".
    //
    // Trends normaliza a 0-100 sobre el propio pico del término, así que una
    // serie entera de ceros significa volumen por debajo de su umbral de
    // medición. Con la cuenta interanual eso daba 0% y el sistema lo publicaba
    // como "estable", diciendo que la demanda se mantiene cuando en realidad
    // no hay demanda medible.
    if (pico === 0 || (a === 0 && b === 0)) {
      return { termino, direccion: "sin-volumen", cambioAnual: 0, nivelActual: 0, meses: puntos.length };
    }

    const cambio = a > 0 ? ((b - a) / a) * 100 : 100;

    // El 15% no es un número redondo elegido a ojo: por debajo, el ruido de la
    // normalización de Trends (que redondea a enteros de 0 a 100) produce
    // variaciones de ese orden sin que la demanda haya cambiado.
    const direccion: Tendencia["direccion"] = cambio > 15 ? "sube" : cambio < -15 ? "baja" : "estable";

    return {
      termino,
      direccion,
      cambioAnual: Math.round(cambio),
      nivelActual: Math.round((b / pico) * 100),
      meses: puntos.length,
    };
  } catch {
    return null;
  }
}

/**
 * La tendencia de varios términos, de uno en uno y con pausa.
 *
 * En serie a propósito: el endpoint limita el ritmo y en paralelo devuelve 429
 * a casi todo. Con `limite` se acota cuántos se consultan, porque cada uno son
 * dos peticiones y una tanda de veinte ideas tardaría más que escribirlas.
 */
export async function tendencias(
  terminos: string[],
  opciones: { geo?: string; limite?: number; pausaMs?: number } = {},
): Promise<Map<string, Tendencia>> {
  const { geo = "", limite = 10, pausaMs = 1200 } = opciones;
  const salida = new Map<string, Tendencia>();

  for (const t of terminos.slice(0, limite)) {
    const r = await tendencia(t, geo);
    if (r) salida.set(t, r);
    await new Promise((s) => setTimeout(s, pausaMs));
  }
  return salida;
}

/** Cómo se cuenta una tendencia dentro de un prompt o en pantalla. */
export function describir(t: Tendencia): string {
  if (t.direccion === "sin-volumen") {
    return "sin volumen medible en Google Trends (término muy long-tail)";
  }
  const signo = t.cambioAnual > 0 ? "+" : "";
  const nivel =
    t.nivelActual >= 70 ? "cerca de su máximo" : t.nivelActual >= 35 ? "a media altura" : "muy por debajo de su máximo";
  return `${t.direccion} (${signo}${t.cambioAnual}% interanual, hoy ${nivel}: ${t.nivelActual}/100)`;
}
