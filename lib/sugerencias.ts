// Qué escribe la gente de verdad alrededor de un tema.
//
// POR QUÉ ESTO Y NO "related queries" DE TRENDS. La idea original era usar las
// consultas relacionadas al alza de Google Trends. Ese endpoint es el mismo que
// ya nos devuelve 429 de forma sostenida: dos peticiones por término, sin API
// oficial, y se cae justo cuando más se usa. Poner encima la función de
// sugerir keywords era montar lo importante sobre lo frágil.
//
// Autocomplete es lo contrario: sin autenticación, sin token, sin cookie, una
// sola petición, y no ha fallado ni una vez en las pruebas. Y responde mejor a
// la pregunta que de verdad importa. Trends dice qué SUBE; Autocomplete dice
// qué se ESCRIBE, que es de donde salen las consultas con intención:
//
//   "whatsapp business api" -> pricing, free, provider, pricing india
//
// LO QUE NO DA, y conviene tenerlo claro: ni volumen ni dirección. Eso lo sigue
// poniendo Trends. No lo sustituye, lo alimenta: Autocomplete propone
// candidatos y la tendencia (ya cacheada) dice cuáles van hacia arriba.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";

/** Las letras con las que se expande una raíz para sacar más variantes. */
const EXPANSORES = " abcdefghijklmnopqrstuvwxyz".split("");

/**
 * Lo que Google sugiere al escribir un término.
 *
 * Nunca lanza: devuelve lista vacía si algo falla. Sugerir keywords es una
 * ayuda, no un requisito, y no puede frenar la tanda semanal.
 */
export async function sugerencias(termino: string, idioma = "en"): Promise<string[]> {
  try {
    const u = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${idioma}&q=${encodeURIComponent(termino)}`;
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const j = JSON.parse(await r.text());
    const lista: string[] = Array.isArray(j?.[1]) ? j[1] : [];
    // Se descarta el propio término: no es una sugerencia, es lo que se escribió.
    return lista.map((s) => String(s).trim()).filter((s) => s && s.toLowerCase() !== termino.toLowerCase());
  } catch {
    return [];
  }
}

export interface Candidatas {
  /** Lo que Google completa directamente sobre el término. */
  directas: string[];
  /** Variantes al expandir con letras: saca la cola larga que no cabe en las diez primeras. */
  ampliadas: string[];
}

/**
 * Las variantes de un tema, en dos niveles.
 *
 * La expansión por letras existe porque Autocomplete devuelve como mucho diez
 * sugerencias por consulta, y las diez primeras son siempre las más genéricas.
 * Añadiendo una letra ("whatsapp business api p") aparecen las de cola larga,
 * que son las que traen intención concreta y menos competencia.
 *
 * `letras` acota cuántas se prueban: cada una es una petición. Con 6 se sacan
 * unas 40 variantes en menos de diez segundos, que es de sobra para elegir.
 */
export async function candidatas(
  termino: string,
  opciones: { idioma?: string; letras?: number; pausaMs?: number } = {},
): Promise<Candidatas> {
  const { idioma = "en", letras = 6, pausaMs = 250 } = opciones;

  const directas = await sugerencias(termino, idioma);
  const vistas = new Set([termino.toLowerCase(), ...directas.map((s) => s.toLowerCase())]);
  const ampliadas: string[] = [];

  // Se empieza por el espacio (la siguiente palabra, sin condicionar la letra)
  // y sigue por las primeras letras del alfabeto. No se recorre entero: 27
  // peticiones por término convertirían esto en el problema que evita.
  for (const letra of EXPANSORES.slice(0, letras + 1)) {
    for (const s of await sugerencias(`${termino}${letra}`, idioma)) {
      const k = s.toLowerCase();
      if (!vistas.has(k)) {
        vistas.add(k);
        ampliadas.push(s);
      }
    }
    await new Promise((r) => setTimeout(r, pausaMs));
  }

  return { directas, ampliadas };
}

/** Señales de que una consulta lleva intención de comprar o decidir, no de curiosear. */
const INTENCION =
  /\b(pricing|price|cost|costs|how much|vs|versus|alternative|alternatives|best|review|reviews|comparison|compare|free|template|checklist|example|examples|precio|precios|cuanto cuesta|coste|alternativa|alternativas|mejor|mejores|comparativa|gratis|plantilla|ejemplo|ejemplos)\b/i;

/**
 * Ordena las candidatas poniendo delante las que tienen intención.
 *
 * No es un ranking de calidad: es un filtro de forma. "whatsapp business api
 * pricing" y "whatsapp business api download" tienen el mismo volumen para
 * Autocomplete, y solo una lleva a alguien que está decidiendo. El informe del
 * 24 de agosto lo dice con datos: la única página del sitio con clics sostenidos
 * responde una pregunta de tipo "cuánto cuesta".
 */
export function porIntencion(
  lista: string[],
  semilla = "",
): { conIntencion: string[]; resto: string[] } {
  // Se mira lo que la sugerencia AÑADE, no la frase entera.
  //
  // Sin quitar la semilla, "customer acquisition cost" marcaba sus catorce
  // sugerencias como intención de compra, porque la palabra "cost" está en el
  // propio término de partida: el filtro se estaba encontrando a sí mismo.
  // "customer acquisition cost meaning in hindi" no es intención de compra.
  const palabrasSemilla = new Set(
    semilla.toLowerCase().split(/\s+/).filter(Boolean),
  );
  const soloLoAnadido = (s: string) =>
    s
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w && !palabrasSemilla.has(w))
      .join(" ");

  const conIntencion: string[] = [];
  const resto: string[] = [];
  for (const s of lista) (INTENCION.test(soloLoAnadido(s)) ? conIntencion : resto).push(s);
  return { conIntencion, resto };
}
