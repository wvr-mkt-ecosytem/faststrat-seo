import { NextRequest, NextResponse } from "next/server";
import { searchconsole, dateRange } from "@/lib/gsc";

// Análisis detallado por página: métricas, top queries que la traen,
// queries en striking-distance dentro de la página, y tendencia vs período
// anterior. Devuelve solo las URLs de faststrat.ai (no la home).
//
// GET /api/gsc/pages-detail?days=28

const NOISE = /"|http|daterange:|\bfast ?strat\b|\bstrat ?fast\b|faststrat|^\d+:/i;

function normalizePath(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "") || "/";
}

function shiftRange(days: number, back: number) {
  const end = new Date();
  end.setDate(end.getDate() - back);
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "28");

  try {
    const cur = dateRange(days);
    const prev = shiftRange(days, days);

    // 1) Métricas por página (período actual)
    const curPagesRes = await searchconsole.searchanalytics.query({
      siteUrl: process.env.GSC_SITE_URL!,
      requestBody: {
        startDate: cur.startDate,
        endDate: cur.endDate,
        dimensions: ["page"],
        rowLimit: 500,
        dataState: "all",
      },
    });

    // 2) Métricas por página (período anterior, para tendencia)
    const prevPagesRes = await searchconsole.searchanalytics.query({
      siteUrl: process.env.GSC_SITE_URL!,
      requestBody: {
        startDate: prev.startDate,
        endDate: prev.endDate,
        dimensions: ["page"],
        rowLimit: 500,
        dataState: "all",
      },
    });

    // 3) Página + query (todo junto, para asociar queries a páginas)
    const pageQueryRes = await searchconsole.searchanalytics.query({
      siteUrl: process.env.GSC_SITE_URL!,
      requestBody: {
        startDate: cur.startDate,
        endDate: cur.endDate,
        dimensions: ["page", "query"],
        rowLimit: 5000,
        dataState: "all",
      },
    });

    // Agrupa por page del período actual
    type PageAgg = {
      path: string;
      clicks: number;
      impressions: number;
      posWeight: number; // posición ponderada por impresiones
    };
    const aggregate = (rows: typeof curPagesRes.data.rows) => {
      const map = new Map<string, PageAgg>();
      for (const r of rows ?? []) {
        const path = normalizePath(r.keys?.[0] ?? "");
        const ex = map.get(path);
        const clicks = r.clicks ?? 0;
        const impressions = r.impressions ?? 0;
        const position = r.position ?? 0;
        if (ex) {
          ex.clicks += clicks;
          ex.impressions += impressions;
          ex.posWeight += position * impressions;
        } else {
          map.set(path, { path, clicks, impressions, posWeight: position * impressions });
        }
      }
      return map;
    };

    const curMap = aggregate(curPagesRes.data.rows);
    const prevMap = aggregate(prevPagesRes.data.rows);

    // Agrupa queries por página
    const queriesByPage = new Map<
      string,
      { query: string; clicks: number; impressions: number; position: number; ctr: number }[]
    >();
    for (const r of pageQueryRes.data.rows ?? []) {
      const path = normalizePath(r.keys?.[0] ?? "");
      const query = r.keys?.[1] ?? "";
      if (!query || NOISE.test(query) || query.length > 80) continue;
      const list = queriesByPage.get(path) ?? [];
      list.push({
        query,
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        position: Math.round((r.position ?? 0) * 10) / 10,
        ctr: Math.round((r.ctr ?? 0) * 1000) / 10,
      });
      queriesByPage.set(path, list);
    }

    const pages = [...curMap.values()]
      .map((p) => {
        const prev = prevMap.get(p.path);
        const position =
          p.impressions > 0 ? Math.round((p.posWeight / p.impressions) * 10) / 10 : 0;
        const ctr =
          p.impressions > 0 ? Math.round((p.clicks / p.impressions) * 1000) / 10 : 0;
        const all = (queriesByPage.get(p.path) ?? []).sort(
          (a, b) => b.impressions - a.impressions
        );
        const topQueries = all.slice(0, 8);
        // Striking-distance dentro de esta página: queries por las que la página
        // aparece en pos 5-20 con impresiones decentes — son la palanca para subir.
        const striking = all
          .filter((q) => q.position >= 5 && q.position <= 20 && q.impressions >= 10)
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 5);
        return {
          path: p.path,
          clicks: p.clicks,
          impressions: p.impressions,
          ctr,
          position,
          clicksDelta: p.clicks - (prev?.clicks ?? 0),
          impressionsDelta: p.impressions - (prev?.impressions ?? 0),
          topQueries,
          strikingDistance: striking,
        };
      })
      // Solo páginas con algo de señal
      .filter((p) => p.impressions >= 10)
      .sort((a, b) => b.clicks - a.clicks);

    return NextResponse.json({
      startDate: cur.startDate,
      endDate: cur.endDate,
      previousStartDate: prev.startDate,
      previousEndDate: prev.endDate,
      pages,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
