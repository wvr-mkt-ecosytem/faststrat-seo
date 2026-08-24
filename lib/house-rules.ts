import { CLIENTE } from "@/lib/cliente";

// Las reglas de publicación, escritas para que las lea quien escribe.
//
// Existían solo dentro de lib/qa.ts, en forma de expresiones regulares. Eso
// sirve para comprobar y no sirve para redactar: quien escribía no las conocía,
// así que cada artículo nacía bloqueado y había que corregirlo después. Los 17
// artículos del blog estaban los 17 bloqueados, con 440 hallazgos entre todos,
// y casi todos por cosas que se evitan sabiéndolas de antemano.
//
// Este texto va DENTRO del prompt de escritura. La comprobación mecánica sigue
// existiendo y sigue mandando: una regla en un prompt es una intención, no una
// garantía. Pero pedirle a alguien que acierte sin decirle las reglas es
// garantizar que falle.
//
// SIN MARCA. Ninguna regla nombra a un cliente concreto: el dominio propio
// entra por parámetro. Son reglas de SEO y de GEO, que es lo que viaja de un
// cliente a otro; lo que no viaja son los nombres y el manual de estilo. Esa
// separación ya nos costó una vez: la primera versión de la compuerta trajo el
// "prohibido el em dash" del manual de OTRO cliente y bloqueó los 16 posts de
// este, que los usaba con normalidad. Por eso la tipografía va aparte, en
// HouseRules de qa.ts, y aquí solo está lo universal.
//
// Si cambia una regla en qa.ts, cambia aquí. Están separadas porque una es
// ejecutable y la otra legible, no porque sean cosas distintas.

export interface ClienteReglas {
  /** El dominio propio del cliente, sin protocolo. Ej: "faststrat.ai". */
  dominio: string;
  /** Si el manual de marca prohíbe la raya larga. Es decisión de marca, no de SEO. */
  sinRayaLarga?: boolean;
  /** Lo que el sitio añade al título en el <title>. Se descuenta del límite. */
  sufijoTitulo?: string;
}

/** Donde corta Google. Es del buscador, no del cliente. */
export const LIMITE_GOOGLE = 60;
const LIMITE_TITULO = LIMITE_GOOGLE;

/**
 * Cuánto puede medir el título ANTES del sufijo que añade el sitio.
 *
 * Se exporta porque la ruta de generación tenía el resultado escrito a mano
 * (`const LIMITE = 45`), calculado para un sufijo de 15 caracteres. Con otro
 * cliente, o con un cambio de sufijo, el escritor apuntaba a un largo y la
 * compuerta medía otro: títulos bloqueados sin causa visible en el prompt.
 */
export const LIMITE_TITULO_UTIL = Math.max(20, LIMITE_GOOGLE - CLIENTE.sufijoTitulo.length);

/**
 * Las reglas, ya rellenas para un cliente.
 *
 * Se genera en vez de guardarse como texto fijo para que el límite de título
 * salga de una cuenta y no de un número copiado: el sitio añade un sufijo al
 * <title> y ese sufijo se cobra siempre. Escribir "45 caracteres" a mano deja
 * de ser cierto el día que alguien cambia el sufijo, y nadie se entera.
 */
