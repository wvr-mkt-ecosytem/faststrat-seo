import { NextRequest, NextResponse } from 'next/server'
import { apiRoute } from "@/lib/google-auth-state";
import { queryAnalytics } from '@/lib/gsc'

export const GET = apiRoute(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '28')

  try {
    const { rows: raw, startDate, endDate } = await queryAnalytics('page', days, 500)

    // Agrega filas que normalizan a la misma ruta (http/https, query params, etc.)
    const byPage = new Map<
      string,
      { page: string; clicks: number; impressions: number; posWeight: number }
    >()

    for (const row of raw) {
      const page = (row.page ?? '').replace(/^https?:\/\/[^/]+/, '') || '/'
      const existing = byPage.get(page)
      if (existing) {
        existing.clicks += row.clicks
        existing.impressions += row.impressions
        existing.posWeight += row.position * row.impressions
      } else {
        byPage.set(page, {
          page,
          clicks: row.clicks,
          impressions: row.impressions,
          posWeight: row.position * row.impressions,
        })
      }
    }

    const rows = [...byPage.values()].map((r) => ({
      page: r.page,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 1000) / 10 : 0,
      position: r.impressions > 0 ? Math.round((r.posWeight / r.impressions) * 10) / 10 : 0,
    }))

    rows.sort((a, b) => b.clicks - a.clicks)

    return NextResponse.json({ rows, startDate, endDate })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
});
