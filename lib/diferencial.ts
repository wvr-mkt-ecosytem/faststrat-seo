// ¿Este artículo aporta algo que no tengan los que ya están arriba?
//
// Es la pregunta que el sistema no se hacía. La compuerta comprobaba la FORMA
// (fuentes enlazadas, encabezados, enlaces, muletillas) y nada comprobaba el
// VALOR, así que se podía publicar un artículo impecable que repitiera lo que
// ya dicen los diez resultados que tiene encima.
//
// El informe del 24 de agosto lo dice sin nombrarlo: las páginas con 0 clics en
// posición 4 no fallan por estar mal escritas, fallan porque prometen lo mismo
// que rework.com y gomega.ai. Y Google lo pregunta directamente:
//
//   "¿Ofrece el contenido información, datos de informes, investigaciones o
//    análisis originales?"
//   "¿Creas mucho contenido sobre muchos temas distintos con la esperanza de
//    que alguno tenga un buen rendimiento?"
//
// LO QUE ESTO COMPRUEBA Y LO QUE NO. No juzga si el artículo aporta valor: eso
// no lo decide una expresión regular y sería deshonesto decir lo contrario.
// Comprueba que el trabajo SE HIZO y quedó por escrito: que alguien miró la
// SERP, nombró a los competidores concretos que hay arriba y dijo en qué se
// aparta este artículo. Un agente que no puede rellenar eso sin inventarse
// dominios es un agente que no miró, y un humano que lee dos líneas vagas lo
// ve al instante. Convertir la pregunta en algo revisable es lo que se puede
// automatizar; responderla bien sigue siendo trabajo.

/** Las tres formas de aportar algo. Van en el prompt y en la comprobación. */
export const FORMAS_DE_APORTAR = [
  "un dato o cálculo propio que no esté publicado en ningún otro sitio",
  "una prueba de primera mano: algo que se usó, se midió o se ejecutó",
  "una contradicción entre fuentes que este artículo resuelve y las demás dejan abierta",
] as const;

export interface RevisionDiferencial {
  ok: boolean;
  /** Qué falta, dicho para que se pueda arreglar. */
  motivo?: string;
  /** Los dominios de competidores que el texto nombra. */
  competidores: string[];
}

// Un dominio real citado como competidor. Se exige al menos uno porque es la
// prueba mínima de que alguien miró la SERP: no se puede escribir "gomega.ai
// abre con 13 herramientas" sin haber abierto el resultado.
const DOMINIO = /\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ai|io|co|net|org|es|mx|dev|app|blog|studio))\b/gi;

// Lo que se escribe cuando no se hizo el trabajo. Si el diferencial dice solo
// esto, no dice nada: son las mismas generalidades que la compuerta ya prohíbe
// dentro del artículo, y aquí hacen el mismo daño.
const RELLENO =
  /\b(m[áa]s complet\w+|mejor escrit\w+|m[áa]s profundo|m[áa]s [úu]til|mayor calidad|m[áa]s actualizad\w+|m[áa]s claro|enfoque [úu]nico|perspectiva [úu]nica|more comprehensive|better written|higher quality|more in.?depth|unique perspective|more useful|deeper dive)\b/i;

const LARGO_MINIMO = 120;

/**
 * ¿El diferencial está de verdad relleno, o es una casilla marcada?
 *
 * El riesgo de una regla así es que se convierta en trámite. Por eso no basta
 * con que exista: tiene que nombrar competidores concretos y no puede consistir
 * en decir que este artículo es "más completo", que es lo que se escribe
 * exactamente cuando no se ha mirado nada.
 */
export function revisarDiferencial(texto: string | undefined): RevisionDiferencial {
  const t = (texto ?? "").trim();

  if (!t) {
    return {
      ok: false,
      competidores: [],
      motivo:
        "No dice qué aporta este artículo frente a los que ya rankean. Hay que mirar la SERP de la keyword, " +
        "nombrar los tres primeros resultados y decir en qué se aparta este.",
    };
  }

  if (t.length < LARGO_MINIMO) {
    return {
      ok: false,
      competidores: [],
      motivo: `El diferencial tiene ${t.length} caracteres y hacen falta ${LARGO_MINIMO}. Con menos no cabe nombrar a los competidores y decir en qué se difiere.`,
    };
  }

  const competidores = [...new Set([...t.matchAll(DOMINIO)].map((m) => m[1].toLowerCase()))];
  if (competidores.length === 0) {
    return {
      ok: false,
      competidores,
      motivo:
        "No nombra ni un competidor concreto. Sin decir QUÉ hay arriba y qué promete, no hay forma de saber " +
        "si este artículo se aparta de ellos o los repite.",
    };
  }

  const vago = t.match(RELLENO);
  // Solo molesta si el relleno es TODO lo que hay. Decir "más completo que X,
  // porque incluye el precio en pesos" es legítimo: lo que no vale es quedarse
  // en la primera mitad.
  if (vago && t.length < LARGO_MINIMO * 2) {
    return {
      ok: false,
      competidores,
      motivo: `"${vago[0]}" no es un diferencial: es lo que se escribe cuando no se ha mirado nada. Di la cosa concreta que este artículo tiene y los otros no.`,
    };
  }

  return { ok: true, competidores };
}

