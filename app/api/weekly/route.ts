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
import { leerMemoria, bloqueDeMemoria, descartarRepetidas } from "@/lib/idea-memory";
import { CLIENTE, CONTEXTO_CLIENTE, RUIDO_MARCA } from "@/lib/cliente";
import { tendencias, describir, type Tendencia } from "@/lib/trends";
import { sinRepetir } from "@/lib/similitud";

// Cuánto puede tardar. Sin esto, la plataforma corta la petición a mitad de la
// llamada al agente y no devuelve nada: el navegador se queda esperando una
// respuesta que ya no va a llegar y el botón gira para siempre. Ninguna de las
// rutas que llaman al agente lo declaraba, y por eso los cuatro botones
// (escribir, investigar, generar, escribir todos) fallaban a la vez.
export const maxDuration = 800;
export const dynamic = "force-dynamic";


// POST /api/weekly  — corrida semanal autónoma.
// Protegido con WEEKLY_SECRET (header x-weekly-secret).
// Lo dispara el cron job gratuito de Render con curl + header.

// El nombre del cliente sale de la configuración, no escrito aquí. Con la marca
// fija, el sistema replicado para otra empresa filtraba la marca equivocada y
// dejaba pasar la suya como si fuera un tema del que escribir.
const NOISE = new RegExp(`"|http|daterange:|${RUIDO_MARCA}|^\\d+:`, "i");

const RESEARCHER_SYSTEM = `${CONTEXTO_CLIENTE} Eres su estratega de contenido senior.

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
      "rationale": "1 frase de por qué el TEMA vale la pena",
      "keywordRationale": "2 frases: qué intenta resolver quien escribe esa búsqueda, y por qué podemos responderle mejor que lo que hay hoy arriba. Habla de la BÚSQUEDA, no del artículo.",
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

    // La dirección de la demanda ENTRA en la decisión, no la comenta después.
    //
    // Antes las tendencias se consultaban al final, cuando el agente ya había
    // elegido los diez temas: servían para bajar prioridades, no para elegir
    // mejor. Ahora van dentro de las señales que recibe, así que puede
    // descartar un tema en caída antes de proponerlo.
    //
    // Medido sobre las 20 keywords del blog: 9 caen, 3 suben, 8 no tienen
    // volumen medible. Escribir sin este dato es lo que produjo esa foto.
    const candidatas = [...striking.slice(0, 10), ...untapped.slice(0, 6)]
      .map((r) => r.query)
      .filter((q): q is string => !!q);
    let direccionDe = new Map<string, Tendencia>();
    try {
      direccionDe = await tendencias(candidatas, { limite: 16 });
    } catch {
      // Endpoint no oficial. Si falla, el agente elige sin este dato, como antes.
    }

    const conTendencia = (r: { query?: string; impressions: number; position: number }) => {
      const t = r.query ? direccionDe.get(r.query) : undefined;
      return (
        `- "${r.query}" — ${r.impressions} impr, pos ${r.position.toFixed(1)}` +
        (t ? `  [demanda: ${describir(t)}]` : "")
      );
    };

    const signalSummary =
      "STRIKING DISTANCE:\n" +
      striking.map(conTendencia).join("\n") +
      "\n\nSIN EXPLOTAR:\n" +
      untapped.map(conTendencia).join("\n") +
      `

CÓMO LEER "[demanda: ...]": es Google Trends, comparando los últimos 12 meses con los 12 anteriores.
- "baja" y por debajo de 35/100 de su máximo: NO propongas ese tema salvo que la intención de compra sea altísima. Escribir sobre demanda que se está muriendo es trabajo perdido.
- "sube": priorízalo. Llegar temprano a un tema que crece vale más que pelear uno saturado.
- "sin volumen medible": el término es muy long-tail. No lo descartes por eso, pero no esperes volumen: trátalo como pieza de profundidad para quien ya sabe lo que busca, no como cabecera de tráfico.
- Sin corchete: no se pudo consultar. Decide por las otras señales.`;

    // 2) El agente arma la tanda, sabiendo qué ya existe.
    //
    // Antes esta ruta no leía NADA previo: ni tandas anteriores ni artículos
    // escritos. Con las mismas señales de GSC cada semana devolvía las mismas
    // diez ideas, y desde la pantalla eso se veía como "el botón no sirve".
    const memoria = leerMemoria();
    const today = new Date().toISOString().split("T")[0];
    const raw = await runClaude({
      model: "sonnet",
      system: RESEARCHER_SYSTEM,
      // WebSearch activo → el agente busca en la web de verdad, así competidores
      // y tendencias reflejan el estado actual, no la memoria del modelo.
      allowedTools: ["WebSearch", "WebFetch"],
      prompt: `Hoy: ${today}.\n\nSeñales de GSC:\n${signalSummary}\n\nINSTRUCCIONES DE INVESTIGACIÓN:\n1. Busca en la web qué están publicando AHORA los competidores de ${CLIENTE.nombre} (${CLIENTE.competidores.join(', ')}, entre otros) — temas, títulos recientes, ángulos.\n2. Busca tendencias actuales 2026 en marketing/IA/PYMEs (GEO/AEO, agentes de IA, social commerce, etc.).\n3. Combina esos hallazgos REALES con las señales de GSC de arriba.\nDevuelve la tanda semanal (JSON estricto). Los arrays competitors y trends deben reflejar lo que encontraste en la web, citando lo concreto.

