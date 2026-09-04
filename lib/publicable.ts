import { runClaude } from "@/lib/claude";
import { runQa, type HouseRules, type QaResult } from "@/lib/qa";
import { REGLAS_DE_CASA } from "@/lib/house-rules";
import { CLIENTE } from "@/lib/cliente";
import { INSTRUCCION_LEGIBILIDAD } from "@/lib/legibilidad";

// Dejar un texto dentro de las reglas ANTES de guardarlo, no después.
//
// Existía dentro de /api/blog/generate y solo ahí. Las otras dos rutas que
// escriben contenido, optimize y edit, guardaban lo que devolviera el agente
// sin comprobar nada. El coste salió medido: el artículo que produjo el
// optimizador llegó con 47 bloqueos, porque nunca pasó por ninguna compuerta.
//
// Ahora vive en un sitio común y las tres lo usan. La regla de fondo: si una
// ruta escribe contenido, pasa por aquí. No es opcional y no depende de que
// quien añada la siguiente ruta se acuerde.
//
// Sobre el bucle: antes era UNA pasada. Si tras corregir quedaban bloqueos, se
// guardaba igual. Ahora insiste mientras mejore, con tope, porque un corrector
// que se llama a sí mismo sin límite es una factura abierta.

export const CASA: HouseRules = {
  noEmDash: true,
  urlProducto: CLIENTE.dominioApp,
  // Las dos salen de la configuración del cliente, no de aquí: son decisiones
  // de marca y de sector, y cambian con cada cliente al que se replique esto.
  categoriaProhibida: CLIENTE.categoriaProhibida,
  fuentesPrimarias: CLIENTE.fuentesPrimarias,
};

/** Rayas largas: determinista, sin criterio, y la causa número uno de bloqueos. */
export const barrerRayas = (t: string) =>
  t
    .replace(/\s*—\s*$/gm, ".")
    .replace(/\s+—\s+/g, ", ")
    .replace(/—/g, ", ");

const SISTEMA = `Eres el editor que deja un artículo dentro de las reglas de publicación. Arreglas cada hallazgo con el mínimo cambio posible: no es una reescritura.

Ante una cifra sin fuente: PRIMERO búscala, que tienes WebSearch. Si la encuentras, enlázala y CONSERVA la cifra. Solo si no existe, sustitúyela por un hecho concreto y verificable del mismo tema, nunca por una generalidad: "muchas empresas", "la mayoría", "significativamente" están prohibidos como reemplazo. Borrar especificidad es una regresión, no un arreglo.

Nunca inventes un enlace, no atribuyas el dato a quien no lo publicó, y no enlaces a una página que no lo contiene.

${REGLAS_DE_CASA}

${INSTRUCCION_LEGIBILIDAD}

Formato de salida, OBLIGATORIO: empieza tu respuesta con la línea exacta
<<<ARTICULO>>>
y a continuación el cuerpo en Markdown, hasta el final. Si escribes cualquier explicación o plan, ponlo ANTES de esa línea; todo lo anterior se descarta.`;

/**
 * Saca el artículo de la respuesta.
 *
 * El marcador hace falta porque el agente a veces contesta con su plan antes
 * del texto, y eso se guardaba COMO CUERPO DEL ARTÍCULO: tres posts acabaron
 * con el razonamiento del modelo dentro, uno de ellos a un clic de publicarse.
 * Sin marcador se devuelve null y no se toca nada.
 */
function extraer(raw: string): string | null {
  const MARCA = "<<<ARTICULO>>>";
  const i = raw.indexOf(MARCA);
  if (i === -1) return null;
  return raw
    .slice(i + MARCA.length)
    .trim()
    .replace(/^```(?:markdown|md)?/i, "")
    .replace(/```$/, "")
    .trim();
}

const listar = (qa: QaResult) =>
  qa.blocking.map((f) => `- [${f.rule}] ${f.detail}${f.excerpt ? ` en: "${f.excerpt}"` : ""}`).join("\n");

