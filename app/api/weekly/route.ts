import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { queryAnalytics } from "@/lib/gsc";
import { runClaude } from "@/lib/claude";
import { slugify } from "@/lib/blog";
import { sendEmail } from "@/lib/email";
import { persistChanges } from "@/lib/persist";
import type { ArticleIdea, IdeaBatch } from "@/lib/ideas";

// POST /api/weekly  — corrida semanal autónoma.
// Protegido con WEEKLY_SECRET (header x-weekly-secret).
// Lo dispara el cron job gratuito de Render con curl + header.

const NOISE = /"|http|daterange:|\bfast ?strat\b|\bstrat ?fast\b|faststrat|^\d+:/i;

const RESEARCHER_SYSTEM = `Eres estratega de contenido senior para FastStrat (plataforma de agentes de IA de marketing para PYMEs, LATAM/EEUU).

Recibes (1) un resumen de queries reales de Google Search Console con oportunidades striking-distance y (2) tu propio conocimiento general de tendencias actuales en marketing/IA/PYME.

Devuelves SOLO un JSON válido con esta forma (sin texto extra, sin code fence):
{
  "summary": "1 frase resumen de la tanda",
  "research": {
    "competitors": ["...", "..."],
    "trends": ["...", "..."]
  },
  "ideas": [
    {
      "title": "titular optimizado",
      "lang": "en|es",
      "priority": "alta|media|baja",
      "primaryKeyword": "...",
      "intent": "...",
      "rationale": "1 frase de por qué",
      "outline": ["H2 1", "H2 2", "H2 3", "H2 4", "H2 5"]
    }
  ]
}

Reglas:
- Exactamente 10 ideas.
- TODAS en inglés (lang: "en"). Los títulos, keywords, intención, rationale y outline en inglés — así el blog se publica directo en inglés.
- Prioriza queries striking-distance reales del input cuando aporten.
- Mezcla tipos: comparaciones, guías, listicles, "vs", tendencias.
- competitors: 3-4 observaciones (en inglés) sobre quién rankea y qué huecos hay.
- trends: 4-5 tendencias 2026 (en inglés) relevantes para PYMEs (GEO/AEO, agentes IA, social commerce, etc.).`;

