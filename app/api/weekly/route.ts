import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
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
- 7 en inglés, 3 en español (mercado LATAM).
- Prioriza queries striking-distance reales del input cuando aporten.
- Mezcla tipos: comparaciones, guías, listicles, "vs", tendencias.
- competitors: 3-4 observaciones sobre quién rankea y qué huecos hay.
- trends: 4-5 tendencias 2026 relevantes para PYMEs (GEO/AEO, agentes IA, social commerce, etc.).`;

export async function POST(request: NextRequest) {
  const secret = process.env.WEEKLY_SECRET;
  if (secret && request.headers.get("x-weekly-secret") !== secret) {
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
      prompt: `Hoy: ${today}.\n\nSeñales de GSC:\n${signalSummary}\n\nDevuelve la tanda semanal (JSON estricto).`,
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

    // 4) Email de aviso
    const to = process.env.REPORT_EMAIL_TO;
    let emailResult: { ok: boolean; error?: string } = { ok: false };
    if (to) {
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
}
