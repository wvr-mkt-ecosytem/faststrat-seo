import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { ga4Configured, pageStats, joinWithSearch } from "@/lib/ga4";
import { queryAnalytics } from "@/lib/gsc";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Cruza Search Console con GA4 y devuelve un veredicto por página.
//
// Por separado, cada fuente deja la pregunta a medias: GSC se acaba en el clic
// y GA4 empieza ahí. Juntas dicen si el problema de una página es que no la
// ven, que no la clican, que entran y se van, o que leen y no convierten. Son
// cuatro arreglos distintos y hasta ahora no había forma de distinguirlos.

export const GET = apiRoute(async (req: Request) => {
  const days = Number(new URL(req.url).searchParams.get("days") || 28);

  if (!ga4Configured()) {
    return NextResponse.json({
      connected: false,
      reason:
        "Falta GOOGLE_MEASUREMENT_REFRESH_TOKEN. Es el mismo token que usa Tag Manager: se pidió con los scopes de GTM y Analytics a la vez.",
      action: "Corre `node scripts/get-measurement-token.mjs` y copia el token también a Render.",
    });
  }

  const [ga, gscRes] = await Promise.all([
    pageStats(days),
    queryAnalytics("page", days).catch(() => ({ rows: [] })),
  ]);

  const gsc = (gscRes.rows ?? []).map((r) => ({
    page: r.page,
    clicks: r.clicks,
    impressions: r.impressions,
    position: r.position,
  }));

  const joined = joinWithSearch(gsc, ga);

  // Agrupar por veredicto es lo que lo vuelve accionable: cada grupo es un
  // arreglo distinto, y sin agrupar es una tabla de 500 filas que nadie mira.
  const byVerdict: Record<string, number> = {};
  for (const j of joined) byVerdict[j.verdict] = (byVerdict[j.verdict] || 0) + 1;

  return NextResponse.json({
    connected: true,
    days,
    property: process.env.GA4_PROPERTY_ID || "503953510",
    pages: joined.slice(0, 100),
    byVerdict,
    totals: {
      sessions: ga.reduce((s, g) => s + g.sessions, 0),
      conversions: ga.reduce((s, g) => s + g.conversions, 0),
      clicks: gsc.reduce((s, g) => s + g.clicks, 0),
    },
    // Que GA4 no vea páginas que GSC sí ve es señal de medición, no de tráfico.
    onlyInSearch: joined.filter((j) => j.verdict === "sin datos en GA4").length,
  });
});
