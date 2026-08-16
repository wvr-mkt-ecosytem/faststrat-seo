// Los hallazgos que se calculan, no se opinan.
//
// Vienen de un análisis manual de Search Console que encontró cosas que el
// agente no veía, y casi todas eran mecánicas: consultas con forma de prompt,
// URLs canibalizándose, slugs truncados, el entorno de desarrollo indexado.
// Nada de eso necesita criterio, y sin embargo era invisible.
//
// La misma lección que las rayas largas: no se le paga a un agente por lo que
// resuelve una expresión regular. Esto se calcula gratis y se le entrega ya
// hecho, para que gaste su criterio en lo único que lo necesita, que es por
// qué pasa y qué conviene hacer.

export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

/**
 * Consultas que no son de una persona buscando.
 *
 * Las superficies de IA generativa y las herramientas que miden visibilidad en
 * LLMs disparan consultas con forma de instrucción, no de búsqueda: párrafos
 * enteros, listas de requisitos, descripciones de buyer persona. En Search
 * Console cuentan como impresiones y hunden el CTR medio, y encima rankean
 * altísimo porque nadie más compite por ellas.
 *
 * Un caso real: una sola de estas acumuló 612 impresiones con cero clics. Leer
 * ese volumen como demanda lleva a la conclusión contraria a la correcta.
 */
const FORMA_DE_PROMPT =
  /\b(you must provide|debes? (proporcionar|generar|dar)|du musst|please (provide|list|compare|rank)|act as|actúa como|my location is|mi ubicación es|buyer persona|pain points|puntos de dolor|step by step guide for me|give me a (list|ranking)|rank(ing)? (them |from )?(best to worst|de mejor a peor)|what do reddit users|was sagen reddit)\b/i;

export function shapedLikePrompt(q: string): boolean {
  // Larga Y con estructura de instrucción. Solo la longitud marcaría consultas
  // legítimas de cola larga, que son justo las que interesan.
  const palabras = q.trim().split(/\s+/).length;
  return FORMA_DE_PROMPT.test(q) || palabras >= 14 || q.length > 110;
}

export interface Diagnostico {
  /** Nombre corto, para agrupar. */
  tipo: string;
  /** Qué se encontró, con su número. */
  detalle: string;
  /** Las URLs o consultas concretas, para poder comprobarlo. */
  ejemplos: string[];
  /** Cuánto tráfico hay en juego. Ordena la lista por lo que importa. */
  impresiones: number;
}

/** Normaliza una ruta a sus palabras significativas, para detectar duplicados. */
const huella = (path: string) =>
  path
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 3 && !/^(2024|2025|2026|para|para|with|from|that|this|your|best|guide|the|and|for)$/.test(w))
    .sort();

/**
 * URLs que compiten entre sí por la misma intención.
 *
 * Cuando Google reparte una intención entre varias URLs propias, ninguna
 * acumula autoridad y todas se quedan en CTR residual. Se detecta por
 * solapamiento de palabras del slug, no por título: dos artículos pueden
 * titularse distinto y ser el mismo contenido.
 */
export function canibalizacion(pages: PageRow[]): Diagnostico[] {
  const conHuella = pages
    .filter((p) => p.impressions > 0)
    .map((p) => ({ ...p, h: huella(p.page) }))
    .filter((p) => p.h.length >= 2);

  const grupos: (typeof conHuella)[] = [];
  const usados = new Set<number>();

  for (let i = 0; i < conHuella.length; i++) {
    if (usados.has(i)) continue;
    const grupo = [conHuella[i]];
    for (let j = i + 1; j < conHuella.length; j++) {
      if (usados.has(j)) continue;
      const comunes = conHuella[i].h.filter((w) => conHuella[j].h.includes(w));
      // Dos tercios de las palabras significativas compartidas: por debajo de
      // ahí son temas vecinos, no el mismo artículo dos veces.
      const minLen = Math.min(conHuella[i].h.length, conHuella[j].h.length);
      if (comunes.length / minLen >= 0.66) {
        grupo.push(conHuella[j]);
        usados.add(j);
      }
    }
    if (grupo.length > 1) {
      usados.add(i);
      grupos.push(grupo);
    }
  }

  return grupos
    .map((g) => {
      const impresiones = g.reduce((s, p) => s + p.impressions, 0);
      const clics = g.reduce((s, p) => s + p.clicks, 0);
      // La que más clics tiene es la candidata a canónica: ya demostró que
      // convierte mejor, y consolidar hacia ella conserva lo que funciona.
      const canonica = [...g].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)[0];
      return {
        tipo: "canibalizacion",
        detalle: `${g.length} URLs compiten por la misma intención: ${impresiones} impresiones y ${clics} clics repartidos. Consolidar hacia ${canonica.page}.`,
        ejemplos: g.map((p) => `${p.page} (${p.impressions} impr, ${p.clicks} clics, pos ${p.position.toFixed(1)})`),
        impresiones,
      };
    })
    .sort((a, b) => b.impresiones - a.impresiones);
}

