import { runClaude } from "@/lib/claude";
import { runQa, type HouseRules, type QaResult } from "@/lib/qa";
import { REGLAS_DE_CASA } from "@/lib/house-rules";
import { CLIENTE } from "@/lib/cliente";

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

export const CASA: HouseRules = { noEmDash: true, urlProducto: CLIENTE.dominioApp };

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

export interface ResultadoPublicable {
  markdown: string;
  qa: QaResult;
  /** Cuántas veces se llamó al agente. Cero significa que el barrido bastó. */
  pasadas: number;
  /** Lo que quedó sin resolver, dicho en vez de callado. */
  pendientes: string[];
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
  opciones: { metaDescription?: string; maxPasadas?: number } = {},
): Promise<ResultadoPublicable> {
  const max = opciones.maxPasadas ?? 2;
  const evaluar = (t: string) =>
    runQa({ title, metaDescription: opciones.metaDescription, markdown: t, house: CASA });

  // El barrido va primero: de 306 bloqueos medidos, 203 eran rayas largas.
  // Gastar una llamada al agente en sustituir un carácter es lo que agotaba el
  // límite de sesión antes de llegar a lo que sí necesita criterio.
  let texto = CASA.noEmDash ? barrerRayas(markdown) : markdown;
  let qa = evaluar(texto);
  let pasadas = 0;

  while (!qa.ok && pasadas < max) {
    let siguiente: string | null = null;
    try {
      const raw = await runClaude({
        model: "sonnet",
        system: SISTEMA,
        allowedTools: ["WebSearch", "WebFetch"],
        prompt: `Título: "${title}"

BLOQUEOS (hay que resolver todos):
${listar(qa)}

ARTÍCULO:
---
${texto}
---`,
      });
      siguiente = extraer(raw);
    } catch {
      // Si el agente falla (límite de sesión, red), se guarda lo que haya.
      break;
    }

    pasadas++;
    if (!siguiente) break;

    const limpio = CASA.noEmDash ? barrerRayas(siguiente) : siguiente;
    const nuevoQa = evaluar(limpio);

    // Solo se acepta si MEJORA. Un "arreglo" que empeora se descarta: es
    // preferible un borrador con hallazgos conocidos a uno roto de otra manera.
    if (nuevoQa.blocking.length >= qa.blocking.length) break;

    texto = limpio;
    qa = nuevoQa;
  }

  return {
    markdown: texto,
    qa,
    pasadas,
    pendientes: qa.blocking.map((f) => f.detail),
  };
}
