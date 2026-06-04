import { NextRequest, NextResponse } from "next/server";
import { queryAnalytics } from "@/lib/gsc";

// Ruido: operadores booleanos de bots, urls, marca, IDs numéricos.
const NOISE = /"|http|daterange:|\bfast ?strat\b|\bstrat ?fast\b|faststrat|^\d+:/i;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "90");

  try {
    const { rows, startDate, endDate } = await queryAnalytics("query", days, 1000);

    const clean = rows
      .filter((r) => r.query && !NOISE.test(r.query) && r.query.length < 80)
      .map((r) => ({
        query: r.query!,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Math.round(r.ctr * 1000) / 10,
        position: Math.round(r.position * 10) / 10,
      }));

    // Striking distance: pos 5-20 con impresiones decentes → empujar a página 1.
    const strikingDistance = clean
      .filter((r) => r.position >= 5 && r.position <= 20 && r.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 25);

    // Sin explotar: muchas impresiones, casi cero clicks → falta contenido.
    const untapped = clean
      .filter((r) => r.impressions >= 50 && r.clicks <= 1)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 25);

    const topByClicks = [...clean]
      .filter((r) => r.clicks > 0)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20);

    const topByImpressions = [...clean]
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 20);

    const totals = clean.reduce(
      (acc, r) => {
        acc.clicks += r.clicks;
        acc.impressions += r.impressions;
        return acc;
      },
      { clicks: 0, impressions: 0 }
    );

    return NextResponse.json({
      startDate,
      endDate,
      totalQueries: clean.length,
      totals,
      strikingDistance,
      untapped,
      topByClicks,
      topByImpressions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
