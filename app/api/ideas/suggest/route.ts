import fs from "fs";
import { apiRoute } from "@/lib/google-auth-state";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getIdeaBatches, type ArticleIdea, type IdeaBatch } from "@/lib/ideas";
import { slugify } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { persistChanges } from "@/lib/persist";
import { CONTEXTO_CLIENTE, CLIENTE } from "@/lib/cliente";

// Cuánto puede tardar. Sin esto, la plataforma corta la petición a mitad de la
// llamada al agente y no devuelve nada: el navegador se queda esperando una
// respuesta que ya no va a llegar y el botón gira para siempre. Ninguna de las
// rutas que llaman al agente lo declaraba, y por eso los cuatro botones
// (escribir, investigar, generar, escribir todos) fallaban a la vez.
export const maxDuration = 300;
export const dynamic = "force-dynamic";


const IDEAS_DIR = path.join(process.cwd(), "data", "ideas");

const SUGGEST_SYSTEM = `${CONTEXTO_CLIENTE} Eres su estratega de contenido SEO.

Dada una query de búsqueda real, propones UN artículo de blog para capturarla. Devuelves SOLO un objeto JSON válido (sin texto extra, sin bloques de código) con esta forma exacta:
{"title": "...", "lang": "en|es", "intent": "...", "rationale": "...", "outline": ["...","...","...","...","..."]}

- title: titular atractivo y optimizado para la query (no copies la query literal).
- lang: "es" si la query está en español, si no "en".
- intent: intención de búsqueda en pocas palabras.
- rationale: 1 frase de por qué vale la pena para ${CLIENTE.nombre}.
- outline: 5 secciones H2 propuestas.`;

// POST /api/ideas/suggest { keyword, context? }
// Usa el agente para crear una idea rica desde el keyword y la guarda en la tanda.
export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const keyword: string = body.keyword;
  if (!keyword) {
    return NextResponse.json({ error: "Falta 'keyword'" }, { status: 400 });
  }

  try {
    const raw = await runClaude({
      model: "sonnet",
      system: SUGGEST_SYSTEM,
      prompt: `Query: "${keyword}".${body.context ? " Contexto: " + body.context : ""}\nPropón el artículo en JSON.`,
    });

    // Extrae el JSON (por si viniera con texto alrededor).
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    if (!parsed?.title) throw new Error("El agente no devolvió una idea válida");

    const idea: ArticleIdea = {
      title: parsed.title,
      slug: slugify(parsed.title),
      lang: parsed.lang === "es" ? "es" : "en",
      priority: "media",
      primaryKeyword: keyword,
      intent: parsed.intent ?? "Informacional",
      rationale: parsed.rationale ?? `Desde reporte de queries: "${keyword}".`,
      outline: Array.isArray(parsed.outline) ? parsed.outline.slice(0, 6) : [],
    };

    // Guarda en la tanda de hoy (o la crea).
    fs.mkdirSync(IDEAS_DIR, { recursive: true });
    const batches = getIdeaBatches();
    const today = new Date().toISOString().split("T")[0];
    // Siempre a la tanda más reciente, nunca a una nueva por fecha. La fecha
    // se calcula en UTC, así que a partir de las 7 de la tarde en Bogotá el
    // servidor cree que es mañana y abría una tanda aparte: la idea sugerida
    // desaparecía de la lista que el usuario está mirando.
    let batch: IdeaBatch;
    if (batches[0]) {
      batch = batches[0];
    } else {
      batch = {
        weekOf: today,
        generatedAt: new Date().toISOString(),
        source: "manual-suggest",
        summary: "Ideas sugeridas desde el reporte de queries.",
        research: { competitors: [], trends: [] },
        ideas: [],
      };
    }
    if (!batch.ideas.some((i) => i.slug === idea.slug)) batch.ideas.unshift(idea);
    const outPath = path.join(IDEAS_DIR, `${today}.json`);
    fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
    await persistChanges(`idea suggested: ${idea.slug}`, [outPath]);

    return NextResponse.json({ ok: true, idea, weekOf: batch.weekOf });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