/** Slugs cortados a medias: señal de publicación automática sin revisión. */
export function slugsTruncados(pages: PageRow[]): Diagnostico | null {
  const rotos = pages.filter((p) => {
    const slug = p.page.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "").split("/").pop() ?? "";
    const ultima = slug.split("-").pop() ?? "";
    // Termina en una o dos letras sueltas: "…honest-reviews-p", "…cut-cac-w".
    return slug.length > 25 && ultima.length <= 2 && /^[a-z]+$/.test(ultima);
  });
  if (!rotos.length) return null;
  return {
    tipo: "slug-truncado",
    detalle: `${rotos.length} URL(s) con el slug cortado a media palabra. Se ve en el resultado de búsqueda y delata publicación automática sin revisión.`,
    ejemplos: rotos.map((p) => p.page),
    impresiones: rotos.reduce((s, p) => s + p.impressions, 0),
  };
}

/** El entorno de desarrollo apareciendo en resultados. */
export function entornosIndexados(pages: PageRow[]): Diagnostico | null {
  const dev = pages.filter((p) => /^https?:\/\/(dev|staging|test|preview)\./i.test(p.page));
  if (!dev.length) return null;
  return {
    tipo: "entorno-indexado",
    detalle: `${dev.length} URL(s) de un entorno que no es producción están saliendo en búsqueda. Duplican el contenido real y compiten con él.`,
    ejemplos: dev.map((p) => p.page),
    impresiones: dev.reduce((s, p) => s + p.impressions, 0),
  };
}

/**
 * Cuánto del volumen es humano.
 *
 * Es el número que cambia todo lo demás: con la mayoría de las impresiones
 * viniendo de superficies de IA, el CTR medio del sitio deja de significar
 * nada y hay que medir sobre el resto.
 */
export function volumenHumano(queries: QueryRow[]) {
  const prompts = queries.filter((q) => shapedLikePrompt(q.query));
  const humanas = queries.filter((q) => !shapedLikePrompt(q.query));
  const sum = (xs: QueryRow[], k: "clicks" | "impressions") => xs.reduce((s, x) => s + x[k], 0);

  const imprPrompt = sum(prompts, "impressions");
  const imprHumano = sum(humanas, "impressions");
  const clicsHumano = sum(humanas, "clicks");

  return {
    prompts: { consultas: prompts.length, impresiones: imprPrompt, clics: sum(prompts, "clicks") },
    humano: { consultas: humanas.length, impresiones: imprHumano, clics: clicsHumano },
    /** El CTR que de verdad se puede mover. */
    ctrHumano: imprHumano ? Math.round((clicsHumano / imprHumano) * 1000) / 10 : 0,
    /** Las que más volumen aportan sin traer a nadie. */
    peores: prompts
      .filter((q) => q.clicks === 0)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5)
      .map((q) => `${q.impressions} impr, pos ${q.position.toFixed(1)}: "${q.query.slice(0, 90)}"`),
  };
}

/** Páginas en el top 5 que aun así no reciben clics: es título y meta. */
export function rankeaSinClics(pages: PageRow[]): Diagnostico | null {
  const malas = pages
    .filter((p) => p.position <= 5 && p.impressions >= 100 && p.clicks === 0)
    .sort((a, b) => b.impressions - a.impressions);
  if (!malas.length) return null;
  return {
    tipo: "rankea-sin-clics",
    detalle: `${malas.length} página(s) en el top 5 con más de 100 impresiones y CERO clics. En esa posición el problema no es el posicionamiento: es el título, la meta, o que la respuesta ya se ve entera en la SERP.`,
    ejemplos: malas.slice(0, 8).map((p) => `${p.page} (${p.impressions} impr, pos ${p.position.toFixed(1)})`),
    impresiones: malas.reduce((s, p) => s + p.impressions, 0),
  };
}

/** Todo junto, ordenado por lo que más tráfico mueve. */
export function diagnosticar(pages: PageRow[], queries: QueryRow[]) {
  const lista = [
    ...canibalizacion(pages),
    slugsTruncados(pages),
    entornosIndexados(pages),
    rankeaSinClics(pages),
  ].filter((d): d is Diagnostico => d !== null);

  return {
    hallazgos: lista.sort((a, b) => b.impresiones - a.impresiones),
    volumen: volumenHumano(queries),
  };
}