export const POST = apiRoute(async (request: NextRequest) => {
  // Autoriza si: (a) trae el WEEKLY_SECRET (cron de GitHub Actions), o
  // (b) viene con el login del dashboard (botón "Refrescar" desde el navegador).
  const secret = process.env.WEEKLY_SECRET;
  const dashUser = process.env.DASHBOARD_USER;
  const dashPass = process.env.DASHBOARD_PASSWORD;

  const hasSecret = secret && request.headers.get("x-weekly-secret") === secret;

  let hasDashAuth = false;
  const authz = request.headers.get("authorization");
  if (dashUser && dashPass && authz?.startsWith("Basic ")) {
    const [u, p] = Buffer.from(authz.slice(6), "base64").toString().split(":");
    hasDashAuth = u === dashUser && p === dashPass;
  }

  // Si hay credenciales configuradas, exige al menos una vía válida.
  if ((secret || (dashUser && dashPass)) && !hasSecret && !hasDashAuth) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  try {
    // 1) Saca señales de GSC (últimos 90 días)
    const { rows } = await queryAnalytics("query", 90, 1000);
    const clean = rows.filter((r) => r.query && !NOISE.test(r.query) && r.query.length < 80);
    const striking = clean
      .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 25);
    const untapped = clean
      .filter((r) => r.impressions >= 50 && r.clicks <= 1)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15);

    const signalSummary =
      "STRIKING DISTANCE:\n" +
      striking
        .map((r) => `- "${r.query}" — ${r.impressions} impr, pos ${r.position.toFixed(1)}`)
        .join("\n") +
      "\n\nSIN EXPLOTAR:\n" +
      untapped
        .map((r) => `- "${r.query}" — ${r.impressions} impr, pos ${r.position.toFixed(1)}`)
        .join("\n");

    // 2) El agente arma la tanda
    const today = new Date().toISOString().split("T")[0];
    const raw = await runClaude({
      model: "sonnet",
      system: RESEARCHER_SYSTEM,
      // WebSearch activo → el agente busca en la web de verdad, así competidores
      // y tendencias reflejan el estado actual, no la memoria del modelo.
      allowedTools: ["WebSearch", "WebFetch"],
      prompt: `Hoy: ${today}.\n\nSeñales de GSC:\n${signalSummary}\n\nINSTRUCCIONES DE INVESTIGACIÓN:\n1. Busca en la web qué están publicando AHORA los competidores de FastStrat (plataformas de IA de marketing para PYMEs: Jasper, HubSpot, Copy.ai, Enrich Labs, etc.) — temas, títulos recientes, ángulos.\n2. Busca tendencias actuales 2026 en marketing/IA/PYMEs (GEO/AEO, agentes de IA, social commerce, etc.).\n3. Combina esos hallazgos REALES con las señales de GSC de arriba.\nDevuelve la tanda semanal (JSON estricto). Los arrays competitors y trends deben reflejar lo que encontraste en la web, citando lo concreto.`,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("El agente no devolvió JSON válido");
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      throw new Error("La tanda no contiene ideas");
    }

    const ideas: ArticleIdea[] = parsed.ideas.map((i: Partial<ArticleIdea>) => ({
      title: String(i.title ?? "(sin título)"),
      slug: slugify(String(i.title ?? "")),
      lang: i.lang === "es" ? "es" : "en",
      priority: (i.priority as ArticleIdea["priority"]) ?? "media",
      primaryKeyword: String(i.primaryKeyword ?? ""),
      intent: String(i.intent ?? "Informacional"),
      rationale: String(i.rationale ?? ""),
      outline: Array.isArray(i.outline) ? i.outline.slice(0, 6) : [],
    }));

    const batch: IdeaBatch = {
      weekOf: today,
      generatedAt: new Date().toISOString(),
      source: "auto-weekly",
      summary: String(parsed.summary ?? "Tanda semanal automática."),
      research: {
        competitors: Array.isArray(parsed.research?.competitors) ? parsed.research.competitors : [],
        trends: Array.isArray(parsed.research?.trends) ? parsed.research.trends : [],
      },
      ideas,
    };

    // 3) Guarda + persist al repo
    const dir = path.join(process.cwd(), "data", "ideas");
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `${today}.json`);
    fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
    await persistChanges(`weekly batch: ${today}`, [outPath]);

    // 4) Email de aviso (se omite con ?noEmail=1, ej. el botón "Refrescar")
    const noEmail = new URL(request.url).searchParams.get("noEmail") === "1";
    const to = process.env.REPORT_EMAIL_TO;
    let emailResult: { ok: boolean; error?: string } = { ok: false };
    if (to && !noEmail) {
      const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3100";
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#201b1b;max-width:560px;margin:auto;padding:24px;background:#f7f2e9">
        <div style="border-top:6px solid #5a1a1a;padding-top:16px">
          <h1 style="color:#5a1a1a;font-size:22px;margin:0 0 6px">FastStrat · Nueva tanda de ideas</h1>
          <p style="font-size:13px;color:#6e6a64;margin:0 0 16px">Semana del ${today} · ${ideas.length} artículos sugeridos</p>
          <p style="font-size:14px">${batch.summary}</p>
          <ol style="font-size:14px;line-height:1.6">
            ${ideas.map((i) => `<li><b>${i.title}</b> <span style="color:#6e6a64">· ${i.priority} · ${i.lang}</span></li>`).join("")}
          </ol>
          <p style="margin-top:24px"><a href="${baseUrl}/ideas" style="background:#5a1a1a;color:#f7f2e9;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;font-size:14px">Ver en el dashboard</a></p>
        </div>
      </div>`;
      emailResult = await sendEmail({
        to,
        subject: `FastStrat · ${ideas.length} nuevas ideas (${today})`,
        html,
      });
    }

    return NextResponse.json({
      ok: true,
      weekOf: today,
      ideas: ideas.length,
      emailed: emailResult.ok,
      emailError: emailResult.error,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
