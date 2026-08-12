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
// 1. El agente no inventa cifras NUESTRAS: los números de tráfico llegan ya
//    calculados y solo puede citar esos. Sí puede buscar en la web, porque los
//    números dicen QUÉ pasa y casi nunca POR QUÉ: que una página con 1.851
//    impresiones y posición 4,7 no reciba clics se explica mirando qué sale
//    alrededor en esa búsqueda, y eso no está en GA4. Lo que trae de fuera va
//    con su URL; sin enlace no entra.
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
  /** Por qué pasa. Los números dicen qué pasa; esto dice la causa. */
  cause?: string;
  /** La fuente de fuera que sostiene la causa. Sin enlace, no se muestra. */
  sourceUrl?: string;
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

Recibes datos MEDIDOS de Search Console y GA4 sobre páginas que ya existen. Tu trabajo NO es repetir lo que dicen los números: eso ya está en pantalla. Es explicar POR QUÉ pasa y decir QUÉ HACER.

Tienes búsqueda web. Úsala, porque los números dicen qué pasa y casi nunca por qué. Si una página está en posición 4 con muchas impresiones y nadie la clica, la causa está en lo que sale alrededor en esa búsqueda, no en GA4: busca la consulta, mira qué resultados la rodean, y di qué tienen ellos que nosotros no. Si algo no lo pudiste comprobar, dilo en vez de suponerlo.

Reglas que no puedes romper:
- Los números NUESTROS (clics, impresiones, posición, sesiones, conversiones) solo pueden salir de los datos que te doy. No los estimes ni los redondees a ojo.
- Lo que traigas de fuera va con su URL en "sourceUrl". Una afirmación sobre el mercado o sobre un competidor sin enlace no entra.
- "cause" explica el mecanismo, no repite el síntoma. Mal: "no la clican porque el CTR es bajo". Bien: "el título dice 'guía completa' y los tres resultados de arriba prometen un número concreto y el año".
- "suggestion" tiene que ser ejecutable hoy: el título nuevo escrito entero, la sección concreta que falta, el enlace interno concreto. Nada de "mejorar el contenido".
- No propongas temas que ya estén en la lista de artículos escritos que te paso.
- Prioriza por esfuerzo/retorno: reescribir un título de una página que ya tiene impresiones es más barato que un artículo nuevo, y va primero.
- Nada de relleno. Si solo hay tres cosas que valen la pena, devuelve tres.

Devuelve SOLO un JSON válido, sin texto alrededor, con esta forma:
{"recommendations":[{"kind":"rewrite-title|improve-page|new-article|add-cta","target":"/ruta o tema","reason":"qué pasa, en una frase","cause":"por qué pasa, el mecanismo","evidence":"el dato exacto de los nuestros que lo sostiene","sourceUrl":"URL de lo que consultaste fuera, o cadena vacía","suggestion":"qué hacer, escrito para poder copiarlo","priority":"alta|media|baja"}]}`;

/** Resume una página en una línea, para que quepan muchas en el prompt. */
const line = (p: Joined) =>
  `${p.path} | ${p.clicks} clics, ${p.impressions} impr, pos ${p.position}, ${p.sessions} ses, ${p.avgEngagement}s, ${p.conversions} conv | ${p.verdict}`;

export async function analyse(days = 28): Promise<AnalystResult> {
  // Si Search Console falla, esto TIENE que reventar. Antes se tragaba el
  // error y devolvía `rows: []`; como joinWithSearch recorre las filas de GSC,
  // el resultado era cero páginas y el agente analizaba la nada y aun así
  // devolvía recomendaciones. Un fallo de red se leía como "no hay tráfico",
  // que es la conclusión contraria y la que peor decisión provoca.
  const [ga, gscRes] = await Promise.all([pageStats(days), queryAnalytics("page", days)]);

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
    // Búsqueda web, y solo búsqueda: son herramientas de lectura, así que el
    // agente no recibe permiso de escritura por pedirlas.
    raw = await runClaude({
      system: SYSTEM,
      prompt,
      model: "sonnet",
      allowedTools: ["WebSearch", "WebFetch"],
    });
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

  // "No inventes cifras" era solo una instrucción en el prompt, y una
  // instrucción no es una garantía. Aquí se comprueba: si una recomendación
  // apunta a una ruta concreta, esa ruta tiene que estar en los datos que se
  // le pasaron. Una recomendación sobre una página que no existe se lee como
  // un hallazgo y no lo es, así que se cae y se dice cuántas cayeron.
  const rutas = new Set(joined.map((p) => p.path));
  const apuntaARuta = (r: Recommendation) => r.target?.startsWith("/");
  const descartadas = recommendations.filter((r) => apuntaARuta(r) && !rutas.has(r.target.replace(/\/+$/, "") || "/"));
  if (descartadas.length) {
    recommendations = recommendations.filter((r) => !descartadas.includes(r));
    limits.push(
      `${descartadas.length} recomendación(es) descartada(s) por apuntar a rutas que no están en los datos: ` +
        descartadas.map((r) => r.target).join(", "),
    );
  }

  return { days, totals, counts, recommendations, limits };
}
