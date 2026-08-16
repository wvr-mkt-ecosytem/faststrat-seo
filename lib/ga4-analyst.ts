import { runClaude } from "@/lib/claude";
import { pageStats, joinWithSearch, type Joined } from "@/lib/ga4";
import { queryAnalytics } from "@/lib/gsc";
import { getBlogPosts } from "@/lib/blog";
import { diagnosticar } from "@/lib/seo-diagnostics";

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
  /**
   * Qué clase de acción es. `consolidate` y `technical-fix` se añadieron
   * porque el análisis manual encontró que lo más rentable no era escribir
   * nada: era fusionar URLs que competían entre sí y sacar de Google el
   * entorno de desarrollo. Sin estos tipos, el agente empujaba todo hacia
   * "escribe otro artículo", que es la acción más cara de la lista.
   */
  kind: "rewrite-title" | "improve-page" | "new-article" | "add-cta" | "consolidate" | "technical-fix";
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
  /**
   * El análisis escrito, en prosa.
   *
   * Las recomendaciones sueltas no son un análisis: son una lista. Falta lo
   * que las une, que es qué está pasando en el sitio, por qué, y en qué orden
   * conviene atacarlo. Eso no cabe en un campo de una tabla y es justo lo que
   * hace que un informe se pueda leer y decidir sobre él.
   */
  report: string;
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
CÓMO ANALIZAR (el método, no una conclusión: los datos cambian cada corrida y el análisis tiene que cambiar con ellos)

Antes de recomendar nada, haz este trabajo sobre los datos que te llegan HOY. Puede que esta semana la respuesta sea la contraria a la de la semana pasada; eso es lo esperable, no un error.

1. Comprueba si las impresiones son demanda real. Mira el reparto humano/prompt que te doy. Si el grueso viene de consultas con forma de instrucción, el CTR medio del sitio no mide nada: en esas superficies la respuesta se sintetiza y nadie hace clic, así que rankear primero ahí no trae a nadie. Cuando sea el caso, dilo antes que cualquier recomendación de título y recalcula tu lectura sobre el volumen humano.

2. Separa "no la ven" de "la ven y no la clican" de "entran y se van". Cada una es un arreglo distinto y confundirlas hace perder semanas. La posición y las impresiones dicen cuál es.

3. Con los HALLAZGOS YA CALCULADOS que te paso: no los recalcules ni los presentes como tuyos, pero pronúnciate sobre CADA uno con su causa y su acción. Si uno no merece acción esta vez, dilo y explica por qué. Si la lista viene vacía, no te la inventes.

4. Busca en la web lo que los números no pueden decir: qué resultados rodean a nuestra página en esa consulta y qué prometen ellos que nosotros no.

5. Ordena por lo que más tráfico mueve con menos trabajo. Un título reescrito sobre una página que ya tiene impresiones rinde antes que un artículo nuevo.

Reglas de forma para las acciones:
- Para canibalización: di cuál URL sobrevive y cuáles se redirigen a ella, con las rutas escritas. Nunca "consolidar el contenido".
- Para un arreglo técnico: di el cambio exacto (qué URL, qué directiva, dónde), no "revisar la indexación".
- Para un título: escríbelo entero, contando los caracteres.

QUÉ DEVOLVER

Dos cosas: un informe escrito y la lista de acciones. El informe es lo que se lee; las acciones son lo que se ejecuta.

El informe va en "report", en Markdown, en español, y tiene esta forma:

## El panorama
Los totales del periodo y qué significan. Si el volumen no es demanda real, se dice AQUÍ y no más abajo, porque cambia la lectura de todo lo demás.

## Qué está funcionando y por qué
Las páginas y consultas que rinden, con su número, y el mecanismo por el que funcionan. No basta con listarlas: di qué tienen en común, porque eso es lo que se puede repetir.

## Qué no está funcionando y por qué
Lo mismo al revés. Aquí van los hallazgos calculados que te paso, explicados, no repetidos. Si algo rankea alto y no recibe clics, la explicación no es "el CTR es bajo": eso es el síntoma con otras palabras.

## Lo que yo haría, por orden de impacto
Una lista corta y ordenada. Cada punto dice qué hacer y por qué va en ese lugar del orden. Lo barato con retorno alto va primero.

