import { runClaude } from "@/lib/claude";
import { pageStats, joinWithSearch, type Joined } from "@/lib/ga4";
import { queryAnalytics } from "@/lib/gsc";
import { getBlogPosts } from "@/lib/blog";

// El analista de GA4: convierte los números en qué escribir.
//
// No es un generador de ideas más. Ideas ya propone temas desde investigación
// web; esto propone desde el COMPORTAMIENTO MEDIDO del contenido que ya existe,
// que es una fuente distinta y normalmente mejor: una página con 94 impresiones
// y cero clics ya demostró que el tema interesa y que el titular no.
//
// Tres reglas de construcción, y las tres salen de errores reales de este
// sistema:
//
// 1. El agente NO ve la web ni inventa cifras: recibe los números ya calculados
//    y solo puede citar esos. Sin esto, un modelo rellena con estadísticas
//    plausibles que nadie puede comprobar.
//
// 2. Cada recomendación viaja con la página y el dato que la sostiene. Una
//    recomendación sin su número es una opinión, y no se puede priorizar.
//
// 3. Reescribir y escribir nuevo van separados. Reescribir un titular que ya
//    tiene impresiones es más barato y más rápido que un artículo nuevo, y
//    mezclarlos hace que lo caro se elija por costumbre.

export interface Recommendation {
  kind: "rewrite-title" | "improve-page" | "new-article" | "add-cta";
  target: string;
  reason: string;
  evidence: string;
  suggestion: string;
  priority: "alta" | "media" | "baja";
}

export interface AnalystResult {
  days: number;
  totals: { clicks: number; sessions: number; conversions: number };
  counts: Record<string, number>;
  recommendations: Recommendation[];
  /** Lo que el análisis NO pudo mirar, dicho en vez de omitido. */
  limits: string[];
}

const SYSTEM = `Eres analista de SEO y contenido para FastStrat, software de marketing con IA para PYMEs (foco LATAM y EE.UU.).

Recibes datos MEDIDOS de Search Console y GA4 sobre páginas que ya existen. Tu trabajo es decir qué escribir o reescribir, y por qué, apoyándote SOLO en esos números.

Reglas que no puedes romper:
- No inventes cifras. Solo puedes citar números que aparezcan en los datos que te doy. Si no tienes un dato, dilo.
- Cada recomendación lleva la página concreta y el número que la sostiene.
- No propongas temas que ya estén en la lista de artículos escritos que te paso.
- Prioriza por esfuerzo/retorno: reescribir un título de una página con impresiones es más barato que un artículo nuevo. Si una página ya sale en búsqueda y no la clican, eso va primero.
- Nada de relleno. Si solo hay tres cosas que valen la pena, devuelve tres.

Devuelve SOLO un JSON válido, sin texto alrededor, con esta forma:
{"recommendations":[{"kind":"rewrite-title|improve-page|new-article|add-cta","target":"/ruta o tema","reason":"por qué, en una frase","evidence":"el dato exacto que lo sostiene","suggestion":"qué hacer, concreto","priority":"alta|media|baja"}]}`;

/** Resume una página en una línea, para que quepan muchas en el prompt. */
const line = (p: Joined) =>
  `${p.path} | ${p.clicks} clics, ${p.impressions} impr, pos ${p.position}, ${p.sessions} ses, ${p.avgEngagement}s, ${p.conversions} conv | ${p.verdict}`;

export async function analyse(days = 28): Promise<AnalystResult> {
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

  const counts: Record<string, number> = {};
  for (const j of joined) counts[j.verdict] = (counts[j.verdict] || 0) + 1;

  const totals = {
    clicks: gsc.reduce((s, g) => s + g.clicks, 0),
    sessions: ga.reduce((s, g) => s + g.sessions, 0),
    conversions: ga.reduce((s, g) => s + g.conversions, 0),
  };

  const written = getBlogPosts().map((p) => p.title);

  // Se mandan los casos accionables, no las 500 filas: un prompt con todo
  // diluye la señal y cuesta más. Se ordena por impresiones dentro de cada
  // grupo porque la impresión es la demanda ya demostrada.
  const grupo = (v: string, n: number) =>
    joined
      .filter((p) => p.verdict === v)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, n);

  const muestra = [
    ...grupo("sale y no la clican", 15),
    ...grupo("entran y se van", 10),
    ...grupo("leen y no convierten", 10),
    ...grupo("casi nadie la ve", 10),
    ...grupo("funcionando", 5),
  ];

  const limits: string[] = [];
  if (!gsc.length) limits.push("Search Console no devolvió filas: el análisis va solo con GA4.");
  if (!ga.length) limits.push("GA4 no devolvió filas: el análisis va solo con Search Console.");
  if (totals.conversions === 0) {
    limits.push(
      "Cero conversiones registradas en el periodo. Sin conversiones no se puede decir qué contenido convierte, solo qué se lee.",
    );
  }

  const prompt = `Periodo: últimos ${days} días.
Totales del sitio: ${totals.clicks} clics desde búsqueda, ${totals.sessions} sesiones, ${totals.conversions} conversiones.
Reparto por diagnóstico: ${JSON.stringify(counts)}

PÁGINAS (ruta | clics, impresiones, posición, sesiones, segundos medios, conversiones | diagnóstico):
${muestra.map(line).join("\n")}

ARTÍCULOS YA ESCRITOS (no los propongas como nuevos):
${written.map((t) => "- " + t).join("\n")}

Da las recomendaciones en JSON.`;

  // El fallo del agente se nombra como lo que es. Sin esto, un token de
  // Claude revocado se reportaba como un problema de acceso a Google.
  let raw: string;
  try {
    raw = await runClaude({ system: SYSTEM, prompt, model: "sonnet" });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/revoked|401|unauthorized|authenticate/i.test(msg)) {
      throw new Error(
        "AGENT_AUTH: el token de Claude (CLAUDE_CODE_OAUTH_TOKEN) no es válido. " +
          "No tiene nada que ver con Google: los datos de GA4 y Search Console se leyeron bien. " +
          "Regenéralo con `claude setup-token` y actualízalo en .env.local y en Render.",
      );
    }
    throw e;
  }

  let recommendations: Recommendation[] = [];
  try {
    const clean = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    recommendations = JSON.parse(clean).recommendations ?? [];
  } catch {
    // Devolver el análisis sin recomendaciones y decirlo es mejor que fingir
    // que no hubo respuesta: los números de arriba siguen siendo válidos.
    limits.push("El agente no devolvió un JSON válido, así que no hay recomendaciones en esta corrida.");
  }

  return { days, totals, counts, recommendations, limits };
}
