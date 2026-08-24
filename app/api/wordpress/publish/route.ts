import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { getBlogPosts, getBlogPost, renderHtml, type BlogPost } from "@/lib/blog";
import { publishPost } from "@/lib/wordpress";
import { runQa } from "@/lib/qa";
import { generateCover } from "@/lib/cover";
import { CLIENTE } from "@/lib/cliente";

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
      });
      results.push({ slug: post.slug, ok: true, ...result, warnings: qa.warnings, bypassed: qa.blocking.length ? qa.blocking : undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ slug: post.slug, ok: false, error: msg });
    }
  }

  return NextResponse.json({ results });
});