export function reglasPara({ dominio, sinRayaLarga, sufijoTitulo = "" }: ClienteReglas): string {
  const margen = Math.max(20, LIMITE_TITULO - sufijoTitulo.length);

  // La raya larga NO va en el prompt, aunque el cliente la prohíba.
  //
  // Estaba, y decía "es la causa número uno de bloqueos en este cliente", que
  // contradecía la cabecera de este mismo archivo: allí se explica que la
  // regla llegó del manual de OTRO cliente y bloqueó por error los 16 posts de
  // este. Las dos frases no podían ser ciertas a la vez, y quien mantuviera
  // esto se habría fiado de la equivocada. Lo cierto es lo de la cabecera: se
  // importó por error, y solo después el cliente decidió adoptarla.
  //
  // Y aun siendo suya, en el prompt no compra nada. Un barrido determinista
  // sustituye las rayas después de escribir y no puede fallar; pedírselo al
  // modelo falla una de cada treinta veces, que es exactamente lo que pasó en
  // la primera corrección real (29 de 30 arregladas, y una sola bastó para que
  // el artículo siguiera sin publicarse). Ocupaba además el sitio más enfático
  // de la lista, el número 0, para un problema ya resuelto en código.
  const tipografia = "";
  void sinRayaLarga;

  return `REGLAS DE PUBLICACIÓN (una comprobación mecánica bloquea el artículo si no se cumplen; no son sugerencias):
${tipografia}
VERIFICABILIDAD. Es lo que separa una página que Google y los asistentes citan de una que ignoran.

1. Toda cifra lleva su fuente enlazada cerca: en la misma frase o en la siguiente. Porcentajes, importes y números de cuatro dígitos o más.
   - Busca la fuente ANTES de escribir la frase. Tienes búsqueda web: úsala.
   - Si no existe fuente pública para esa cifra, sustitúyela por otro hecho concreto y verificable del mismo tema, NUNCA por una generalidad. "Muchas empresas", "la mayoría", "significativamente" no son un arreglo: dejan la página sin nada que un lector recuerde ni un asistente cite.
   - Esta regla no es una excusa para escribir sin números. Un artículo sin una sola cifra con fuente no le da a nadie nada que citar, y lo cita quien sí la tiene. Apunta a tres como mínimo.
   - Inventar una fuente, o enlazar a una página que no contiene la cifra, es peor que no ponerla: se descubre y cuesta la credibilidad de todo lo demás.
   - Los ejemplos hipotéticos van marcados como tales ("supongamos que un cliente deja 50 dólares"), así no se leen como afirmaciones sobre el mundo.

2. Al menos un enlace externo real y comprobable a un sitio que no sea ${dominio}. Un artículo sin ninguno no se puede verificar.

3. Los enlaces externos no pueden ser TODOS a ${dominio}. Una cifra cuya única fuente es el propio cliente no está respaldada, está repetida.

4. Nada de citas entre comillas atribuidas a personas o empresas salvo que sean textuales y comprobables. Cambiar una coma le pone a alguien real una frase que no dijo.

5. Nada de marcadores sin resolver: [VERIFICAR], [TBD], [TODO], XX%. Se han publicado dentro de frases terminadas.

ESTRUCTURA. Es lo que permite que un motor entienda la página y que un asistente extraiga la respuesta.

6. Encabezados de H2 a H3 solamente, y sin saltarse niveles (de H2 no se pasa a H4). La jerarquía es el esquema con el que Google entiende la página.

7. Cada H2 responde una pregunta concreta y su primer párrafo la responde entero, antes de desarrollar. Un asistente cita el párrafo que contesta solo; si la respuesta está repartida en cinco, no cita ninguno.

8. Al menos un enlace a una página de ${dominio}. Un artículo que trae tráfico y no lo lleva a ningún sitio no sirve de nada.

9. Título por debajo de ${margen} caracteres${sufijoTitulo ? ` (el sitio añade "${sufijoTitulo}" y Google corta en ${LIMITE_TITULO})` : ` (Google corta en ${LIMITE_TITULO})`}. Meta description entre 120 y 160.

LENGUAJE. Lo que se borra cuando alguien rellena en vez de decir algo.

10. Palabras prohibidas, sin excepción: streamline, leverage, seamless, game-changer, robust, unlock, delve, elevate, harness, tapestry, testament to, "in today's fast-paced world", "it's worth noting", "navigate the landscape".

11. Nada de párrafos que no añadan información. Si una frase se puede borrar sin que se pierda nada, sobra.`;
}

/** Las reglas del cliente configurado. El resto del sistema usa esta constante. */
export const REGLAS_DE_CASA = reglasPara({
  dominio: CLIENTE.dominio,
  sinRayaLarga: CLIENTE.sinRayaLarga,
  sufijoTitulo: CLIENTE.sufijoTitulo,
});
