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

/**
 * Normaliza a ruta. GSC da URL completa y GA4 da path, y las dos ramas tienen
 * que acabar en la MISMA forma.
 *
 * Antes no lo hacían: new URL() percent-codifica el pathname y quita la query,
 * y la rama del catch no hacía ninguna de las dos cosas. Un slug acentuado
 * daba "/blog/c%C3%B3mo-..." por un lado y "/blog/cómo-..." por el otro, así
 * que ningún artículo en español cruzaba y todos salían con "sin datos en
 * GA4": un diagnóstico de medición rota provocado por la normalización.
 */
const toPath = (u: string) => {
  let s = u.trim();
  s = s.replace(/^https?:\/\/[^/]+/i, ""); // fuera protocolo y dominio
  s = s.split(/[?#]/)[0]; // fuera query y ancla
  try {
    s = decodeURIComponent(s);
  } catch {
    // Una secuencia mal codificada se deja como está antes que perder la ruta.
  }
  s = s.toLowerCase().replace(/\/+$/, "");
  return s || "/";
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

  // Search Console puede devolver VARIAS filas que son la misma página: la
  // home salía partida en una de 339 impresiones y otra de 4, y cada una
  // recibía su propio diagnóstico. El de la fila pequeña ("casi nadie la ve")
  // acababa pisando al real ("entran y se van"), y las sesiones de GA4 se
  // pegaban a las dos, así que también se contaban dos veces.
  //
  // La posición se pondera por impresiones. Promediarla a secas dejaría que
  // una fila de 4 impresiones pesara lo mismo que una de 339.
  const agregado = new Map<string, { clicks: number; impressions: number; posSum: number }>();
  for (const g of gsc) {
    if (!g.page) continue;
    const p = toPath(g.page);
    const acc = agregado.get(p) ?? { clicks: 0, impressions: 0, posSum: 0 };
    acc.clicks += g.clicks;
    acc.impressions += g.impressions;
    acc.posSum += g.position * Math.max(g.impressions, 1);
    agregado.set(p, acc);
  }

  return [...agregado.entries()]
    .map(([p, sum]) => {
      const g = {
        clicks: sum.clicks,
        impressions: sum.impressions,
        position: sum.posSum / Math.max(sum.impressions, 1),
      };
      const a = byPath.get(p);

      let verdict: string;
      let action: string;

      // El orden importa y este es deliberado: primero si hubo clic, porque
      // sin clic no hay nada que GA4 pueda haber medido. Preguntar antes por
      // GA4 convertía "nadie la clica" en "la medición está rota".
      if (g.clicks === 0) {
        verdict =
          g.impressions >= 100 ? "sale y no la clican" : "casi nadie la ve";
        action =
          g.impressions >= 100
            ? "Google la muestra y nadie entra: es título y meta. GA4 no la ve porque no hay clic que ver, no porque falte medición."
            : "Ni la muestran ni la clican. Es alcance: enlaces internos y cobertura del tema.";
      } else if (!a || a.sessions === 0) {
        // AHORA sí es señal de medición: hubo clics y GA4 no registró sesiones.
        verdict = "sin datos en GA4";
        action =
          "Hubo clics desde búsqueda y GA4 no registró sesiones. Eso sí es medición: comprueba en Medición que la etiqueta cubre esta ruta.";
      } else if (g.impressions < 100) {
        verdict = "casi nadie la ve";
        action = "No es problema de contenido: es de alcance. Necesita enlaces internos o más cobertura del tema.";
      } else if (g.clicks / Math.max(g.impressions, 1) < 0.02 && g.position <= 20) {
        verdict = "sale y no la clican";
        action = "Google ya la muestra. Es título y meta, no el artículo.";
      } else if (a.avgEngagement < 30 && a.sessions >= 10) {
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

// ---------------------------------------------------------------------------
// De dónde llega la gente y qué hace: las dimensiones que faltaban.
//
// Hasta aquí GA4 solo se consultaba por página, así que el sistema sabía qué
// contenido atrae y no sabía nada de por dónde entra ni dónde se pierde. Con
// 1.784 sesiones y CERO conversiones, esa segunda mitad es la que importa: el
// contenido ya demostró que trae gente; lo que no está demostrado es qué pasa
// entre leer y convertir.

const num = (v?: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface Fuente {
  fuente: string;
  medio: string;
  sessions: number;
  users: number;
  engagementRate: number;
  conversions: number;
  /** Segundos medios. Un canal que trae gente que se va no es tráfico útil. */
  avgEngagement: number;
}

/**
 * Por dónde entra la gente.
 *
 * Search Console solo ve Google. Esto ve todo lo demás: directo, referral,
 * social y, lo que más interesa aquí, los asistentes de IA, que llegan como
 * referral de chatgpt.com, claude.ai o perplexity.ai. Es la única forma de
 * saber si ser citado por un LLM produce visitas de verdad, cosa que Search
 * Console no puede responder ni confirmando ni desmintiendo.
 */
export async function trafficSources(days = 28): Promise<Fuente[]> {
  const res = await dataApi().properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "engagementRate" },
        { name: "conversions" },
        { name: "userEngagementDuration" },
      ],
      limit: "100",
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    },
  });

  return (res.data.rows ?? []).map((r) => {
    const sessions = num(r.metricValues?.[0]?.value);
    return {
      fuente: r.dimensionValues?.[0]?.value ?? "(sin fuente)",
      medio: r.dimensionValues?.[1]?.value ?? "(sin medio)",
      sessions,
      users: num(r.metricValues?.[1]?.value),
      engagementRate: num(r.metricValues?.[2]?.value),
      conversions: num(r.metricValues?.[3]?.value),
      avgEngagement: sessions ? Math.round(num(r.metricValues?.[4]?.value) / sessions) : 0,
    };
  });
}

/** Referrals que son asistentes de IA. Es la respuesta a "¿me citan los LLMs?". */
export const ES_ASISTENTE_IA =
  /(chatgpt|openai|claude\.ai|anthropic|perplexity|copilot\.microsoft|gemini\.google|bard\.google|you\.com|phind)/i;

export interface Dispositivo {
  dispositivo: string;
  sessions: number;
  engagementRate: number;
  conversions: number;
  avgEngagement: number;
}

/**
 * Móvil contra escritorio.
 *
 * Importa porque el reparto suele estar desequilibrado en las dos direcciones:
 * el tráfico sintético de superficies de IA es casi todo de escritorio, así que
 * un CTR bajo en escritorio y alto en móvil es otra señal de que el volumen no
 * es humano. Y si el móvil convierte peor con tráfico real, es un problema de
 * la página, no del contenido.
 */
export async function deviceBreakdown(days = 28): Promise<Dispositivo[]> {
  const res = await dataApi().properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "conversions" },
        { name: "userEngagementDuration" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    },
  });

  return (res.data.rows ?? []).map((r) => {
    const sessions = num(r.metricValues?.[0]?.value);
    return {
      dispositivo: r.dimensionValues?.[0]?.value ?? "?",
      sessions,
      engagementRate: num(r.metricValues?.[1]?.value),
      conversions: num(r.metricValues?.[2]?.value),
      avgEngagement: sessions ? Math.round(num(r.metricValues?.[3]?.value) / sessions) : 0,
    };
  });
}

