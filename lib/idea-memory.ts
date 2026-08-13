import { getIdeaBatches } from "@/lib/ideas";
import { getBlogPosts } from "@/lib/blog";

// La memoria de lo que ya se propuso alguna vez.
//
// Sin esto, la tanda semanal proponía las mismas diez ideas cada vez. No era un
// fallo del agente: /api/weekly no leía NADA de lo que ya existía, ni tandas
// anteriores ni artículos escritos, así que recibía las mismas señales de
// Search Console y devolvía la misma respuesta. Entrada igual, salida igual.
//
// Y las señales no se mueven casi nunca: la ventana es de 90 días, así que un
// artículo publicado ayer no cambia nada perceptible. Esperar variedad de un
// input estable es esperar que el modelo se contradiga solo.
//
// Por eso la memoria no basta con evitar repetidos: hace falta pedir
// explícitamente otro ÁNGULO sobre el mismo tema. Un tema no se agota con un
// artículo; se agota cuando ya cubriste la guía, la comparativa, el caso
// contrario, el segmento y la objeción.

export interface Memoria {
  /** Todo título propuesto alguna vez, de todas las tandas. */
  titulos: string[];
  /** Los artículos que llegaron a escribirse. */
  escritos: string[];
  /** Las keywords ya trabajadas: dos títulos distintos sobre la misma keyword
   *  compiten entre sí, que es peor que no escribir el segundo. */
  keywords: string[];
}

export function leerMemoria(): Memoria {
  const batches = getIdeaBatches();
  const ideas = batches.flatMap((b) => b.ideas ?? []);
  return {
    titulos: [...new Set(ideas.map((i) => i.title).filter(Boolean))],
    escritos: [...new Set(getBlogPosts().map((p) => p.title).filter(Boolean))],
    keywords: [...new Set(ideas.map((i) => i.primaryKeyword).filter(Boolean).map((k) => k.toLowerCase()))],
  };
}

/** Normaliza un título para comparar: el agente repite el mismo tema con otra
 *  puntuación y así pasaría por nuevo. */
const clave = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort()
    .join(" ");

/**
 * Descarta las repetidas comparando contra la memoria.
 *
 * Mecánico a propósito: la instrucción "no repitas" ya está en el prompt y aun
 * así el agente repite. Una regla en un prompt es una intención; esto es la
 * garantía. Devuelve también las descartadas para poder decir cuántas fueron,
 * porque "salieron las mismas" sin número no se puede diagnosticar.
 */
export function descartarRepetidas<T extends { title: string; primaryKeyword?: string }>(
  propuestas: T[],
  memoria: Memoria,
): { nuevas: T[]; descartadas: T[] } {
  const vistos = new Set([...memoria.titulos, ...memoria.escritos].map(clave));
  const kws = new Set(memoria.keywords);

  const nuevas: T[] = [];
  const descartadas: T[] = [];
  for (const p of propuestas) {
    const repetida =
      vistos.has(clave(p.title)) ||
      (p.primaryKeyword ? kws.has(p.primaryKeyword.toLowerCase()) : false);
    if (repetida) {
      descartadas.push(p);
    } else {
      nuevas.push(p);
      vistos.add(clave(p.title));
      if (p.primaryKeyword) kws.add(p.primaryKeyword.toLowerCase());
    }
  }
  return { nuevas, descartadas };
}

/**
 * El bloque que se le pasa al agente: qué ya existe y qué hacer cuando el tema
 * es bueno pero ya está cubierto.
 *
 * Se limita a 60 títulos porque a partir de ahí el prompt pesa más que la
 * señal, y los más recientes son los que más importa no repetir.
 */
export function bloqueDeMemoria(m: Memoria): string {
  const lista = (xs: string[]) => xs.slice(0, 60).map((t) => `- ${t}`).join("\n");

  return `YA PROPUESTO ANTES (no lo repitas):
${lista(m.titulos) || "- (nada todavía)"}

YA ESCRITO Y PUBLICADO (no lo repitas):
${lista(m.escritos) || "- (nada todavía)"}

CUANDO EL TEMA YA ESTÉ CUBIERTO:
Las señales de Search Console son de 90 días y casi no se mueven de una semana a otra, así que si te limitas a mirarlas devolverás lo mismo que la última vez. Un tema no se agota con un artículo: cámbiale el ÁNGULO.

Ángulos válidos sobre un tema ya cubierto:
- Comparativa frente a la alternativa concreta, si lo que hay es una guía.
- El caso contrario: cuándo NO conviene, cuándo es mala idea, qué falla.
- Un segmento concreto: un país, un tamaño de empresa, un sector, un presupuesto.
- La objeción: lo que dice quien no está de acuerdo, y por qué.
- El paso siguiente: qué se hace después de lo que ya explicamos.
- Precios y números reales, si lo que hay es conceptual.

En "rationale" di explícitamente contra qué título anterior te estás diferenciando y en qué. Si no puedes diferenciarlo, no propongas ese tema: propón otro.`;
}
