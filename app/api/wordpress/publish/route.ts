import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getBlogPosts, getBlogPost, renderHtml, type BlogPost } from "@/lib/blog";
import { publishPost } from "@/lib/wordpress";
import { generateCover } from "@/lib/cover";

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
export async function POST(request: NextRequest) {
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

  const results: unknown[] = [];
  for (const post of targets) {
    if (!post) continue;
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
      results.push({ slug: post.slug, ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ slug: post.slug, ok: false, error: msg });
    }
  }

  return NextResponse.json({ results });
}
