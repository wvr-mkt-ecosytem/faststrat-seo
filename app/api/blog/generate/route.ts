import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { createBlogPost, slugify } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { persistChanges } from "@/lib/persist";

const WRITER_SYSTEM = `Eres redactor SEO senior y estratega de contenido para FastStrat, una plataforma de agentes de IA de marketing para PYMEs (mercados LATAM y EEUU). Escribes artículos de blog de calidad publicable — del nivel de un especialista humano experimentado, no de IA genérica.

OBJETIVO: que el artículo (a) rankee en Google, (b) sea genuinamente útil para un dueño de PYME o marketer, y (c) sea lo suficientemente claro y citable como para que ChatGPT/Perplexity lo referencien (GEO).

ESTÁNDARES DE CALIDAD (obligatorios):
- Profundidad real: 1.500–2.200 palabras. Cada sección aporta algo concreto — datos, pasos, ejemplos, números, comparaciones. CERO relleno.
- Intro con gancho (2-3 frases): plantea el problema o promete el resultado. Nada de "en el mundo acelerado de hoy" ni rodeos.
- Estructura escaneable: 5-8 secciones H2, con H3 cuando ayude. Párrafos de 2-4 frases. Usa **negritas** para los puntos clave.
- Especificidad: ejemplos concretos, rangos de costos, escenarios reales de PYMEs, nombres de herramientas reales. Nada vago.
- Al menos una tabla comparativa o lista estructurada cuando el tema lo permita (las tablas se citan y rankean bien).
- Una respuesta directa y extractable cerca del inicio (un párrafo que responda la pregunta principal en 2-3 frases — esto es lo que las IA citan).
- Sección de FAQ al final (3-4 preguntas reales que la gente busca, con respuestas de 2-3 frases).
- Cierre con una conclusión accionable + una mención natural y NO agresiva de cómo FastStrat (agentes de IA de marketing) ayuda con el tema, solo si encaja.
- Honestidad: NO inventes estadísticas. Si citas un dato, que sea creíble y verificable; si no lo tienes, frasea cualitativamente ("la mayoría de las PYMEs…") o usa rangos razonables.
- Voz: experta, directa, útil, con personalidad. Le hablas al lector de "tú". Sin clichés de marketing, sin jerga vacía, sin promesas exageradas.
- SEO: usa la keyword principal de forma natural en intro, en al menos un H2 y en la conclusión — sin saturar. Incluye variantes y términos relacionados (semántica).

FORMATO DE SALIDA: devuelve ÚNICAMENTE el cuerpo del artículo en Markdown. Sin frontmatter, sin título H1 (el H1 es el título del post), sin envolverlo en bloques de código. Empieza directo con el párrafo de intro.`;

// POST /api/blog/generate { keyword, title?, lang?, category? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  // Modo A: keyword (+ title opcional). Modo B: topic libre (el agente elige título).
  const keyword: string | undefined = body.keyword;
  const topic: string | undefined = body.topic;
  if (!keyword && !topic) {
    return NextResponse.json({ error: "Falta 'keyword' o 'topic'" }, { status: 400 });
  }
  const lang: string = body.lang ?? "en";
  const category: string = body.category ?? "SEO";

  try {
    let title: string;
    let markdown: string;

    if (topic && !body.title) {
      // El agente elige un título SEO atractivo a partir del tema y escribe.
      const raw = await runClaude({
        model: "sonnet",
        system: WRITER_SYSTEM,
        prompt: `Tema/ángulo para el artículo (puede ser un insight de competidor o tendencia): "${topic}"
Idioma: ${lang === "es" ? "español (natural de LATAM)" : "inglés"}.
Audiencia: dueños de PYMEs y marketers.

Primero elige un TÍTULO SEO específico y atractivo para este tema (no genérico).
Tu respuesta debe empezar EXACTAMENTE con la línea:
TITLE: <el título>
Luego una línea en blanco y después el artículo completo en Markdown (1.500–2.200 palabras, siguiendo todos los estándares de calidad).`,
      });
      const m = raw.match(/^\s*TITLE:\s*(.+?)\s*\n/i);
      title = m ? m[1].trim().replace(/^["']|["']$/g, "") : topic.slice(0, 70);
      markdown = raw.replace(/^\s*TITLE:\s*.+?\n/i, "").trim();
    } else {
      title =
        body.title ??
        (lang === "es" ? `Guía 2026: ${keyword}` : `${keyword}: The 2026 Guide`);
      markdown = await runClaude({
        model: "sonnet",
        system: WRITER_SYSTEM,
        prompt: `Escribe el artículo completo siguiendo TODOS los estándares de calidad.
Título del artículo (es el H1, no lo repitas): "${title}"
Keyword principal a posicionar: "${keyword ?? title}"
Idioma: ${lang === "es" ? "español (natural de LATAM, no traducido)" : "inglés"}.
Audiencia: dueños de PYMEs y marketers que buscan resultados prácticos.
Apunta a 1.500–2.200 palabras de contenido sustancioso y específico.`,
      });
    }

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
      keywords: [keyword ?? title],
      lang,
      category,
      status: "draft", // los generados desde reportes entran como borrador
      markdown,
    });

    // Persiste al repo si está corriendo en producción (Render).
    await persistChanges(`new blog draft: ${post.slug}`, [
      path.join(process.cwd(), "content", "blog", `${post.slug}.md`),
    ]);

    // Preview: primeros ~500 caracteres del cuerpo para mostrar en el reporte.
    const preview = markdown.trim().slice(0, 500);

    return NextResponse.json({
      ok: true,
      slug: post.slug,
      title: post.title,
      excerpt,
      preview,
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
