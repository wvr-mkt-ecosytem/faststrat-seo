import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { queryAnalytics } from "@/lib/gsc";
import { runClaude } from "@/lib/claude";
import { slugify } from "@/lib/blog";
import { persistChanges } from "@/lib/persist";
import { getIdeaBatches, type ArticleIdea, type IdeaBatch } from "@/lib/ideas";

const IDEAS_DIR = path.join(process.cwd(), "data", "ideas");
const NOISE = /"|http|daterange:|\bfast ?strat\b|\bstrat ?fast\b|faststrat|^\d+:/i;

const MORE_SYSTEM = `Eres estratega de contenido SEO senior para FastStrat (agentes de IA de marketing para PYMEs, mercado EEUU/global en INGLÉS).

Tu trabajo: proponer NUEVAS ideas de artículos de blog (en inglés) que maximicen tráfico orgánico y posicionamiento. Te basas en CUATRO fuentes:
1. Lo que YA genera clicks (replicar/expandir esos temas ganadores).
2. Queries striking-distance (donde ya apareces en pos 5-20 → contenido dedicado puede subirte a página 1).
3. Búsquedas de la INDUSTRIA y de COMPETIDORES (usa WebSearch para ver qué publican y rankean Jasper, HubSpot, Copy.ai, Enrich Labs, etc., y qué temas están calientes en marketing/IA para PYMEs 2026).
4. Temas con alto potencial de posicionamiento (volumen + baja dificultad + relevancia para FastStrat).

Devuelve SOLO un JSON válido (sin texto extra, sin code fence):
{"ideas":[{"title":"...","lang":"en","priority":"alta|media|baja","primaryKeyword":"...","intent":"...","rationale":"por qué este tema posiciona / de qué fuente sale","outline":["H2 1","H2 2","H2 3","H2 4","H2 5"]}]}

Reglas:
- TODO en inglés.
- 8 ideas nuevas.
- NO repitas los títulos/temas que te paso como "ya existentes".
- En rationale, di explícitamente de qué señal viene (ej. "expande el tema que ya trae más clicks", "striking-distance: pos 7 con 200 impr", "hueco vs competidor X", "tendencia de industria").
- Mezcla tipos: guías, comparaciones "vs", listicles, how-to, tendencias.`;

// POST /api/ideas/more  — agrega ideas nuevas a la tanda actual (no la reemplaza).
// Auth: WEEKLY_SECRET o login del dashboard.
export async function POST(request: NextRequest) {
  const secret = process.env.WEEKLY_SECRET;
  const dashUser = process.env.DASHBOARD_USER;
  const dashPass = process.env.DASHBOARD_PASSWORD;
  const hasSecret = secret && request.headers.get("x-weekly-secret") === secret;
  let hasDash = false;
  const authz = request.headers.get("authorization");
  if (dashUser && dashPass && authz?.startsWith("Basic ")) {
    const [u, p] = Buffer.from(authz.slice(6), "base64").toString().split(":");
    hasDash = u === dashUser && p === dashPass;
  }
  if ((secret || (dashUser && dashPass)) && !hasSecret && !hasDash) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  try {
    // 1) Señales de GSC
    const { rows } = await queryAnalytics("query", 90, 1000);
    const clean = rows.filter((r) => r.query && !NOISE.test(r.query) && r.query.length < 80);
    const topClicks = [...clean].filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 15);
    const striking = clean
      .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 20);

    // 2) Ideas existentes (para no repetir)
    const batches = getIdeaBatches();
    const today = new Date().toISOString().split("T")[0];
    const existing: IdeaBatch | undefined = batches[0];
    const existingTitles = (existing?.ideas ?? []).map((i) => i.title);

    const signals =
      "TEMAS QUE YA GENERAN CLICKS (replicar/expandir):\n" +
      topClicks.map((r) => `- "${r.query}" (${r.clicks} clicks, ${r.impressions} impr)`).join("\n") +
      "\n\nSTRIKING-DISTANCE (potencial de subir a página 1):\n" +
      striking.map((r) => `- "${r.query}" (pos ${r.position.toFixed(1)}, ${r.impressions} impr)`).join("\n") +
      "\n\nIDEAS YA EXISTENTES (NO repetir):\n" +
      existingTitles.map((t) => `- ${t}`).join("\n");

    const raw = await runClaude({
      model: "sonnet",
      system: MORE_SYSTEM,
      allowedTools: ["WebSearch", "WebFetch"],
      prompt: `Hoy: ${today}.

${signals}

Investiga en la web (competidores Jasper/HubSpot/Copy.ai/Enrich Labs y tendencias de marketing/IA para PYMEs 2026) y propón 8 ideas NUEVAS en inglés que nos posicionen mejor. JSON estricto.`,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("El agente no devolvió JSON válido");
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      throw new Error("No se generaron ideas");
    }

    const newIdeas: ArticleIdea[] = parsed.ideas.map((i: Partial<ArticleIdea>) => ({
      title: String(i.title ?? ""),
      slug: slugify(String(i.title ?? "")),
      lang: "en",
      priority: (i.priority as ArticleIdea["priority"]) ?? "media",
      primaryKeyword: String(i.primaryKeyword ?? ""),
      intent: String(i.intent ?? "Informacional"),
      rationale: String(i.rationale ?? ""),
      outline: Array.isArray(i.outline) ? i.outline.slice(0, 6) : [],
    })).filter((i: ArticleIdea) => i.title);

    // 3) Append a la tanda de hoy (o crea una)
    fs.mkdirSync(IDEAS_DIR, { recursive: true });
    let batch: IdeaBatch;
    if (existing && existing.weekOf === today) {
      batch = existing;
    } else {
      batch = {
        weekOf: today,
        generatedAt: new Date().toISOString(),
        source: "more",
        summary: "Ideas adicionales generadas desde señales de clicks, striking-distance y research de competidores/industria.",
        research: existing?.research ?? { competitors: [], trends: [] },
        ideas: [],
      };
    }
    const seen = new Set(batch.ideas.map((i) => i.slug));
    let added = 0;
    for (const idea of newIdeas) {
      if (!seen.has(idea.slug)) { batch.ideas.push(idea); seen.add(idea.slug); added++; }
    }

    const outPath = path.join(IDEAS_DIR, `${batch.weekOf}.json`);
    fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
    await persistChanges(`more ideas: +${added}`, [outPath]);

    return NextResponse.json({ ok: true, added, total: batch.ideas.length, weekOf: batch.weekOf });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
