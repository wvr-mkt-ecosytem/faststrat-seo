import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";
import { CLIENTE } from "@/lib/cliente";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  keywords: string[];
  lang: string;
  category: string;
  status: string;
  /** Quién firma. Google pregunta expresamente quién creó el contenido. */
  author: string;
  /** Cuándo se escribió, en ISO. */
  date: string;
  /** Ultima modificacion real del cuerpo, en ISO. */
  updated?: string;
  /**
   * Cuándo debe salir publicado, en ISO. Vacío = en cuanto se publique.
   *
   * Sin esto, publicar una tanda dejaba todos los artículos con la misma fecha
   * y la misma hora, que es la huella más visible de publicación automatizada:
   * Google lista "cambiar fechas sin actualizaciones sustanciales" entre las
   * señales de contenido hecho para el buscador.
   */
  publishAt?: string;
  /**
   * Qué aporta este artículo que no tengan los que ya están arriba.
   *
   * Lo escribe el agente después de mirar la SERP, y la compuerta lo exige. Es
   * la única respuesta que el sistema tenía en blanco a la pregunta de Google
   * "¿ofrece información, datos o análisis originales?".
   */
  differentiator?: string;
  /**
   * Por qué esta keyword: qué busca quien la escribe y por qué podemos
   * responderle mejor. Lo escribe el agente tras mirar la SERP.
   */
  keywordRationale?: string;
  /** Hacia dónde va la demanda de la keyword, según Google Trends. */
  keywordTrend?: { direccion: "sube" | "baja" | "estable" | "sin-volumen"; cambioAnual: number; nivelActual: number };
  /**
   * La versión en el otro idioma, si existe.
   *
   * Son DOS artículos, no uno con dos cuerpos. Cada uno tiene su URL, su
   * entrada en el sitemap y rankea por su cuenta, que es como Google entiende
   * el contenido en varios idiomas. Guardarlos juntos habría peleado con
   * WordPress, donde un post es una URL.
   *
   * El enlace es recíproco: cada versión apunta a la otra. Lo exige hreflang y
   * además evita el caso de dejar una huérfana al borrar la otra.
   */
  alternate?: { lang: string; slug: string };
  file: string;
  /** Raw markdown body (without frontmatter). */
  markdown: string;
}

/** Reads all markdown blog posts from content/blog. */
export function getBlogPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return {
        slug: data.slug ?? file.replace(/\.md$/, ""),
        title: data.title ?? "(untitled)",
        excerpt: data.excerpt ?? "",
        keywords: data.keywords ?? [],
        lang: data.lang ?? "en",
        category: data.category ?? "Uncategorized",
        status: data.status ?? "draft",
        author: data.author ?? CLIENTE.autor,
        // Los 21 archivos que ya existían no traen fecha. Se usa la del archivo
        // en vez de la de hoy: inventar "hoy" para todos los antiguos es
        // exactamente la huella de automatización que esto quiere evitar.
        date: data.date ? String(data.date) : fechaDeArchivo(file),
        updated: data.updated ? String(data.updated) : undefined,
        publishAt: data.publishAt ? String(data.publishAt) : undefined,
        differentiator: data.differentiator ? String(data.differentiator) : undefined,
        keywordRationale: data.keywordRationale ? String(data.keywordRationale) : undefined,
        keywordTrend: data.keywordTrend ?? undefined,
        alternate: data.alternate ?? undefined,
        file,
        markdown: content,
      };
    });
}

