import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getBlogPosts, createBlogPost, slugify, renderHtml } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { persistChanges } from "@/lib/persist";

const OPTIMIZER_SYSTEM = `Eres un editor SEO senior para FastStrat. Recibes:
1. Un artículo existente (URL + título conocido).
2. Una lista de queries reales por las que esa página YA aparece en Google pero rankea fuera del top 5 (posiciones 5-20) — son la palanca para subir a página 1.

Tu tarea: reescribir/expandir el artículo para capturar mejor esas queries. Estrategia:
- Mantén el ángulo y la voz del artículo original.
- Para cada query striking-distance, asegúrate de que el artículo trate ese subtema de forma explícita (subtítulo H2/H3, párrafo dedicado, o pregunta en FAQ).
- Mejora intro, conclusiones y FAQ con esas queries en mente.
- No infles con relleno: si una query no encaja, dilo en el cierre.

Devuelve SOLO el cuerpo markdown reescrito (sin frontmatter, sin H1, sin code fence).`;

// POST /api/blog/optimize
//   { path: "/slug/", queries: [{query, position, impressions}], existingMarkdown?: string }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const urlPath: string = body.path;
  const queries: Array<{ query: string; position: number; impressions: number }> = body.queries ?? [];

  if (!urlPath || queries.length === 0) {
    return NextResponse.json(
      { error: "Faltan 'path' o 'queries'" },
      { status: 400 }
    );
  }

  try {
    const slug = urlPath.replace(/^\/|\/$/g, "");

    // Si tenemos el post local (de los que escribimos), usa su markdown.
    // Si no, le decimos al agente que reescriba desde cero basado solo en URL/queries.
    const local = getBlogPosts().find((p) => p.slug === slug);
    const existing = local
      ? `Markdown actual:\n---\n${local.markdown}\n---`
      : `(No tenemos el markdown local. Escribe una versión SEO-optimizada desde cero para la URL "${urlPath}".)`;

    const queryList = queries
      .map((q) => `- "${q.query}" (pos ${q.position}, ${q.impressions} impr)`)
      .join("\n");

    const title = local?.title ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const lang = local?.lang ?? "en";
    const category = local?.category ?? "SEO";
    const keywords = [...(local?.keywords ?? []), ...queries.map((q) => q.query)];

    const newMarkdown = await runClaude({
      model: "sonnet",
      system: OPTIMIZER_SYSTEM,
      prompt: `Artículo: "${title}"  ·  URL: https://faststrat.ai${urlPath}\nIdioma: ${lang}.\n\nQueries striking-distance a capturar:\n${queryList}\n\n${existing}\n\nReescribe el artículo.`,
    });

    // Guarda como un nuevo borrador con sufijo -optimized para no pisar el archivo
    // original mientras Walter lo revisa.
    const newSlug = local ? `${local.slug}-optimized` : `${slug}-optimized`;
    const excerpt =
      newMarkdown
        .replace(/[#*`>_-]/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0]
        ?.slice(0, 155) ?? title;

    const post = createBlogPost({
      title: local ? `${title} (optimized)` : title,
      slug: newSlug,
      excerpt,
      keywords: [...new Set(keywords)].slice(0, 6),
      lang,
      category,
      status: "draft",
      markdown: newMarkdown,
    });

    await persistChanges(`optimize: ${urlPath}`, [
      path.join(process.cwd(), "content", "blog", `${post.slug}.md`),
    ]);

    return NextResponse.json({
      ok: true,
      slug: post.slug,
      title: post.title,
      wordCount: newMarkdown.split(/\s+/).filter(Boolean).length,
      preview: newMarkdown.trim().slice(0, 500),
      capturedQueries: queries.map((q) => q.query),
      sourcedFromLocal: !!local,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
