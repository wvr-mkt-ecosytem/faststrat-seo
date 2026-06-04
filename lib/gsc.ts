import { google } from "googleapis";

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

export const searchconsole = google.searchconsole({ version: "v1", auth });

export function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

export interface GscRow {
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Consulta search analytics por una dimensión y devuelve filas crudas. */
export async function queryAnalytics(
  dimension: "page" | "query",
  days: number,
  rowLimit = 1000
): Promise<{ rows: GscRow[]; startDate: string; endDate: string }> {
  const { startDate, endDate } = dateRange(days);
  const res = await searchconsole.searchanalytics.query({
    siteUrl: process.env.GSC_SITE_URL!,
    requestBody: {
      startDate,
      endDate,
      dimensions: [dimension],
      rowLimit,
      dataState: "all",
    },
  });
  const rows = (res.data.rows ?? []).map((r) => ({
    [dimension]: r.keys?.[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  })) as GscRow[];
  return { rows, startDate, endDate };
}
