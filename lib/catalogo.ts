import { getBlogPosts } from "@/lib/blog";
import { listarTitulos } from "@/lib/wordpress";
import { leerMemoria } from "@/lib/idea-memory";
import { choques, type Choque } from "@/lib/similitud";

// Todo lo que el sistema ya escribió o ya propuso, en una sola lista.
//
// Existe porque el inventario estaba repartido en tres sitios que nadie
// consultaba a la vez: los 21 archivos de content/blog, los 109 artículos en
// WordPress y los títulos que la memoria de ideas guarda como ya propuestos.
// Comprobar contra uno solo deja pasar lo que está en los otros dos, y así es
// como nacieron las cinco canibalizaciones que el informe del 24 de agosto pide
// deshacer a base de redirecciones.

export interface EntradaCatalogo {
  title: string;
  slug?: string;
  /** De dónde salió, para poder decir en pantalla con qué choca exactamente. */
  origen: "wordpress" | "borrador" | "idea";
}

export interface Catalogo {
  entradas: EntradaCatalogo[];
  /** Lo que no se pudo consultar. Se dice, no se calla. */
  aviso: string | null;
}

/**
 * El listado de WordPress, guardado un rato.
 *
 * Listar los 109 artículos son dos peticiones y tardó 31 segundos medidos en la
 * primera prueba. Como la comprobación se hace varias veces seguidas (una por
 * artículo al publicar una tanda), sin esto el coste se multiplica por el
 * número de artículos y deja de ser "la pieza barata".
 *
 * Un minuto es de sobra: lo que se publica en ese rato lo publica este mismo
 * proceso, y eso ya entra en el catálogo por la vía de los borradores locales.
 */
const CACHE_MS = 60_000;
let cache: { cuando: number; posts: Awaited<ReturnType<typeof listarTitulos>> } | null = null;

async function titulosDeWordpress() {
  if (cache && Date.now() - cache.cuando < CACHE_MS) return cache.posts;
  const posts = await listarTitulos();
  // Un fallo NO se cachea: si WordPress se cayó un segundo, la siguiente
  // llamada debe volver a intentarlo en vez de arrastrar un catálogo vacío
  // durante un minuto, que es cuando la comprobación diría "ok" sin comprobar.
  if (!posts.error) cache = { cuando: Date.now(), posts };
  return posts;
}

/** Reúne el inventario completo. Nunca lanza. */
export async function catalogo(): Promise<Catalogo> {
  const entradas: EntradaCatalogo[] = [];
  let aviso: string | null = null;

  const { posts, error } = await titulosDeWordpress();
  for (const p of posts) entradas.push({ title: p.title, slug: p.slug, origen: "wordpress" });
  if (error) aviso = error;

  for (const p of getBlogPosts()) entradas.push({ title: p.title, slug: p.slug, origen: "borrador" });

  try {
    for (const t of leerMemoria().titulos) entradas.push({ title: t, origen: "idea" });
  } catch {
    // La memoria de ideas es lo menos crítico de los tres: si falla, se sigue
    // comprobando contra WordPress y contra los borradores.
  }

  // Un mismo artículo está en WordPress y como borrador local. Se queda la
  // primera aparición, que por el orden de arriba es la de WordPress: es la que
  // tiene slug real y la que de verdad compite en la SERP.
  const vistos = new Set<string>();
  const unicas = entradas.filter((e) => {
    const clave = e.title.toLowerCase().trim();
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });

  return { entradas: unicas, aviso };
}

export interface Veredicto {
  ok: boolean;
  choques: (Choque & { origen: EntradaCatalogo["origen"] })[];
  aviso: string | null;
  /** Cuántos títulos se compararon. Cero significa que no se comprobó nada. */
  comparados: number;
}

/**
 * ¿Este título se pisa con algo que ya existe?
 *
 * Se llama ANTES de escribir. Cuesta milisegundos y evita el trabajo caro: una
 * canibalización cuesta después dos artículos, una redirección 301 y semanas
 * hasta que Google reevalúa.
 */
export async function revisarTitulo(titulo: string): Promise<Veredicto> {
  const { entradas, aviso } = await catalogo();
  const encontrados = choques(titulo, entradas);

  const conOrigen = encontrados.map((c) => ({
    ...c,
    origen: entradas.find((e) => e.title === c.titulo)?.origen ?? ("borrador" as const),
  }));

  return {
    // Chocar contra una IDEA no bloquea: proponerla y escribirla son cosas
    // distintas, y una idea repetida no divide autoridad en Google porque no
    // existe ninguna página. Bloquear por eso impediría escribir justamente lo
    // que se había planeado escribir.
    ok: !conOrigen.some((c) => c.origen !== "idea"),
    choques: conOrigen,
    aviso,
    comparados: entradas.length,
  };
}

/**
 * El texto que se le enseña a quien tiene que decidir.
 *
 * Explica el choque que CAUSA el bloqueo, no el de más parecido. Chocar contra
 * una idea no bloquea, así que enseñar ese cuando lo que frena es una página
 * publicada manda a mirar el sitio equivocado: salió en la primera prueba real,
 * donde el mensaje decía "ya propuesto" mientras el freno venía de WordPress.
 */
export function explicar(v: Veredicto): string {
  if (v.choques.length === 0) return "";
  const c = (!v.ok && v.choques.find((x) => x.origen !== "idea")) || v.choques[0];
  const donde = c.origen === "wordpress" ? "ya publicado" : c.origen === "borrador" ? "en borradores" : "ya propuesto";
  return (
    `Se pisa con "${c.titulo}" (${donde}${c.slug ? `, /${c.slug}/` : ""}): ` +
    `${Math.round(c.parecido * 100)}% de parecido, ${c.motivo}. ` +
    `Dos páginas propias con la misma intención se reparten la autoridad en vez de sumarla.`
  );
}
