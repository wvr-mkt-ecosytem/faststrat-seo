import { google } from "googleapis";

// Lee GA4 con la Data API.
//
// GA4 y Search Console responden preguntas distintas y por eso valen juntos:
// GSC dice cómo llega la gente desde la búsqueda (impresiones, clics, posición)
// y se acaba en el clic. GA4 empieza ahí: qué hicieron después.
//
// Cruzarlos es lo que convierte "este artículo tiene 300 clics" en una decisión.
// Un artículo con muchos clics y cero permanencia no necesita más tráfico:
// necesita otro contenido. Uno con poca impresión y buena permanencia no
// necesita reescribirse: necesita que lo vean.
//
// La propiedad sale de la URL del panel de GA4:
//   .../#/a367491730p503953510/admin/...   ->   p503953510
// El número tras la "p" es el property ID. Se deja configurable porque
// hardcodearlo ataría el repo a una sola cuenta.

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "503953510";

const auth = () => {
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  // El mismo token que Tag Manager: se pidió con los dos scopes a la vez.
  o.setCredentials({ refresh_token: process.env.GOOGLE_MEASUREMENT_REFRESH_TOKEN });
  return o;
};

export const ga4Configured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_MEASUREMENT_REFRESH_TOKEN,
  );

const dataApi = () => google.analyticsdata({ version: "v1beta", auth: auth() });

export interface PageStats {
  path: string;
  sessions: number;
  users: number;
  /** Segundos medios de interacción. Es lo que GSC no puede saber. */
  avgEngagement: number;
  /** Proporción de sesiones con interacción real, 0 a 1. */
  engagementRate: number;
  conversions: number;
}

/** Métricas por página de los últimos `days` días. */
export async function pageStats(days = 28): Promise<PageStats[]> {
  const res = await dataApi().properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "userEngagementDuration" },
        { name: "engagementRate" },
        { name: "conversions" },
      ],
      limit: "500",
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    },
  });

  const num = (v?: string | null) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  return (res.data.rows ?? []).map((r) => {
    const sessions = num(r.metricValues?.[0]?.value);
    const engagementSeconds = num(r.metricValues?.[2]?.value);
    return {
      path: r.dimensionValues?.[0]?.value ?? "",
      sessions,
      users: num(r.metricValues?.[1]?.value),
      // La API devuelve duración TOTAL, no media. Dividir por sesiones es lo
      // que la vuelve comparable entre una página con 5 visitas y otra con 500.
      avgEngagement: sessions ? Math.round(engagementSeconds / sessions) : 0,
      engagementRate: num(r.metricValues?.[3]?.value),
      conversions: num(r.metricValues?.[4]?.value),
    };
  });
}

export interface Joined {
  path: string;
  clicks: number;
  impressions: number;
  position: number;
  sessions: number;
  avgEngagement: number;
  engagementRate: number;
  conversions: number;
  verdict: string;
  action: string;
}

/** Normaliza a ruta: GSC da URL completa y GA4 da path. */
const toPath = (u: string) => {
  try {
    return new URL(u).pathname.replace(/\/$/, "") || "/";
  } catch {
    return u.replace(/\/$/, "") || "/";
  }
};

/**
 * Cruza GSC con GA4 y saca un veredicto por página.
 *
 * El orden de las preguntas importa, y por eso son excluyentes en este orden:
 * primero si la gente llega, luego si se queda, luego si convierte. Una página
 * que nadie ve no tiene un problema de conversión aunque convierta cero.
 */
export function joinWithSearch(
  gsc: { page?: string; clicks: number; impressions: number; position: number }[],
  ga: PageStats[],
): Joined[] {
  const byPath = new Map(ga.map((g) => [toPath(g.path), g]));

  return gsc
    .filter((g) => g.page)
    .map((g) => {
      const p = toPath(g.page!);
      const a = byPath.get(p);

      let verdict: string;
      let action: string;

      if (!a || a.sessions === 0) {
        verdict = "sin datos en GA4";
        action =
          "GSC la ve y GA4 no. Suele ser medición: comprueba en Medición que la etiqueta cubre esta ruta.";
      } else if (g.impressions < 100) {
        verdict = "casi nadie la ve";
        action = "No es problema de contenido: es de alcance. Necesita enlaces internos o más cobertura del tema.";
      } else if (g.clicks / Math.max(g.impressions, 1) < 0.02 && g.position <= 20) {
        verdict = "sale y no la clican";
        action = "Google ya la muestra. Es título y meta, no el artículo.";
      } else if (a.avgEngagement < 30) {
        verdict = "entran y se van";
        action =
          "El clic funciona y la página no cumple lo que promete el título. Revisa que la primera pantalla responda la búsqueda.";
      } else if (a.conversions === 0 && a.sessions >= 50) {
        verdict = "leen y no convierten";
        action = "Se lee de verdad. Falta el paso siguiente: una llamada a la acción que encaje con el tema.";
      } else {
        verdict = "funcionando";
        action = "Déjala. Si acaso, mira qué hace bien para repetirlo.";
      }

      return {
        path: p,
        clicks: g.clicks,
        impressions: g.impressions,
        position: Math.round(g.position * 10) / 10,
        sessions: a?.sessions ?? 0,
        avgEngagement: a?.avgEngagement ?? 0,
        engagementRate: a?.engagementRate ?? 0,
        conversions: a?.conversions ?? 0,
        verdict,
        action,
      };
    })
    .sort((x, y) => y.clicks - x.clicks);
}
