import path from "path";
import { apiRoute } from "@/lib/google-auth-state";
import { NextRequest, NextResponse } from "next/server";
import { getBlogPost, updateBlogMarkdown, renderHtml } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { persistChanges } from "@/lib/persist";
import { dejarPublicable } from "@/lib/publicable";

// Cuánto puede tardar. Sin esto, la plataforma corta la petición a mitad de la
// llamada al agente y no devuelve nada: el navegador se queda esperando una
// respuesta que ya no va a llegar y el botón gira para siempre. Ninguna de las
// rutas que llaman al agente lo declaraba, y por eso los cuatro botones
// (escribir, investigar, generar, escribir todos) fallaban a la vez.
export const maxDuration = 600;
export const dynamic = "force-dynamic";


const SEO_EDITOR_SYSTEM = `Eres un editor de SEO y contenido para FastStrat, una plataforma de agentes de IA de marketing para PYMEs (mercado LATAM y EEUU).

Tu trabajo: reescribir el cuerpo de un artículo de blog (en Markdown) siguiendo la instrucción del usuario, manteniendo calidad SEO.

Reglas:
- Devuelve ÚNICAMENTE el Markdown del cuerpo del artículo, sin frontmatter, sin explicaciones, sin bloques de código que lo envuelvan.
- Conserva la estructura SEO: H2/H3, párrafos cortos, una sección de FAQ si existía, listas y tablas cuando aporten.
- Mantén el idioma original del artículo salvo que la instrucción pida lo contrario.
- No inventes datos estadísticos falsos. Si necesitas un dato y no lo tienes, usa un rango razonable o frasea cualitativamente.
- Voz: clara, directa, útil, sin clichés de marketing ("en el mundo acelerado de hoy").`;

// POST /api/blog/edit  { slug, instruction, preview?: boolean }
// preview=true devuelve el resultado SIN guardar; sin preview, guarda el archivo.
export const POST = apiRoute(async (request: NextRequest) => {
  const { slug, instruction, preview } = await request.json().catch(() => ({}));

  if (!slug || !instruction) {
    return NextResponse.json(
      { error: "Faltan 'slug' o 'instruction'" },
      { status: 400 }
    );
  }

  const post = getBlogPost(slug);
  if (!post) {
    return NextResponse.json({ error: `No se encontró el post '${slug}'` }, { status: 404 });
  }

  try {
    const newMarkdown = await runClaude({
      model: "sonnet",
      system: SEO_EDITOR_SYSTEM,
      prompt: `Artículo actual (título: "${post.title}", keywords: ${post.keywords.join(", ")}):

---
${post.markdown}
---

Instrucción del usuario: ${instruction}

Devuelve el artículo completo reescrito en Markdown.`,
    });

    if (preview) {
      return NextResponse.json({ markdown: newMarkdown, saved: false });
    }

    // Editar también es escribir: una instrucción del usuario puede meter una
    // cifra sin fuente o una raya larga igual que el escritor.
    const revisado = await dejarPublicable(post.title, newMarkdown, { metaDescription: post.excerpt });
    const updated = updateBlogMarkdown(slug, revisado.markdown);
    await persistChanges(`edit blog: ${updated.slug}`, [
      path.join(process.cwd(), "content", "blog", updated.file),
    ]);
    return NextResponse.json({
      markdown: updated.markdown,
      html: renderHtml(updated),
      saved: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