/** La fecha de modificación del archivo, para los posts que nacieron sin ella. */
function fechaDeArchivo(file: string): string {
  try {
    return fs.statSync(path.join(BLOG_DIR, file)).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return getBlogPosts().find((p) => p.slug === slug);
}

/** Converts a post's markdown body to HTML ready for WordPress. */
export function renderHtml(post: BlogPost): string {
  return marked.parse(post.markdown, { async: false }) as string;
}

export { slugify } from "@/lib/slug";
import { slugify } from "@/lib/slug";


/** Crea un nuevo archivo de blog (frontmatter + cuerpo markdown). */
export function createBlogPost(meta: {
  title: string;
  slug?: string;
  excerpt: string;
  keywords: string[];
  lang: string;
  category: string;
  status?: string;
  author?: string;
  /** ISO. Cuándo debe salir publicado. */
  publishAt?: string;
  differentiator?: string;
  keywordRationale?: string;
  keywordTrend?: BlogPost["keywordTrend"];
  alternate?: BlogPost["alternate"];
  markdown: string;
}): BlogPost {
  const slug = meta.slug ?? slugify(meta.title);
  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });
  const file = `${slug}.md`;
  const ahora = new Date().toISOString();
  const data = {
    title: meta.title,
    slug,
    excerpt: meta.excerpt,
    keywords: meta.keywords,
    lang: meta.lang,
    category: meta.category,
    status: meta.status ?? "publish",
    author: meta.author ?? CLIENTE.autor,
    date: ahora,
    updated: ahora,
    ...(meta.publishAt ? { publishAt: meta.publishAt } : {}),
    ...(meta.differentiator ? { differentiator: meta.differentiator } : {}),
    ...(meta.keywordRationale ? { keywordRationale: meta.keywordRationale } : {}),
    ...(meta.keywordTrend ? { keywordTrend: meta.keywordTrend } : {}),
    ...(meta.alternate ? { alternate: meta.alternate } : {}),
  };
  fs.writeFileSync(
    path.join(BLOG_DIR, file),
    matter.stringify(meta.markdown.trim() + "\n", data)
  );
  return { ...data, file, markdown: meta.markdown };
}

/**
 * Enlaza dos versiones en distinto idioma, en los DOS sentidos.
 *
 * Recíproco a propósito. hreflang lo exige —Google ignora las anotaciones que
 * no se devuelven el enlace— y además evita dejar una versión huérfana
 * apuntando a algo que ya no existe.
 */
export function emparejar(slugA: string, slugB: string): void {
  const a = getBlogPost(slugA);
  const b = getBlogPost(slugB);
  if (!a || !b) throw new Error(`No se encontró ${!a ? slugA : slugB}`);
  if (a.lang === b.lang) {
    throw new Error(`Los dos están en ${a.lang}: una versión alterna tiene que estar en otro idioma`);
  }
  ponerAlternate(a, { lang: b.lang, slug: b.slug });
  ponerAlternate(b, { lang: a.lang, slug: a.slug });
}

function ponerAlternate(post: BlogPost, alternate: NonNullable<BlogPost["alternate"]>): void {
  const filePath = path.join(BLOG_DIR, post.file);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  fs.writeFileSync(filePath, matter.stringify(content.trim() + "\n", { ...data, alternate }));
}

/**
 * Reescribe el cuerpo markdown de un post conservando su frontmatter.
 * Devuelve el post actualizado.
 */
export function updateBlogMarkdown(slug: string, newMarkdown: string): BlogPost {
  const post = getBlogPost(slug);
  if (!post) throw new Error(`No se encontró el post '${slug}'`);
  const filePath = path.join(BLOG_DIR, post.file);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);

  // `updated` cambia solo cuando cambia el cuerpo de verdad.
  //
  // Tocarlo en cada guardado convertiría dateModified en ruido: Google avisa de
  // que cambiar fechas sin actualizaciones sustanciales es señal de contenido
  // hecho para el buscador, y reescribe los títulos cuando la fecha que ve no
  // se corresponde con lo que hay en la página.
  const cambio = newMarkdown.trim() !== post.markdown.trim();
  const actualizado = cambio ? new Date().toISOString() : (data.updated ?? post.updated);
  const nuevoData = { ...data, ...(actualizado ? { updated: actualizado } : {}) };

  const rebuilt = matter.stringify(newMarkdown.trim() + "\n", nuevoData);
  fs.writeFileSync(filePath, rebuilt);
  return { ...post, markdown: newMarkdown, updated: actualizado };
}