/**
 * Hallazgos que el corrector NO puede arreglar reescribiendo el cuerpo.
 *
 * `no-differentiator` no habla del texto: dice que nadie miró la SERP antes de
 * escribir. El corrector solo devuelve el artículo, así que por mucho que lo
 * reescriba el hallazgo sigue ahí. Sin esta lista, cada artículo sin
 * diferencial gastaba las dos pasadas del bucle para acabar exactamente igual.
 */
const NO_LO_ARREGLA_EDITANDO = new Set(["no-differentiator"]);

const hayAlgoQueEditar = (qa: QaResult) =>
  qa.blocking.some((f) => !NO_LO_ARREGLA_EDITANDO.has(f.rule));

/** Cuánto del artículo tiene que sobrevivir a una corrección. */
const MINIMO_QUE_SOBREVIVE = 0.75;

/**
 * ¿La corrección arregló el artículo, o se lo llevó por delante?
 *
 * Medido sobre un caso real: corregir 5 cifras sin fuente dejó el artículo en
 * 1.151 palabras de 1.951, y con 3 secciones de las 7 que tenía. Cuatro
 * secciones enteras desaparecidas. Y la compuerta lo dio por bueno, porque solo
 * mira la forma: sin cifras huérfanas, con enlaces, con encabezados. Un
 * artículo al que le falta el 60% cumple las tres cosas.
 *
 * "El mínimo cambio posible" está en el prompt desde el principio, pero un
 * prompt es una intención. Esto es la comprobación.
 */
