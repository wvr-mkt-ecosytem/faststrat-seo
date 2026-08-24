import path from "path";
import { apiRoute } from "@/lib/google-auth-state";
import { NextRequest, NextResponse } from "next/server";
import { getBlogPosts, createBlogPost, slugify, renderHtml } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { persistChanges } from "@/lib/persist";
import { dejarPublicable } from "@/lib/publicable";
import { CONTEXTO_CLIENTE, CLIENTE } from "@/lib/cliente";

// Cuánto puede tardar. Sin esto, la plataforma corta la petición a mitad de la
// llamada al agente y no devuelve nada: el navegador se queda esperando una
// respuesta que ya no va a llegar y el botón gira para siempre. Ninguna de las
// rutas que llaman al agente lo declaraba, y por eso los cuatro botones
// (escribir, investigar, generar, escribir todos) fallaban a la vez.
export const maxDuration = 600;
export const dynamic = "force-dynamic";


const OPTIMIZER_SYSTEM = `${CONTEXTO_CLIENTE} Eres su editor SEO senior. Recibes:
1. Un artículo existente (su markdown, título y URL).
2. Queries reales por las que esa página YA aparece en Google pero ranquea fuera del top 5 (pos 5-20) — la palanca para subir a página 1.

TU TAREA: reescribir y EXPANDIR el artículo a calidad publicable para capturar mejor esas queries, sin perder lo bueno del original.

ESTRATEGIA:
- Conserva el ángulo, la voz y las partes fuertes del artículo original — esto es una mejora, no un reemplazo desde cero.
- Para CADA query striking-distance, asegúrate de que el artículo cubra ese subtema de forma explícita y sustanciosa: un H2/H3 dedicado, un párrafo con datos/ejemplos, o una pregunta en el FAQ. La intención de búsqueda de esa query debe quedar 100% respondida.
- Refuerza intro (gancho + respuesta directa extractable), añade tablas/listas donde aporten, y un FAQ con las queries como preguntas.
- Sube la profundidad y especificidad: ejemplos concretos, números, escenarios de PYME reales. Cero relleno.
- Apunta a 1.600–2.400 palabras (debe quedar más completo que el original).

CALIDAD: párrafos cortos, negritas en lo clave, sin clichés, sin estadísticas inventadas, voz experta que le habla al lector de "tú", optimizado para Google Y para ser citado por IA (GEO).

FORMATO: devuelve SOLO el cuerpo markdown reescrito (sin frontmatter, sin H1, sin code fence).`;

// POST /api/blog/optimize
//   { path: "/slug/", queries: [{query, position, impressions}], existingMarkdown?: string }
export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const urlPath: string = body.path;
  const queries: Array<{ query: string; position: number; impressions: number }> = body.queries ?? [];

  if (!urlPath || queries.length === 0) {
    return NextResponse.json(
      { error: "Faltan 'path' o 'queries'" },
      { status: 400 }
    );
  }

  // Se comprueba la FORMA, no solo que haya algo.
  //
  // Con una lista de cadenas en vez de objetos, `q.query` quedaba en undefined,
  // se colaba en las keywords del frontmatter y gray-matter reventaba con
  // "unacceptable kind of an object to dump [object Undefined]": un error que no
  // nombra ni el campo ni la causa, después de gastar 1,4 minutos de agente.
  // La pantalla de Reportes manda `p.strikingDistance`, que puede llegar vacío,
  // así que no era solo un problema de pruebas.
  const validas = queries.filter((q) => q && typeof q.query === "string" && q.query.trim());
  if (!validas.length) {
    return NextResponse.json(
      {
        error:
          "Cada elemento de 'queries' tiene que ser un objeto con 'query' (texto), y opcionalmente 'position' e 'impressions'. Llegó una lista sin ninguna consulta válida.",
      },
      { status: 400 },
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

    const queryList = validas
      .map((q) => `- "${q.query}"` + (q.position != null ? ` (pos ${q.position}, ${q.impressions ?? "?"} impr)` : ""))
      .join("\n");

    const title = local?.title ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const lang = local?.lang ?? "en";
    const category = local?.category ?? "SEO";
    const keywords = [...(local?.keywords ?? []), ...validas.map((q) => q.query)];

    const newMarkdown = await runClaude({
      model: "sonnet",
      system: OPTIMIZER_SYSTEM,
      prompt: `Artículo: "${title}"  ·  URL: https://${CLIENTE.dominio}${urlPath}\nIdioma: ${lang}.\n\nQueries striking-distance a capturar:\n${queryList}\n\n${existing}\n\nReescribe el artículo.`,
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

    // La compuerta, que esta ruta se saltaba entera. El artículo que produjo
    // llegó con 47 bloqueos porque nadie comprobaba nada antes de guardarlo.
    const revisado = await dejarPublicable(local ? `${title} (optimized)` : title, newMarkdown, { metaDescription: excerpt });

    const post = createBlogPost({
      title: local ? `${title} (optimized)` : title,
      slug: newSlug,
      excerpt,
      keywords: [...new Set(keywords)].slice(0, 6),
      lang,
      category,
      status: "draft",
      markdown: revisado.markdown,
    });

    await persistChanges(`optimize: ${urlPath}`, [
      path.join(process.cwd(), "content", "blog", `${post.slug}.md`),
    ]);

    return NextResponse.json({
      ok: true,
      slug: post.slug,
      // Lo que quedó sin resolver se dice, no se calla.
      pendientes: revisado.pendientes,
      publicable: revisado.qa.ok,
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
});