export interface Evento {
  evento: string;
  cuenta: number;
  usuarios: number;
}

/**
 * Qué eventos ocurren, para poder ver dónde se corta el embudo.
 *
 * Un cero en conversiones tiene dos lecturas opuestas: que nadie llega al final
 * o que el final no se está midiendo. Sin la lista de eventos no se pueden
 * distinguir, y son problemas distintos: uno se arregla con contenido y el otro
 * con Tag Manager. Si hay clics en el CTA y ninguna conversión, el problema
 * está después del clic; si no hay ni clics, está antes.
 */
export async function eventos(days = 28): Promise<Evento[]> {
  const res = await dataApi().properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
      limit: "50",
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    },
  });

  return (res.data.rows ?? []).map((r) => ({
    evento: r.dimensionValues?.[0]?.value ?? "?",
    cuenta: num(r.metricValues?.[0]?.value),
    usuarios: num(r.metricValues?.[1]?.value),
  }));
}

export interface PasoAlProducto {
  /** La página del blog desde la que se pulsó. */
  origen: string;
  vistas: number;
}

/**
 * Quién pasa del contenido al producto, y desde qué artículo.
 *
 * Es la única medida que responde "¿convierte el contenido?", y hasta ahora no
 * existía. El CTA se añadió a 109 artículos y no había forma de saber si se
 * pulsaba.
 *
 * No se puede medir como clic saliente: app.faststrat.ai está en la MISMA
 * propiedad de GA4 que el blog, así que ir de uno a otro es navegación interna
 * y el evento `click` no se dispara. Por eso se mira desde el otro lado: qué
 * referente traen las visitas que aterrizan en la app.
 *
 * El primer resultado, sobre 90 días: 121 vistas llegaron desde la HOME y
 * CERO desde un artículo. El dato es fiable justamente porque los referentes
 * del sitio sí se registran: si un artículo hubiera generado clics, aparecería
 * igual que aparece la home.
 */
export async function pasoAlProducto(days = 90, dominioApp = "app.faststrat.ai"): Promise<PasoAlProducto[]> {
  const res = await dataApi().properties.runReport({
    property: `properties/${PROPERTY_ID}`,
    requestBody: {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
      dimensions: [{ name: "pageReferrer" }],
      metrics: [{ name: "screenPageViews" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: "hostName", stringFilter: { value: dominioApp } } },
            // Solo los que vienen del sitio de contenido. El resto del ruido
            // (correos desechables, redes) no dice nada sobre si el contenido
            // convierte.
            { filter: { fieldName: "pageReferrer", stringFilter: { matchType: "CONTAINS", value: "//faststrat.ai" } } },
          ],
        },
      },
      limit: "50",
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    },
  });

  return (res.data.rows ?? []).map((r) => ({
    origen: r.dimensionValues?.[0]?.value ?? "",
    vistas: num(r.metricValues?.[0]?.value),
  }));
}
