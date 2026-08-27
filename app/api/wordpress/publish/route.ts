import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { getBlogPosts, getBlogPost, renderHtml, type BlogPost } from "@/lib/blog";
import { publishPost } from "@/lib/wordpress";
import { runQa } from "@/lib/qa";
import { generateCover } from "@/lib/cover";
import { CLIENTE } from "@/lib/cliente";
import { revisarTitulo, explicar } from "@/lib/catalogo";
import { emparejarEnWordpress } from "@/lib/wordpress";

// Reglas de casa de FastStrat. El em dash queda prohibido por decisión de
// marca; el resto de comprobaciones no dependen de esto.
// Las reglas de casa, en un solo sitio.
//
// `urlProducto` obliga al enlace al producto: el primer artículo que generó el
// sistema llegó a WordPress sin él, porque los 109 posts vivos lo tenían por un
// script y el escritor nunca lo añadía. Con 1.784 sesiones y cero conversiones,
// un artículo que atrae y no ofrece a dónde ir es esa cifra repetida.
const HOUSE = { noEmDash: true, urlProducto: CLIENTE.dominioApp } as const;

const EYEBROW: Record<string, string> = { en: "2026 Guide", es: "Guía 2026" };

/**
 * Mapea la categoría del frontmatter a una categoría REAL de faststrat.ai
 * (las que muestra la página de Resources). Si no, los posts caen en
 * categorías nuevas que esa página no lista.
 *   - Español / LATAM  → "Recursos LATAM"
 *   - Temas de IA      → "AI (Artificial Intelligence)"
 *   - El resto         → "Marketing"
 */
function siteCategory(post: BlogPost): string {
  if (post.lang === "es") return "Recursos LATAM";
  const c = (post.category || "").toLowerCase();
  if (/\bai\b|a\.i\.|inteligencia|gpt|llm|agent/.test(c)) {
    return "AI (Artificial Intelligence)";
  }
  return "Marketing";
}

/** Devuelve el PNG de la portada: usa el de public/covers o lo genera al vuelo. */
async function getCover(post: BlogPost): Promise<Buffer> {
  const file = path.join(process.cwd(), "public", "covers", `${post.slug}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  return generateCover({
    eyebrow: EYEBROW[post.lang] ?? "2026",
    title: post.title,
    subtitle: post.excerpt,
    category: post.category,
  });
}

// POST /api/wordpress/publish
//   body: { slug: string }   → publica un post
//   body: { all: true }      → publica todos los posts locales
export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));

  const targets = body.all ? getBlogPosts() : [getBlogPost(body.slug)].filter(Boolean);
  // Si live=true, publica EN VIVO sin importar el status del frontmatter.
  // Si draft=true, fuerza borrador. Por defecto respeta el frontmatter.
  const forceLive = body.live === true;
  const forceDraft = body.draft === true;

  if (targets.length === 0) {
    return NextResponse.json(
      { error: body.all ? "No hay posts en content/blog" : `No se encontró el slug '${body.slug}'` },
      { status: 404 }
    );
  }

  // La compuerta de calidad, antes de tocar WordPress.
  //
  // Publicar en vivo no se deshace con un clic, así que el bloqueo va aquí y no
  // en la interfaz: un botón se puede pulsar desde otro sitio, y esta ruta
  // también acepta `all: true`, que publica todo el directorio de una vez.
  //
  // `force: true` permite saltárselo a sabiendas, y entonces los hallazgos
  // viajan en la respuesta: saltarse la revisión es una decisión que queda
  // registrada, no una casilla que se marca y se olvida.
  const gate = targets
    .filter((p): p is BlogPost => Boolean(p))
    .map((p) => ({
      slug: p.slug,
      qa: runQa({ title: p.title, metaDescription: p.excerpt, markdown: p.markdown, house: HOUSE }),
    }))
    .filter((r) => !r.qa.ok);

  if (gate.length && body.force !== true) {
    return NextResponse.json(
      {
        blocked: true,
        message:
          "Not published: the quality gate found claims the draft cannot back up. Fix them, or resend with force: true to publish anyway.",
        findings: gate.map((g) => ({ slug: g.slug, blocking: g.qa.blocking, warnings: g.qa.warnings })),
      },
      { status: 409 },
    );
  }

  const results: unknown[] = [];
  for (const post of targets) {
    if (!post) continue;
    const qa = runQa({ title: post.title, metaDescription: post.excerpt, markdown: post.markdown, house: HOUSE });

    // La canibalización se decide AQUÍ, no al escribir.
    //
    // Un borrador duplicado no le hace daño a nadie: no está en Google y se
    // renombra o se tira. Lo que reparte la autoridad entre dos URLs es
    // PUBLICAR la segunda. Por eso escribir solo avisa y publicar frena.
    //
    // Cuesta un listado de WordPress por artículo, contra una redirección 301 y
    // varias semanas de reevaluación si se cuela.
    if (!body.force) {
      const v = await revisarTitulo(post.title);
      const contraPublicado = v.choques.filter(
        (c) => c.origen === "wordpress" && c.slug !== post.slug,
      );
      if (contraPublicado.length > 0) {
        results.push({
          slug: post.slug,
          ok: false,
          error: "Compite con una página que ya está publicada",
          explicacion: explicar({ ...v, choques: contraPublicado }),
          // El parecido va en PORCENTAJE, como en el resto de las rutas.
          // Iba de 0 a 1 y la pantalla lo pintaba tal cual: un choque idéntico
          // se leía como "1% de parecido", que dice justo lo contrario.
          choques: contraPublicado.map((c) => ({ ...c, parecido: Math.round(c.parecido * 100) })),
          comoSeguir:
            "Cambia el título y el ángulo, o reenvía con force: true si de verdad son intenciones distintas.",
        });
        continue;
      }
    }

    try {
      const result = await publishPost({
        title: post.title,
        slug: post.slug,
        contentHtml: renderHtml(post),
        excerpt: post.excerpt,
        category: siteCategory(post),
        status: forceLive
          ? "publish"
          : forceDraft
            ? "draft"
            : post.status === "publish"
              ? "publish"
              : "draft",
        coverImage: await getCover(post),
        // Firma y fecha. Google pregunta expresamente quién creó el contenido,
        // y publicar una tanda entera con la misma marca de tiempo es la huella
        // más visible de automatización.
        authorName: post.author,
        // La fecha puede venir de la petición (el usuario eligió una) o del
        // frontmatter (la puso quien generó el artículo). Manda la explícita.
        publishAt: body.programarPara ?? post.publishAt,
        publicarAhora: body.ahora === true,
      });
      // Si tiene versión en otro idioma, se enlazan en WordPress para que el
      // fragmento de WPCode pueda emitir el hreflang. Falla en silencio cuando
      // la otra versión todavía no está publicada, que es lo normal la primera
      // vez: al publicar la segunda se vuelve a intentar y ahí sí cuaja.
      let hreflang: string | undefined;
      if (post.alternate) {
        const r = await emparejarEnWordpress(post.slug, post.lang, post.alternate.slug, post.alternate.lang);
        hreflang = r.ok ? "enlazado con su versión en otro idioma" : r.error;
      }

      results.push({ slug: post.slug, ok: true, hreflang, ...result, warnings: qa.warnings, bypassed: qa.blocking.length ? qa.blocking : undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ slug: post.slug, ok: false, error: msg });
    }
  }

  return NextResponse.json({ results });
});
