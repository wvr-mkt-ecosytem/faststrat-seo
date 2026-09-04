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

import { guardado, guardar, PLAZO_MS } from "@/lib/trends-cache";

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
  /**
   * El detalle por país, cuando se midió en varios.
   *
   * Trends no admite regiones: no se puede preguntar por "LATAM", hay que
   * preguntar país por país. Y el detalle importa, no es adorno: un tema que
   * crece en Colombia y se muere en México no es "estable en LATAM", son dos
   * situaciones distintas, y saberlo cambia para quién se escribe.
   */
  mercados?: Record<string, { direccion: Tendencia["direccion"]; cambioAnual: number; nivelActual: number }>;
}

/**
 * La demanda de un término en VARIOS países, combinada.
 *
 * Manda el país donde más demanda hay, no el promedio. Promediar un 100 y un 0
 * da 50, que es un número que no describe a ningún mercado real; quedarse con
 * el más fuerte al menos describe uno, y el detalle de los otros va en
 * `mercados` para quien quiera mirarlo.
 *
 * Devuelve null solo si NINGÚN país respondió.
 */
export async function tendenciaEnVarios(termino: string, geos: string[]): Promise<Tendencia | null> {
  const porPais: NonNullable<Tendencia["mercados"]> = {};
  const medidos: Tendencia[] = [];

  for (const geo of geos) {
    const t = await tendencia(termino, geo);
    if (!t) continue;
    porPais[geo || "global"] = {
      direccion: t.direccion,
      cambioAnual: t.cambioAnual,
      nivelActual: t.nivelActual,
    };
    medidos.push(t);
  }

  if (medidos.length === 0) return null;

  // Solo los países con demanda medible entran en la cuenta. Un país donde
  // Trends no ve nada no vota: no dice que el tema esté plano, dice que no lo
  // sabe, y meterlo como un cero arrastraría el resultado hacia abajo.
  const conVolumen = medidos.filter((t) => t.direccion !== "sin-volumen");
  if (conVolumen.length === 0) {
    return { ...medidos[0], mercados: porPais };
  }

  // La MEDIANA del cambio interanual, no la media y no el país más grande.
  //
  // Las dos alternativas fallaban sobre datos reales:
  //
  //   Quedarse con el país de más nivel decía "baja" para un término que iba
  //   +100% en Colombia, +100% en México y -30% en Argentina, porque Argentina
  //   tenía el nivel más alto. El resumen contradecía a dos de los tres.
  //
  //   La media la rompe un solo país raro: -50%, +263% y -30% promedia +61% y
  //   sale "sube", cuando dos de los tres están cayendo.
  //
  // La mediana sobrevive a las dos cosas: da +100% en el primer caso y -30% en
  // el segundo, que es lo que de verdad describe al conjunto.
  const cambios = conVolumen.map((t) => t.cambioAnual).sort((a, b) => a - b);
  const medio = Math.floor(cambios.length / 2);
  const cambioAnual =
    cambios.length % 2 === 1 ? cambios[medio] : Math.round((cambios[medio - 1] + cambios[medio]) / 2);

  const direccion: Tendencia["direccion"] =
    cambioAnual > 15 ? "sube" : cambioAnual < -15 ? "baja" : "estable";

  // El nivel sí es el del mercado más fuerte: es donde el artículo puede
  // rendir, y el detalle por país queda en `mercados` para quien mire.
  const nivelActual = Math.max(...conVolumen.map((t) => t.nivelActual));

  return {
    termino,
    direccion,
    cambioAnual,
    nivelActual,
    meses: conVolumen[0].meses,
    mercados: porPais,
  };
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
  // El país es un string, y llamarlo mal tiene que doler.
  //
  // Una revisión del sistema llamó a esto con { geo: "CO" } en vez de "CO". La
  // función devolvió null —igual que cuando Google no responde— y el informe
  // dijo "Google Trends no responde" durante toda una investigación. Trends
  // funcionaba perfectamente; la llamada estaba mal.
  //
  // TypeScript lo habría cazado, pero todo scripts/ es .mjs y no pasa por el
  // compilador. Un error de quien llama no puede tener el mismo síntoma que un
  // fallo de la fuente: eso convierte cada diagnóstico en una trampa.
  if (typeof geo !== "string") {
    throw new TypeError(
      `tendencia(termino, geo) espera el país como texto, por ejemplo "CO". Llegó ${typeof geo}: ${JSON.stringify(geo)}`,
    );
  }

  // Lo guardado vale si no ha caducado. La serie que devuelve Trends con
  // "today 5-y" es MENSUAL, así que consultar dos veces la misma semana da lo
  // mismo y solo sirve para acercar el 429.
  const enCache = guardado(termino, geo, PLAZO_MS);
  if (enCache && !enCache.caducado) return enCache.t;

  const fresco = await consultar(termino, geo);
  if (fresco) {
    guardar(termino, geo, fresco);
    return fresco;
  }

  // Falló la consulta. Si hay algo viejo, se sirve VIEJO antes que nada.
  //
  // Sin esto, el primer 429 dejaba sin dirección de demanda a todas las
  // keywords siguientes de la tanda, que es exactamente lo que pasó tras
  // rellenar los 21 artículos. Un dato de hace cinco semanas describe la
  // tendencia igual de bien: la serie es mensual.
  return enCache?.t ?? null;
}

/** La consulta de verdad, sin caché. */
async function consultar(termino: string, geo: string): Promise<Tendencia | null> {
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
  opciones: { geo?: string; geos?: string[]; limite?: number; pausaMs?: number } = {},
): Promise<Map<string, Tendencia>> {
  const { geo = "", geos, limite = 10, pausaMs = 1200 } = opciones;
  const paises = geos ?? [geo];
  const salida = new Map<string, Tendencia>();

  for (const t of terminos.slice(0, limite)) {
    const r = await tendenciaEnVarios(t, paises);
    if (r) salida.set(t, r);
    await new Promise((s) => setTimeout(s, pausaMs));
  }
  return salida;
}

/** Cómo se cuenta una tendencia dentro de un prompt o en pantalla. */
export function describir(t: Tendencia): string {
  // El desacuerdo entre países se DICE, no se promedia.
  const paises = Object.entries(t.mercados ?? {});
  const detalle =
    paises.length > 1
      ? "  [" +
        paises
          .map(([p, m]) =>
            m.direccion === "sin-volumen"
              ? `${p}: sin volumen`
              : `${p}: ${m.cambioAnual > 0 ? "+" : ""}${m.cambioAnual}%`,
          )
          .join(", ") +
        "]"
      : "";

  if (t.direccion === "sin-volumen") {
    return "sin volumen medible en Google Trends (término muy long-tail)" + detalle;
  }
  const signo = t.cambioAnual > 0 ? "+" : "";
  const nivel =
    t.nivelActual >= 70 ? "cerca de su máximo" : t.nivelActual >= 35 ? "a media altura" : "muy por debajo de su máximo";
  return `${t.direccion} (${signo}${t.cambioAnual}% interanual, hoy ${nivel}: ${t.nivelActual}/100)${detalle}`;
}
