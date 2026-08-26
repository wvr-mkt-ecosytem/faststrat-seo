// Detecta que un título nuevo se pisa con uno que ya existe.
//
// Es prevención, y sale barata comparada con la cura. De las ocho acciones del
// informe del 24 de agosto, CINCO son consolidar páginas que compiten entre sí:
// el sistema las escribió y ahora gasta agente en redirigirlas. Los dos casos
// más caros nacieron de aquí:
//
//   /best-seo-tools-small-business-2026/
//   /best-seo-tools-for-small-businesses-in-2026-honest-reviews-p/   (1.064 impr, 0 clics)
//
//   /jasper-vs-copyai-vs-hubspot-ai-2026/
//   /hubspot-breeze-vs-jasper-ai-vs-copy-ai-in-2026-which-ai-tool/   (5.919 impr entre las dos, 0 clics)
//
// Google lo dice de las dos maneras: pide "texto diferente que describa el
// contenido" en cada título, y cuando ve dos páginas propias con la misma
// intención reparte la autoridad entre ambas en vez de concentrarla. Dos URLs
// nuestras en la misma SERP no suman clics: los dividen.
//
// Esto corre en milisegundos, sin agente y sin criterio, ANTES de escribir.

/** Quita acentos, signos y mayúsculas. */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

// Palabras que no distinguen un tema de otro. Sin quitarlas, "the best X for
// small business in 2026" y "best Y for small business 2026" se parecen por el
// relleno y no por el tema.
const VACIAS = new Set(
  ("a an the and or of for to in on at by with from your you is are be as it its this that " +
    "el la los las un una unos unas de del y o para por con en su sus lo que es son como " +
    "guia guide best mejores mejor top complete completa ultimate definitiva " +
    // Interrogativos y auxiliares. Sin ellos, "Small Business Marketing Budget"
    // y "Small Business Marketing Budget: What Percentage Should You Spend"
    // puntuaban 0,44 y pasaban, cuando son el mismo artículo con la pregunta
    // delante. Son las dos URLs que hoy hay que consolidar.
    "what how why when which who should does need must will can may " +
    "que como cuanto cuanta cuantos cuando donde debe deben debes puede pueden")
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Reduce el plural al singular.
 *
 * "Small Business" y "Small Businesses" son la misma palabra para el lector y
 * para Google, y eran palabras distintas para esta función: por eso el par de
 * SEO tools puntuaba 0,38 y se colaba. No se toca lo que acaba en doble ese
 * ("business" no es plural de "busines").
 */
const singular = (t: string) => {
  if (t.endsWith("ss")) return t;
  if (t.endsWith("es") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("s") && t.length > 3) return t.slice(0, -1);
  return t;
};

// Los años NO cuentan como palabra distintiva: "SEO tools 2026" y "SEO tools
// 2025" son el mismo artículo con la fecha cambiada, que es justo lo que Google
// señala como práctica a evitar.
const esAnio = (t: string) => /^(19|20)\d{2}$/.test(t);

/** Las palabras que de verdad dicen de qué va el título. */
export function fondo(titulo: string): Set<string> {
  return new Set(
    plano(titulo)
      .split(/\s+/)
      .filter((t) => t.length > 2 && !VACIAS.has(t) && !esAnio(t))
      .map(singular)
      // El singular puede dejar una palabra vacía al descubierto ("guides").
      .filter((t) => t.length > 2 && !VACIAS.has(t)),
  );
}

/**
 * Cuánto se parecen dos títulos, de 0 a 1.
 *
 * Jaccard sobre las palabras con contenido. Se eligió por encima de la
 * distancia de edición porque el problema real no es escribir el mismo título
 * con una letra distinta: es escribir el mismo TEMA con otras palabras de
 * relleno alrededor.
 */
export function parecido(a: string, b: string): number {
  const A = fondo(a);
  const B = fondo(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return comunes / (A.size + B.size - comunes);
}

export interface Choque {
  /** El título ya existente con el que se pisa. */
  titulo: string;
  slug?: string;
  /** De 0 a 1. */
  parecido: number;
  /** Por qué se marcó: sirve para explicarlo sin que haya que deducirlo. */
  motivo: string;
}

/**
 * A partir de cuánto se considera que dos títulos compiten.
 *
 * Sale de medir, no de elegir un número redondo. Sobre los doce pares reales de
 * scripts/probar-similitud.mjs:
 *
 *   pares legítimos          hasta 0,43   (el peor: precios de WhatsApp vs cómo configurarlo)
 *   canibalizaciones reales  desde 0,57   (la más sutil: las dos de SEO tools)
 *
 * 0,50 cae en medio del hueco, con margen por los dos lados. Si algún día un
 * par legítimo sube de 0,43, el número hay que moverlo con la prueba delante y
 * no a ojo.
 */
export const UMBRAL = 0.5;

/**
 * Busca con qué títulos existentes choca uno nuevo.
 *
 * Devuelve TODOS los choques, ordenados, en vez del peor: dos colisiones
 * distintas se arreglan de dos maneras distintas y quien decide necesita verlas.
 */
export function choques(
  titulo: string,
  existentes: { title: string; slug?: string }[],
  umbral = UMBRAL,
): Choque[] {
  const nuevoFondo = fondo(titulo);
  const salida: Choque[] = [];

  for (const e of existentes) {
    if (!e.title) continue;
    // Un título idéntico no es un parecido: es el mismo artículo otra vez.
    if (plano(e.title).trim() === plano(titulo).trim()) {
      salida.push({ titulo: e.title, slug: e.slug, parecido: 1, motivo: "es el mismo título" });
      continue;
    }

    const p = parecido(titulo, e.title);
    if (p >= umbral) {
      const otroFondo = fondo(e.title);
      const compartidas = [...nuevoFondo].filter((t) => otroFondo.has(t));
      salida.push({
        titulo: e.title,
        slug: e.slug,
        parecido: p,
        motivo: `comparten ${compartidas.length} de las palabras que dan tema: ${compartidas.join(", ")}`,
      });
    }
  }

  return salida.sort((a, b) => b.parecido - a.parecido);
}

/**
 * Filtra una lista de ideas dejando fuera las que chocan entre sí o con lo ya
 * publicado.
 *
 * Se aplica DENTRO de la tanda, no solo contra el histórico: dos ideas de la
 * misma semana pueden pisarse entre ellas, y ese caso no lo atrapa comparar
 * cada una contra lo que ya existe.
 */
export function sinRepetir<T extends { title: string; slug?: string }>(
  ideas: T[],
  yaExisten: { title: string; slug?: string }[],
  umbral = UMBRAL,
): { conservadas: T[]; descartadas: { idea: T; choque: Choque }[] } {
  const conservadas: T[] = [];
  const descartadas: { idea: T; choque: Choque }[] = [];
  const vistas = [...yaExisten];

  for (const idea of ideas) {
    const c = choques(idea.title, vistas, umbral)[0];
    if (c) {
      descartadas.push({ idea, choque: c });
    } else {
      conservadas.push(idea);
      vistas.push({ title: idea.title, slug: idea.slug });
    }
  }

  return { conservadas, descartadas };
}