${bloqueDeMemoria(memoria)}`,
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
      keywordRationale: i.keywordRationale ? String(i.keywordRationale) : undefined,
      outline: Array.isArray(i.outline) ? i.outline.slice(0, 6) : [],
    }));

    // El descarte es mecánico, no una confianza.
    //
    // "No repitas los que te paso" ya está en el prompt y el agente repite
    // igual. Se comprueba contra la memoria completa (todas las tandas más los
    // artículos escritos) y se dice cuántas cayeron: "salieron las mismas" sin
    // un número no se puede diagnosticar.
    const { nuevas, descartadas } = descartarRepetidas(ideas, memoria);

    // Segundo filtro: títulos que se PISAN, no solo los idénticos.
    //
    // descartarRepetidas compara contra la memoria por título exacto. Eso deja
    // pasar dos ideas de la misma tanda que tratan lo mismo con otras palabras,
    // que es como nacieron las cinco canibalizaciones que hoy hay que deshacer
    // con redirecciones.
    const { conservadas, descartadas: pisadas } = sinRepetir(
      nuevas,
      [...memoria.titulos, ...memoria.escritos].map((t) => ({ title: t })),
    );

    // La dirección del tema: sube, baja o se mantiene.
    //
    // Es lo único que ni Search Console ni el agente sabían. GSC dice qué se
    // busca hoy y dónde apareces; no dice si la demanda lleva dos años cayendo.
    // Nunca frena la tanda: si Trends falla, las ideas salen sin este dato.
    let direcciones = new Map<string, Tendencia>();
    try {
      // Solo las que no se consultaron ya arriba: cada término son dos
      // peticiones a un endpoint que limita el ritmo, y repetirlas es lo que
      // provoca los 429 que ya nos ha devuelto.
      for (const i of conservadas) {
        const t = i.primaryKeyword && direccionDe.get(i.primaryKeyword);
        if (t) direcciones.set(i.primaryKeyword, t);
      }
      const faltan = conservadas
        .map((i) => i.primaryKeyword)
        .filter((k): k is string => !!k && !direccionDe.has(k));
      for (const [k, v] of await tendencias(faltan, { limite: 10 })) direcciones.set(k, v);
    } catch {
      // Endpoint no oficial: puede cambiar o limitar el ritmo sin aviso.
    }

    for (const idea of conservadas) {
      const t = direcciones.get(idea.primaryKeyword);
      if (t) {
        idea.trend = { direccion: t.direccion, cambioAnual: t.cambioAnual, nivelActual: t.nivelActual };
        // Un tema en caída baja de prioridad solo, sin que nadie lo mire: es la
        // decisión más fácil de automatizar y la que más trabajo ahorra.
        if (t.direccion === "baja" && t.nivelActual < 35 && idea.priority === "alta") {
          idea.priority = "media";
          idea.rationale += ` [La demanda cae ${Math.abs(t.cambioAnual)}% interanual y está en ${t.nivelActual}/100 de su máximo: prioridad bajada.]`;
        }
      }
    }

    const batch: IdeaBatch = {
      weekOf: today,
      generatedAt: new Date().toISOString(),
      source: "auto-weekly",
      summary:
        String(parsed.summary ?? "Tanda semanal automática.") +
        (descartadas.length || pisadas.length
          ? ` (${descartadas.length + pisadas.length} idea(s) descartada(s): ${descartadas.length} por repetir algo ya propuesto o escrito, ${pisadas.length} por pisarse con otro título.)`
          : ""),
      research: {
        competitors: Array.isArray(parsed.research?.competitors) ? parsed.research.competitors : [],
        trends: Array.isArray(parsed.research?.trends) ? parsed.research.trends : [],
      },
      ideas: conservadas,
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
          <h1 style="color:#5a1a1a;font-size:22px;margin:0 0 6px">${CLIENTE.nombre} · Nueva tanda de ideas</h1>
          <p style="font-size:13px;color:#6e6a64;margin:0 0 16px">Semana del ${today} · ${conservadas.length} artículos sugeridos</p>
          <p style="font-size:14px">${batch.summary}</p>
          <ol style="font-size:14px;line-height:1.6">
            ${ideas.map((i) => `<li><b>${i.title}</b> <span style="color:#6e6a64">· ${i.priority} · ${i.lang}</span></li>`).join("")}
          </ol>
          <p style="margin-top:24px"><a href="${baseUrl}/ideas" style="background:#5a1a1a;color:#f7f2e9;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;font-size:14px">Ver en el dashboard</a></p>
        </div>
      </div>`;
      emailResult = await sendEmail({
        to,
        subject: `${CLIENTE.nombre} · ${conservadas.length} nuevas ideas (${today})`,
        html,
      });
    }

    return NextResponse.json({
      ok: true,
      // Cuántas se cayeron por repetidas. Sin este número, "salieron las
      // mismas" es una queja que no se puede comprobar ni desmentir.
      descartadasPorRepetir: descartadas.length,
      descartadasPorPisarse: pisadas.length,
      conTendencia: [...direcciones.keys()].length,
      weekOf: today,
      ideas: conservadas.length,
      emailed: emailResult.ok,
      emailError: emailResult.error,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