/** El bloque que va dentro del prompt de escritura. */
export const INSTRUCCION_DIFERENCIAL = `ANTES DE ESCRIBIR, mira la SERP.

Busca en la web la keyword principal y abre los tres primeros resultados. Luego decide qué va a tener este artículo que ellos no tengan. Vale una de estas tres cosas, no una cuarta:

${FORMAS_DE_APORTAR.map((f, i) => `${i + 1}. ${f}`).join("\n")}

"Más completo", "mejor escrito", "más profundo" y "enfoque único" NO son diferenciales: son lo que se escribe cuando no se ha mirado nada.

Formato de salida, OBLIGATORIO. Empieza tu respuesta con la línea exacta
<<<DIFERENCIAL>>>
y debajo, en 2 a 4 frases: qué prometen los tres primeros resultados (NOMBRA sus dominios) y qué tiene este artículo que ellos no. Después la línea exacta
<<<ARTICULO>>>
y a continuación el artículo en Markdown.`;

/**
 * Por qué esta keyword y no otra.
 *
 * El sistema elegía keywords y no explicaba la elección en ninguna parte: la
 * pantalla enseñaba la palabra y quien la leía tenía que fiarse. Con esto, cada
 * artículo lleva escrito qué busca la gente que la escribe y por qué esta
 * página puede responderle mejor que las que ya están.
 *
 * Va aparte del diferencial a propósito: el diferencial habla del ARTÍCULO
 * frente a los de arriba, esto habla de la BÚSQUEDA. Un artículo puede aportar
 * algo nuevo sobre una consulta que no busca nadie.
 */
export const INSTRUCCION_KEYWORD = `Justifica también la keyword. Después del bloque anterior, escribe la línea exacta
<<<KEYWORD>>>
y debajo, en 2 o 3 frases: qué está intentando resolver quien escribe esa búsqueda (la intención, no la definición), y por qué este artículo puede responderle mejor que lo que hay hoy en la primera página. Si la keyword tiene variantes que la gente usa más, dilo.`;

/** Saca el diferencial, la justificación de la keyword y el artículo. */
export function partir(raw: string): {
  diferencial?: string;
  keyword?: string;
  markdown: string;
} {
  // Cada sección va de su marcador al SIGUIENTE, sea cual sea el orden.
  //
  // Antes se daba por hecho que el artículo iba el último y se tomaba como
  // cuerpo "todo lo que hay después de <<<ARTICULO>>>". El agente no siempre
  // respeta ese orden: en la corrida del 1 de septiembre puso <<<KEYWORD>>>
  // DESPUÉS del artículo, y el razonamiento sobre la búsqueda —"The searcher is
  // an SMB owner..."— se publicó en vivo, dentro del post, en faststrat.ai.
  //
  // Un formato que solo funciona si el modelo ordena las secciones como
  // esperamos no es un formato, es una apuesta. Ordenando por posición, el
  // orden deja de importar.
  const marcas = (
    [
      ["diferencial", "<<<DIFERENCIAL>>>"],
      ["keyword", "<<<KEYWORD>>>"],
      ["articulo", "<<<ARTICULO>>>"],
    ] as const
  )
    .map(([nombre, etiqueta]) => ({ nombre, etiqueta, en: raw.indexOf(etiqueta) }))
    .filter((m) => m.en !== -1)
    .sort((a, b) => a.en - b.en);

  const art = marcas.find((m) => m.nombre === "articulo");
  // Sin el marcador del artículo no se sabe dónde acaba el razonamiento del
  // agente y dónde empieza el texto. Ya se publicaron tres posts con el plan
  // del modelo dentro por saltarse esto, uno de ellos con status: publish.
  if (!art) return { markdown: "" };

  /** El trozo que va de un marcador al siguiente. */
  const trozo = (nombre: string): string | undefined => {
    const i = marcas.findIndex((m) => m.nombre === nombre);
    if (i === -1) return undefined;
    const desde = marcas[i].en + marcas[i].etiqueta.length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].en : raw.length;
    const t = raw.slice(desde, hasta).trim();
    return t || undefined;
  };

  const markdown = (trozo("articulo") ?? "")
    .replace(/^```(?:markdown|md)?/i, "")
    .replace(/```$/, "")
    .trim()
    // El agente repite las etiquetas del prompt como primera línea del cuerpo.
    //
    // Salió en la primera corrida real: el artículo empezaba con
    // "**Título:** Customer Acquisition Cost: Formula, Examples". Eso se
    // publica como primer párrafo Y se convierte en la meta description, que es
    // lo que Google enseña bajo el resultado. Se quitan tantas como haya:
    // suelen venir en bloque (Título, Keyword, Idioma).
    .replace(
      /^(?:\*\*)?(?:t[íi]tulo|title|keyword|idioma|language|audiencia|audience)(?:\*\*)?\s*:.*(?:\r?\n)+/gi,
      "",
    )
    .trim();

  return { diferencial: trozo("diferencial"), keyword: trozo("keyword"), markdown };
}