function seLoLlevoPorDelante(antes: string, despues: string): string | null {
  const palabras = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const secciones = (t: string) => (t.match(/^##\s+/gm) ?? []).length;

  const pAntes = palabras(antes);
  const pDespues = palabras(despues);
  if (pAntes > 0 && pDespues / pAntes < MINIMO_QUE_SOBREVIVE) {
    return `perdió ${pAntes - pDespues} palabras de ${pAntes} (queda el ${Math.round((pDespues / pAntes) * 100)}%)`;
  }

  // Las secciones importan aparte del recuento: se puede perder poco texto y
  // aun así borrar la sección que respondía a la mitad de la intención.
  const sAntes = secciones(antes);
  const sDespues = secciones(despues);
  if (sAntes >= 3 && sDespues < sAntes - 1) {
    return `borró ${sAntes - sDespues} secciones de ${sAntes}`;
  }

  return null;
}

/**
 * El último recurso: quitar la cifra que no se pudo respaldar.
 *
 * Se llega aquí cuando el corrector ya BUSCÓ la fuente y no la encontró. La
 * alternativa era dejar el artículo bloqueado para siempre: escrito, pagado, y
 * sin poder salir. Un artículo sin ese número se publica; con él inventado, no.
 *
 * LO QUE NO PUEDE HACER, y es la mitad del trabajo: cambiar "el 12% de las
 * PYMEs" por "muchas PYMEs" no es quitar la cifra, es esconderla. Deja la frase
 * afirmando lo mismo sin nada que la respalde y encima sin nada que citar. Si
 * la frase no se sostiene sin el número, la frase se va entera.
 */
const QUITAR_CIFRAS = `Estas cifras no tienen fuente pública y ya se buscó: no la hay. Quítalas para que el artículo pueda publicarse.

CÓMO SE QUITA UNA CIFRA:
- Reescribe la frase explicando el MECANISMO en vez del número. "El coste lo dominan las horas de configuración, no la licencia" dice algo útil; "el 12% del presupuesto" sin fuente, no.
- Si la frase entera existía solo para soltar ese dato, bórrala. Un párrafo menos es mejor que un párrafo que afirma algo que nadie puede comprobar.

PROHIBIDO, y es lo importante:
- Sustituirla por una vaguedad: "muchas", "la mayoría", "un porcentaje significativo", "gran parte". Eso no quita la cifra, la esconde: la frase sigue afirmando lo mismo, ya sin nada que la respalde y sin nada que un lector recuerde.
- Cambiar el número por otro que te parezca razonable. Un rango inventado es una estadística inventada con otro nombre.
- Tocar las cifras que SÍ tienen su fuente enlazada al lado. Esas se quedan como están.

No cambies el tema, el idioma ni la estructura. Devuelve el artículo entero.`;

export interface ResultadoPublicable {
  markdown: string;
  qa: QaResult;
  /** Cuántas veces se llamó al agente. Cero significa que el barrido bastó. */
  pasadas: number;
  /** Lo que quedó sin resolver, dicho en vez de callado. */
  pendientes: string[];
  /**
   * Cifras que hubo que quitar porque no se les encontró fuente.
   *
   * Se dice, no se calla. Quitar un dato cambia lo que el artículo afirma, y
   * quien lo publica tiene derecho a saber qué desapareció.
   */
  quitadas: string[];
  /**
   * Correcciones descartadas por mutilar el artículo.
   *
   * Se dice: si el artículo sigue bloqueado y esto tiene contenido, la causa no
   * es que el problema sea irresoluble, sino que el agente intentó resolverlo
   * borrando medio texto y se le paró.
   */
  destrozos: string[];
  /**
   * Por qué falló el agente, si falló.
   *
   * Antes el error se perdía en un catch vacío y el resultado decía "0 pasadas"
   * después de cinco minutos: indistinguible de no haberlo intentado. Un límite
   * de sesión, un corte de red y un error de programación necesitan respuestas
   * distintas, y sin el mensaje no se sabe cuál es.
   */
  fallos: string[];
}

/**
 * Deja el markdown lo más limpio posible y DICE lo que no pudo arreglar.
 *
 * Nunca lanza: un artículo con bloqueos se corrige después, uno perdido por una
 * excepción se pierde entero.
 */
export async function dejarPublicable(
  title: string,
  markdown: string,
  opciones: {
    metaDescription?: string;
    maxPasadas?: number;
    differentiator?: string;
    /**
     * Exigir el diferencial. Lo enciende quien ESCRIBE algo nuevo.
     *
     * Apagado por defecto a propósito: el corrector trabaja sobre los 21
     * artículos que ya existen y ninguno lo tiene. Encenderlo para todos los
     * llamantes convertiría la compuerta en un muro que dejaría el corrector
     * inservible, y un muro acaba rodeándose.
     */
    exigirDiferencial?: boolean;
    /** El idioma en el que se pidió, para comprobar que el cuerpo lo cumple. */
    lang?: string;
  } = {},
): Promise<ResultadoPublicable> {
  const max = opciones.maxPasadas ?? 2;
  const evaluar = (t: string) =>
    runQa({
      title,
      metaDescription: opciones.metaDescription,
      markdown: t,
      house: CASA,
      differentiator: opciones.differentiator,
      exigirDiferencial: opciones.exigirDiferencial === true,
      lang: opciones.lang,
    });

  // El barrido va primero: de 306 bloqueos medidos, 203 eran rayas largas.
  // Gastar una llamada al agente en sustituir un carácter es lo que agotaba el
  // límite de sesión antes de llegar a lo que sí necesita criterio.
  let texto = CASA.noEmDash ? barrerRayas(markdown) : markdown;
  let qa = evaluar(texto);
  let pasadas = 0;
  /** Correcciones descartadas por mutilar el artículo. Se cuentan y se dicen. */
  const destrozos: string[] = [];
  /** Por qué reventó el agente, si reventó. Un fallo mudo no se puede diagnosticar. */
  const fallos: string[] = [];

  while (!qa.ok && pasadas < max && hayAlgoQueEditar(qa)) {
    let siguiente: string | null = null;
    try {
      const raw = await runClaude({
        model: "sonnet",
        system: SISTEMA,
        allowedTools: ["WebSearch", "WebFetch"],
        prompt: `Título: "${title}"

BLOQUEOS (hay que resolver todos):
${listar(qa)}
${
  // Los avisos van también, pero como segunda prioridad.
  //
  // El corrector solo recibía los bloqueos, así que los hallazgos de
  // legibilidad no le llegaban nunca: son avisos, y los avisos no entraban en
  // el prompt. Como el bucle ya está pagado cuando hay algo que bloquea,
  // arreglar de paso el estilo sale gratis. Lo que no se hace es lanzar una
  // pasada SOLO por estilo: eso costaría una llamada por artículo para algo
  // que no impide publicar.
  qa.warnings.length
    ? `\nADEMÁS, si puedes arreglarlos sin forzar el texto (segunda prioridad, nunca a costa de un bloqueo):\n${qa.warnings
        .map((f) => `- [${f.rule}] ${f.detail}${f.excerpt ? ` en: "${f.excerpt}"` : ""}`)
        .join("\n")}`
    : ""
}

ARTÍCULO:
---
${texto}
---`,
      });
      siguiente = extraer(raw);
    } catch (e) {
      // Se APUNTA por qué falló. Antes el catch se lo tragaba y el resultado
      // decía "0 pasadas del agente" tras cinco minutos y medio: parecía que no
      // había intentado nada, cuando había intentado y reventado. Sin el motivo
      // no se puede distinguir un límite de sesión de un fallo de red o de un
      // error de programación.
      fallos.push(`corrigiendo: ${(e as Error).message}`.slice(0, 200));
      break;
    }

    pasadas++;
    if (!siguiente) break;

    const limpio = CASA.noEmDash ? barrerRayas(siguiente) : siguiente;

    // Una corrección que destroza el artículo se descarta, aunque deje cero
    // bloqueos. Cero bloqueos sobre un artículo mutilado no es un artículo
    // publicable: es otro artículo, más corto y peor.
    const destrozo = seLoLlevoPorDelante(texto, limpio);
    if (destrozo) {
      destrozos.push(destrozo);
      break;
    }

    const nuevoQa = evaluar(limpio);

    // Solo se acepta si MEJORA. Un "arreglo" que empeora se descarta: es
    // preferible un borrador con hallazgos conocidos a uno roto de otra manera.
    if (nuevoQa.blocking.length >= qa.blocking.length) break;

    texto = limpio;
    qa = nuevoQa;
  }

  // Último recurso: si lo único que bloquea son cifras sin fuente, se quitan.
  //
  // Antes el artículo se quedaba aquí para siempre: escrito, pagado y sin poder
  // salir. El corrector ya buscó la fuente en las pasadas anteriores y no la
  // encontró, así que insistir no va a cambiar nada; lo que queda es decidir
  // entre publicarlo sin ese número o no publicarlo.
  const quitadas: string[] = [];
  const soloCifras = qa.blocking.length > 0 && qa.blocking.every((f) => f.rule === "figure-without-source");

  if (soloCifras) {
    try {
      const raw = await runClaude({
        model: "sonnet",
        system: SISTEMA,
        prompt: `Título: "${title}"

${QUITAR_CIFRAS}

CIFRAS A QUITAR:
${listar(qa)}

ARTÍCULO:
---
${texto}
---`,
      });
      const limpio = extraer(raw);
      if (limpio) {
        const sinRayas = CASA.noEmDash ? barrerRayas(limpio) : limpio;
        // Aquí el suelo es más bajo: quitar cifras SÍ borra texto a propósito,
        // así que se permite perder más. Lo que no se permite es que se lleve
        // el artículo entero.
        const destrozo = seLoLlevoPorDelante(texto, sinRayas);
        const nuevoQa = evaluar(sinRayas);
        // Solo se acepta si de verdad quedan MENOS bloqueos. Un "arreglo" que
        // no arregla se descarta, como en el resto del bucle.
        if (destrozo) {
          destrozos.push(`al quitar cifras: ${destrozo}`);
        } else if (nuevoQa.blocking.length < qa.blocking.length) {
          quitadas.push(...qa.blocking.map((f) => f.detail));
          texto = sinRayas;
          qa = nuevoQa;
          pasadas++;
        }
      }
    } catch (e) {
      // Igual que arriba: el motivo se apunta, no se pierde.
      fallos.push(`quitando cifras: ${(e as Error).message}`.slice(0, 200));
    }
  }

  return {
    markdown: texto,
    qa,
    pasadas,
    pendientes: qa.blocking.map((f) => f.detail),
    quitadas,
    destrozos,
    fallos,
  };
}
