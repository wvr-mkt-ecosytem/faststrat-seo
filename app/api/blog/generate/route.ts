import { NextRequest, NextResponse } from "next/server";
import { createBlogPost, slugify } from "@/lib/blog";
import { runClaude } from "@/lib/claude";

const WRITER_SYSTEM = `Eres un redactor SEO senior para FastStrat, plataforma de agentes de IA de marketing para PYMEs (LATAM y EEUU).

Escribes artículos de blog optimizados para search: claros, útiles, con estructura escaneable (H2/H3), párrafos cortos, una tabla cuando aporte, y una sección de FAQ al final. Sin clichés ("en el mundo acelerado de hoy"). Sin inventar estadísticas falsas.

Devuelve ÚNICAMENTE el cuerpo del artículo en Markdown (sin frontmatter, sin título H1, sin bloques de código que lo envuelvan). Empieza directo con el primer párrafo o H2.`;

// POST /api/blog/generate { keyword, title?, lang?, category? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const keyword: string = body.keyword;
  if (!keyword) {
    return NextResponse.json({ error: "Falta 'keyword'" }, { status: 400 });
  }
  const lang: string = body.lang ?? "en";
  const category: string = body.category ?? "SEO";
  const title: string =
    body.title ??
    (lang === "es"
      ? `Guía 2026: ${keyword}`
      : `${keyword}: The 2026 Guide`);

  try {
    const markdown = await runClaude({
      model: "sonnet",
      system: WRITER_SYSTEM,
      prompt: `Escribe un artículo de ~1200-1600 palabras.
Título: "${title}"
Keyword principal: "${keyword}"
Idioma: ${lang === "es" ? "español" : "inglés"}.
Optimiza naturalmente para la keyword sin saturarla. Incluye intro, 4-6 secciones H2, una tabla o lista útil, y FAQ.`,
    });

    const excerpt =
      markdown
        .replace(/[#*`>_-]/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0]
        ?.slice(0, 155) ?? title;

    const post = createBlogPost({
      title,
      slug: slugify(title),
      excerpt,
      keywords: [keyword],
      lang,
      category,
      status: "draft", // los generados desde reportes entran como borrador
      markdown,
    });

    return NextResponse.json({ ok: true, slug: post.slug, title: post.title });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
