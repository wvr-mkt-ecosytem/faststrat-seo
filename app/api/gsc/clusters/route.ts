import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { queryAnalytics } from "@/lib/gsc";

// Definición de clusters temáticos. Cada uno mapea a un blog nuevo (newSlug)
// o a una página existente a optimizar (existingPage).
const CLUSTERS: {
  name: string;
  match: RegExp;
  newSlug?: string;
  existingPage?: string;
}[] = [
  {
    name: "Presupuesto de marketing (SBA)",
    match: /budget|sba|percentage of revenue|advertising spend|marketing spend/i,
    newSlug: "small-business-marketing-budget-2026",
  },
  {
    name: "Agencia vs. DIY",
    match: /agency|diy|agency-led|hire (a )?marketing/i,
    newSlug: "marketing-agency-vs-diy-ai-tools-2026",
  },
  {
    name: "WhatsApp / BSP LATAM",
    match: /whatsapp|\bbsp\b|twilio/i,
    newSlug: "whatsapp-business-pricing-latam-2026",
  },
  {
    name: "Comparación de IA (Jasper/Copy.ai)",
    match: /jasper|copy ?\.?ai|hubspot ai|content pipeline/i,
    newSlug: "jasper-vs-copyai-vs-hubspot-ai-2026",
  },
  {
    name: "Herramientas SEO 2026",
    match: /seo tools|best seo/i,
    newSlug: "best-seo-tools-small-business-2026",
  },
  {
    name: "Prompt engineering",
    match: /prompt engineer|prompt /i,
    newSlug: "prompt-engineering-for-marketers-2026",
  },
  {
    name: "SEO para PYMEs (existente)",
    match: /small business seo|smb seo|seo.*small business|seo trends|seo strateg/i,
    existingPage: "/seo-for-small-business-2026/",
  },
];

const NOISE = /"|http|daterange:|\bfast ?strat\b|\bstrat ?fast\b|faststrat|^\d+:/i;

export const GET = apiRoute(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "90");

  try {
    const { rows, startDate, endDate } = await queryAnalytics("query", days, 1000);

    const clean = rows.filter(
      (r) => r.query && !NOISE.test(r.query) && r.query.length < 80
    );

    const buckets = CLUSTERS.map((c) => ({
      name: c.name,
      newSlug: c.newSlug ?? null,
      existingPage: c.existingPage ?? null,
      type: c.newSlug ? ("new" as const) : ("existing" as const),
      clicks: 0,
      impressions: 0,
      queryCount: 0,
      topQueries: [] as { query: string; impressions: number; position: number }[],
    }));

    let otherImpr = 0;
    let otherClicks = 0;

    for (const r of clean) {
      const idx = CLUSTERS.findIndex((c) => c.match.test(r.query!));
      if (idx === -1) {
        otherImpr += r.impressions;
        otherClicks += r.clicks;
        continue;
      }
      const b = buckets[idx];
      b.clicks += r.clicks;
      b.impressions += r.impressions;
      b.queryCount += 1;
      b.topQueries.push({
        query: r.query!,
        impressions: r.impressions,
        position: Math.round(r.position * 10) / 10,
      });
    }

    for (const b of buckets) {
      b.topQueries.sort((a, z) => z.impressions - a.impressions);
      b.topQueries = b.topQueries.slice(0, 5);
    }

    buckets.sort((a, z) => z.impressions - a.impressions);

    return NextResponse.json({
      clusters: buckets,
      other: { impressions: otherImpr, clicks: otherClicks },
      startDate,
      endDate,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
