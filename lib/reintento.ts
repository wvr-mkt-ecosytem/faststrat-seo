// Qué se arregla editando y qué hay que volver a pedir.
//
// POR QUÉ EXISTE: el sistema solo sabía PARCHEAR. Cuando la compuerta
// bloqueaba, el corrector recibía la lista de bloqueos y editaba el texto. Eso
// funciona para "esta cifra no tiene fuente" y no funciona para "las 2.221
// palabras están en el idioma equivocado": pedirle a un parcheador que traduzca
// un artículo entero desde un prompt que dice "resuelve estos bloqueos" es
// pedirle otra cosa, y encima el suelo anti-mutilación puede tumbar el
// resultado por haber cambiado demasiado.
//
// Hay fallos que no se arreglan editando: se arreglan volviendo a pedirlo.
//
// El tope es UNO. Estos son fallos de muestreo, no de configuración: si el
// agente devuelve basura dos veces seguidas con el mismo prompt, el problema no
// es la suerte y reintentar solo quema cupo.

import { runQa, type QaResult } from "@/lib/qa";
import { CASA } from "@/lib/publicable";

/**
 * Reglas cuyo remedio es regenerar, no editar.
 *
 * `wrong-language` está aquí porque afecta a todo el texto a la vez.
 * `no-differentiator` porque el diferencial se decide al escribir: no se puede
 * añadir a posteriori sin inventarlo.
 */
export const SE_ARREGLA_REGENERANDO = new Set(["wrong-language", "no-differentiator"]);

export type Defecto = { regla: string; motivo: string };

/**
 * Lo que se comprueba NADA MÁS generar, antes de gastar en corregir o publicar.
 *
 * El analista corrió 12,5 minutos y devolvió un JSON inválido; el escritor
 * devolvió 2.221 palabras en el idioma equivocado. Los dos defectos se ven al
 * segundo de recibir la respuesta. Mirarlos antes de la parte cara es la
 * diferencia entre reintentar y tirar el trabajo.
 */
export function defectoDeRaiz(
  markdown: string,
  contexto: { lang?: string; title?: string; minimoPalabras?: number },
): Defecto | null {
  const texto = (markdown ?? "").trim();

  if (!texto) return { regla: "vacio", motivo: "el agente no devolvió artículo" };

  // Los marcadores del formato no deberían sobrevivir al troceado. Si están, es
  // que el agente los escribió de una forma que `partir` no reconoció, y lo que
  // queda no es el artículo sino la respuesta cruda.
  if (/<<<[A-Z]+>>>/.test(texto)) {
    return { regla: "marcadores-sueltos", motivo: "quedaron marcadores del formato dentro del texto" };
  }

  const palabras = texto.split(/\s+/).filter(Boolean).length;
  const minimo = contexto.minimoPalabras ?? 400;
  if (palabras < minimo) {
    return {
      regla: "demasiado-corto",
      motivo: `${palabras} palabras: por debajo de ${minimo}, no es un artículo sino un resumen`,
    };
  }

  // Las reglas de la compuerta que no se arreglan editando. Se corre la
  // compuerta entera y se miran solo esas: reimplementar aquí la detección de
  // idioma habría creado una segunda versión que se separa de la primera.
  const qa: QaResult = runQa({
    title: contexto.title,
    markdown: texto,
    house: CASA,
    lang: contexto.lang,
    // El diferencial se comprueba aparte, con su propio dato; aquí solo
    // interesan los defectos que se ven en el texto.
    exigirDiferencial: false,
  });
  const grave = qa.blocking.find((f) => SE_ARREGLA_REGENERANDO.has(f.rule));
  if (grave) return { regla: grave.rule, motivo: grave.detail };

  return null;
}

/**
 * Pide algo al agente y, si sale mal de raíz, lo pide UNA vez más.
 *
 * `generar` devuelve el resultado; `revisar` dice qué está mal, o null si está
 * bien. Lo que se reintenta es la GENERACIÓN entera, no una corrección sobre lo
 * anterior: volver a partir de una salida mala es lo que la arrastra.
 */
export async function conUnReintento<T>(
  generar: (intento: number, defectoAnterior: Defecto | null) => Promise<T>,
  revisar: (r: T) => Defecto | null,
): Promise<{ resultado: T; intentos: number; descartado: Defecto | null }> {
  let anterior: Defecto | null = null;

  for (let intento = 1; intento <= 2; intento++) {
    const r = await generar(intento, anterior);
    const defecto = revisar(r);
    if (!defecto) return { resultado: r, intentos: intento, descartado: anterior };
    if (intento === 2) {
      // Se devuelve lo segundo aunque siga mal: la compuerta decide si se
      // publica. Devolver null aquí perdería un artículo que quizá solo tiene
      // un bloqueo menor además del grave.
      return { resultado: r, intentos: 2, descartado: anterior };
    }
    anterior = defecto;
  }

  throw new Error("inalcanzable");
}