Reglas del informe:
- Escribe como un analista que le explica a un dueño de negocio, no como un panel de métricas. Frases completas.
- Cada afirmación lleva su cifra al lado, y las cifras solo salen de los datos que te di.
- Si algo no lo pudiste comprobar, dilo en esa misma frase.
- Nada de recomendaciones genéricas de SEO. Si el consejo vale para cualquier sitio, sobra.
- Extensión: la que pida el hallazgo. Un mes sin nada relevante son cinco líneas honestas, no dos páginas de relleno.

Devuelve SOLO un JSON válido, sin texto alrededor, con esta forma:
{"report":"## El panorama ... (el informe entero en Markdown, con saltos de línea escapados)",
 "recommendations":[{"kind":"rewrite-title|improve-page|new-article|add-cta|consolidate|technical-fix","target":"/ruta o tema","reason":"qué pasa, en una frase","cause":"por qué pasa, el mecanismo","evidence":"el dato exacto de los nuestros que lo sostiene","sourceUrl":"URL de lo que consultaste fuera, o cadena vacía","suggestion":"qué hacer, escrito para poder copiarlo","priority":"alta|media|baja"}]}`;

/** Resume una página en una línea, para que quepan muchas en el prompt. */
const line = (p: Joined) =>
  `${p.path} | ${p.clicks} clics, ${p.impressions} impr, pos ${p.position}, ${p.sessions} ses, ${p.avgEngagement}s, ${p.conversions} conv | ${p.verdict}`;

export async function analyse(days = 28): Promise<AnalystResult> {
  // Si Search Console falla, esto TIENE que reventar. Antes se tragaba el
  // error y devolvía `rows: []`; como joinWithSearch recorre las filas de GSC,
  // el resultado era cero páginas y el agente analizaba la nada y aun así
  // devolvía recomendaciones. Un fallo de red se leía como "no hay tráfico",
  // que es la conclusión contraria y la que peor decisión provoca.
  const [ga, gscRes, queryRes] = await Promise.all([
    pageStats(days),
    queryAnalytics("page", days),
    // Las consultas, además de las páginas. Sin ellas no se puede separar el
    // volumen humano del que llega de superficies de IA, y ese reparto cambia
    // la lectura de todo lo demás: con la mayoría de las impresiones viniendo
    // de prompts, el CTR medio del sitio no significa nada.
    queryAnalytics("query", days, 1000).catch(() => ({ rows: [] })),
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

  // Lo que se calcula, calculado antes de llamar al agente: canibalización,
  // slugs truncados, entornos indexados, páginas que rankean sin clics y el
  // reparto humano/prompt. Todo eso es determinista y estaba invisible; darle
  // al agente los hallazgos ya hechos deja su criterio para el porqué.
  const diag = diagnosticar(
    gsc.map((g) => ({ page: g.page ?? "", clicks: g.clicks, impressions: g.impressions, position: g.position })),
    (queryRes.rows ?? []).map((r) => ({
      query: r.query ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    })),
  );

  // El texto de los hallazgos se arma aquí y no dentro de la plantilla: meter
  // saltos de línea dentro de un template anidado es una fuente de errores de
  // sintaxis sin ninguna ventaja.
  const SALTO = "\n";
  const hallazgosTexto = diag.hallazgos.length
    ? diag.hallazgos
        .map((h) => `- [${h.tipo}] ${h.detalle}` + SALTO + "  " + h.ejemplos.slice(0, 4).join(SALTO + "  "))
        .join(SALTO)
    : "- (ninguno esta vez)";

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

DE DÓNDE VIENE EL VOLUMEN (esto cambia cómo se leen los demás números):
- Consultas humanas: ${diag.volumen.humano.consultas}, con ${diag.volumen.humano.impresiones} impresiones y ${diag.volumen.humano.clics} clics. CTR real ${diag.volumen.ctrHumano}%.
- Consultas con forma de prompt (superficies de IA, no personas buscando): ${diag.volumen.prompts.consultas}, con ${diag.volumen.prompts.impresiones} impresiones y ${diag.volumen.prompts.clics} clics.
${diag.volumen.peores.map((x) => "  - " + x).join("\n")}

HALLAZGOS YA CALCULADOS (no los recalcules, explícalos y di qué hacer):
${hallazgosTexto}

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
  let report = "";
  try {
    const clean = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(clean);
    recommendations = parsed.recommendations ?? [];
    report = typeof parsed.report === "string" ? parsed.report.trim() : "";
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

  if (!report) {
    limits.push("El agente no devolvió el informe escrito, solo la lista de acciones.");
  }

  return { days, totals, counts, recommendations, limits, report };
}
