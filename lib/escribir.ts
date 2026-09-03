// Escribir un artículo, fuera de la petición web.
//
// POR QUÉ VIVE AQUÍ Y NO DENTRO DE LA RUTA. Escribir tarda unos 24 minutos y el
// plan gratuito de Render no lo aguanta: el agente se come la CPU, el health
// check de Render deja de responder en 5 segundos, Render da la instancia por
// caída y la reinicia. El artículo muere con el reinicio. Medido: 502 a los 3,2
// minutos, y la alerta de Render diciendo "health check timed out after 5s".
//
// Así que el trabajo pesado corre en GitHub Actions, que tiene CPU de verdad y
// seis horas de margen. Para que la ruta y el trabajo de Actions hagan
// EXACTAMENTE lo mismo, la lógica vive aquí y los dos la llaman. Duplicarla
// habría garantizado que se separaran a la primera corrección.

import path from "path";
import { createBlogPost, slugify, renderHtml } from "@/lib/blog";
import { publishPost } from "@/lib/wordpress";
import { runClaude } from "@/lib/claude";
import { REGLAS_DE_CASA, LIMITE_TITULO_UTIL } from "@/lib/house-rules";
import { revisarTitulo, explicar } from "@/lib/catalogo";
import { INSTRUCCION_DIFERENCIAL, INSTRUCCION_KEYWORD, partir } from "@/lib/diferencial";
import { tendenciaEnVarios, describir } from "@/lib/trends";
import { INSTRUCCION_LEGIBILIDAD } from "@/lib/legibilidad";
import { dejarPublicable } from "@/lib/publicable";
import { persistChanges } from "@/lib/persist";
import { CONTEXTO_CLIENTE, conCta, geosDe } from "@/lib/cliente";
import { apuntar } from "@/lib/duraciones";

export interface PeticionEscribir {
  keyword?: string;
  topic?: string;
  title?: string;
  lang?: string;
  category?: string;
  /** Escribir aunque el título se pise con algo que ya existe. */
  force?: boolean;
  /** ISO. Cuándo debe salir publicado. */
  publishAt?: string;
  /**
   * Publicar en WordPress al terminar.
   *
   * Va aquí y no en el trabajo de Actions para que la ruta web y Actions
   * publiquen EXACTAMENTE igual. Si el artículo quedó con bloqueos sin
   * resolver, no se publica: se guarda como borrador y se dice por qué.
   */
  publicar?: boolean;
  /** Con `publicar`, si sale en vivo o queda de borrador en WordPress. */
  enVivo?: boolean;
}

/** O el artículo, o el motivo por el que no. `estado` es el código HTTP a devolver. */
export type ResultadoEscribir =
  | {
      ok: true;
      slug: string;
      title: string;
      excerpt: string;
      preview: string;
      wordCount: number;
      author: string;
      publishAt?: string;
      diferencial?: string;
      keywordRationale?: string;
      keywordTrend?: NonNullable<Awaited<ReturnType<typeof tendenciaEnVarios>>>;
      pendientes?: string[];
      /** Cifras que hubo que quitar por no encontrarles fuente. Se dice. */
      quitadas?: string[];
      /** Qué pasó al publicar, si se pidió. */
      publicacion?: { intentado: boolean; ok: boolean; estado?: string; link?: string; motivo?: string };
    }
  | {
      ok: false;
      estado: number;
      error: string;
      explicacion?: string;
      choques?: unknown[];
      comoSeguir?: string;
      titulo?: string;
      markdown?: string;
    };

const WRITER_SYSTEM = `${CONTEXTO_CLIENTE} Eres redactor SEO senior y estratega de contenido. Escribes artículos de blog de calidad publicable, del nivel de un especialista humano experimentado, no de IA genérica.

OBJETIVO: que el artículo (a) rankee en Google, (b) sea genuinamente útil para un dueño de PYME o marketer, y (c) sea lo suficientemente claro y citable como para que ChatGPT/Perplexity lo referencien (GEO).

ANTES DE ESCRIBIR NADA: INVESTIGA.

Este es el paso que decide si el artículo sale publicable a la primera o hay que corregirlo después. Tienes WebSearch y WebFetch: úsalos AHORA, no cuando ya hayas escrito.

1. Busca las cifras que vas a necesitar para este tema y ABRE las páginas. Precios reales, benchmarks, estudios.
2. Apunta la URL exacta de cada una. Si no abriste la página, la cifra no existe para ti.
3. Escribe DESDE lo que encontraste. No escribas primero y busques fuentes después para tapar huecos: así es como salen cifras plausibles que ninguna página respalda, y es lo que bloquea la publicación.

Si un dato que querías no tiene fuente pública, no lo escribas: di el mecanismo en su lugar. Un artículo sin ese número se publica; con él inventado, no.

4. Para precios, límites y especificaciones de una plataforma, cita a QUIEN LOS PUBLICA. La tarifa de WhatsApp la publica Meta; los límites de la API de Google los publica Google. Un blog de un proveedor que revende esa plataforma no es la fuente: es alguien con interés en el número.
   Si solo encuentras el dato en un proveedor, escríbelo diciéndolo: "según datos de plataforma de X, no auditados por terceros". Exigir fuente primaria a los demás y construir sobre blogs de vendors es la contradicción que un lector técnico detecta primero.

5. Lo que hace distinto a este artículo va en los DOS PRIMEROS PÁRRAFOS, no en la mitad. Si tu tesis es que dos cosas parecen iguales pero se separan en un caso concreto, eso se dice arriba: el lector que llega a la primera tabla y saca la conclusión contraria ya no sigue leyendo.

6. Cuando enlaces a una página propia, describe lo que de verdad hace. No inventes una categoría: el texto del enlace es la etiqueta con la que Google y los modelos aprenden qué es esta marca.

7. Si el artículo depende de algo que cambia en una fecha CONOCIDA —una tarifa que sube, un plan que se retira, una API que se apaga— dilo al final, en su propia línea y exactamente así:
CADUCA: AAAA-MM-DD — qué cambia ese día
   Esa línea no forma parte del artículo, se quita antes de publicar. Sirve para que el sistema avise de revisarlo antes de que empiece a decir cifras falsas. Si nada del artículo tiene fecha de caducidad conocida, no pongas la línea.

ESTÁNDARES DE CALIDAD (obligatorios):
- Extensión: MÍNIMO 1.000 palabras, y a partir de ahí la que exija el tema. El mínimo no es una cuota que rellenar: si llegas a 1.000 con relleno, el artículo se bloquea igual por las reglas de lenguaje. Un tema que no da para 1.000 palabras con sustancia está mal acotado, y lo que hay que cambiar es el tema, no estirar el texto.
- El primer párrafo RESPONDE la pregunta del título, entera, en 40 palabras o menos, antes de cualquier contexto. Nada de plantear el problema primero: quien llega desde el resultado número diez ya leyó a dos competidores y viene a comprobar si aquí está la respuesta. Si tiene que bajar para averiguarlo, no baja.
- Estructura escaneable: como mucho 8 secciones H2, con H3 cuando ayude. Párrafos de 2-4 frases. Usa **negritas** para los puntos clave.
- Especificidad: ejemplos concretos, precios reales de herramientas reales con enlace a su página de precios, escenarios reales de PYMEs. Nada vago.
- Al menos una tabla comparativa o lista estructurada cuando el tema lo permita (las tablas se citan y rankean bien).
- Una respuesta directa y extractable cerca del inicio (un párrafo que responda la pregunta principal en 2-3 frases — esto es lo que las IA citan).
- Sección de FAQ al final (3-4 preguntas reales que la gente busca, con respuestas de 2-3 frases).
- Cierre: qué hace el lector el lunes, no un resumen de lo que acaba de leer. El enlace a una página nuestra es OBLIGATORIO y va a la página más útil para lo que acaba de leer, no a la home; la mención comercial de la marca es opcional y solo si encaja.
- Honestidad: toda cifra sale de una página que ABRISTE en esta sesión y cuya URL puedes pegar. Un "rango razonable" inventado es una estadística inventada con otro nombre. Si no encontraste el dato, escribe el mecanismo en vez del número ("el costo lo dominan las horas de setup, no la licencia"). Sustituir una cifra por una vaguedad tipo "la mayoría de las PYMEs" no cumple la regla: la incumple en silencio y deja la página sin nada que citar.
- Voz: experta, directa, útil, con personalidad. Le hablas al lector de "tú". Sin clichés de marketing, sin jerga vacía, sin promesas exageradas.
- SEO: usa la keyword principal de forma natural en intro, en al menos un H2 y en la conclusión — sin saturar. Incluye variantes y términos relacionados (semántica).

${REGLAS_DE_CASA}

${INSTRUCCION_LEGIBILIDAD}

${INSTRUCCION_DIFERENCIAL}

${INSTRUCCION_KEYWORD}

FORMATO DE SALIDA: devuelve ÚNICAMENTE el cuerpo del artículo en Markdown. Sin frontmatter, sin título H1 (el H1 es el título del post), sin envolverlo en bloques de código. Empieza directo con el párrafo de intro.`;

// POST /api/blog/generate { keyword, title?, lang?, category? }


/**
 * Un título que compita en la SERP, no uno que rellene el hueco.
 *
 * El valor por defecto era `Guía 2026: <keyword>`. En una pantalla con otros
 * nueve resultados, "guía" y "2026" es lo que promete todo el mundo: el
 * resultado se ve igual que los demás y se clica el que dice algo concreto.
 * Con posición media 10,5 y CTR de 0,33%, el título es de lo poco que se puede
 * cambiar sin escribir nada nuevo.
 *
 * Si la llamada falla, se cae al patrón viejo antes que perder el artículo.
 */
async function tituloPara(keyword: string, lang: string): Promise<string> {
  // El límite sale de una cuenta, no de un número copiado. Estaba escrito a
  // mano como 45, que era correcto solo mientras el sufijo del sitio midiera
  // exactamente 15 caracteres: con otro cliente, el escritor apuntaba a un
  // largo y la compuerta medía otro, y los títulos salían bloqueados sin que
  // el prompt supiera por qué.
  const LIMITE = LIMITE_TITULO_UTIL;
  try {
    const raw = await runClaude({
      model: "sonnet",
      system: `Escribes titulares para resultados de búsqueda. Devuelves SOLO el titular, sin comillas y sin explicación.

Reglas:
- Máximo ${LIMITE} caracteres. Cuéntalos.
- Contiene la consulta objetivo, lo más a la izquierda que la frase permita: Google resalta en negrita los términos de la consulta, y eso es lo que hace que un resultado se vea relevante entre nueve.
- Contiene algo concreto que los demás no prometen: un número, un plazo, una cantidad, un nombre de herramienta o el resultado exacto.
- PROHIBIDO: "guía completa", "guía definitiva", "todo lo que necesitas saber", "la guía", y el año suelto sin nada más.
- No prometas nada que el artículo no entregue en los dos primeros párrafos.`,
      prompt: `Consulta objetivo: "${keyword}"
Idioma: ${lang === "es" ? "español" : "inglés"}.
Devuelve el titular.`,
    });
    const t = raw.trim().split(/\r?\n/)[0].replace(/^["']|["']$/g, "").trim();
    if (t && t.length <= LIMITE + 15) return t;
  } catch {
    // Cae al patrón de siempre: un título flojo es mejor que ningún artículo.
  }
  return lang === "es" ? `${keyword}: qué elegir en 2026` : `${keyword}: what to pick in 2026`;
}

export async function escribirArticulo(peticion: PeticionEscribir): Promise<ResultadoEscribir> {
  // Se cronometra la corrida entera para que la barra de progreso diga un
  // tiempo medido y no uno supuesto. Solo se apunta si TERMINA.
  const arranque = Date.now();
  // Un campo vacío es un campo que NO se llenó.
  //
  // `title = body.title ?? tituloPara(...)` parecía correcto, y por la web lo
  // era: allí el campo no enviado llega `undefined` y el ?? hace su trabajo.
  // Pero un workflow_dispatch de Actions manda las entradas no rellenadas como
  // cadena vacía, y "" no es null: pasaba de largo. La corrida escribió 1986
  // palabras y las guardó en `content/blog/.md`, sin título y sin slug.
  //
  // Se normaliza aquí, en la librería, y no en cada script: el fallo no fue del
  // que llamaba, fue de suponer que solo hay una forma de decir "vacío".
  const body: PeticionEscribir = { ...peticion };
  for (const campo of ["title", "keyword", "topic", "category", "publishAt"] as const) {
    if (typeof body[campo] === "string" && body[campo]!.trim() === "") delete body[campo];
  }
  // Modo A: keyword (+ title opcional). Modo B: topic libre (el agente elige título).
  const keyword: string | undefined = body.keyword;
  const topic: string | undefined = body.topic;
  if (!keyword && !topic) {
    return { ok: false, estado: 400, error: "Falta 'keyword' o 'topic'" };
  }
  const lang: string = body.lang ?? "en";
  const category: string = body.category ?? "SEO";
  // `force` lo pone una persona que ya vio el choque y decidió seguir.
  const force: boolean = body.force === true;
  // ISO. Si es futura, WordPress lo dejará programado en vez de publicarlo ya.
  const publishAt: string | undefined = body.publishAt;

  try {
    let title: string;
    let markdown: string;
    let diferencial: string | undefined;
    let porqueKeyword: string | undefined;

    // La dirección de la demanda: dato, no criterio, así que se consulta aquí
    // en vez de pedírsela al agente. Google Trends no tiene API oficial y puede
    // fallar; si falla, el artículo sale igual sin este campo.
    const trendKeyword = keyword ? await tendenciaEnVarios(keyword, geosDe(lang)) : null;

    // El escritor sabe hacia dónde va la demanda, y eso cambia el ángulo.
    //
    // No es decoración: un término en caída pide una pieza que resuelva el
    // problema de quien todavía lo busca, no un "las tendencias de 2026" sobre
    // algo que se está apagando. Y uno sin volumen medible pide profundidad
    // para quien ya sabe lo que busca, no una introducción para tráfico frío.
    const contextoDemanda = trendKeyword
      ? `

DEMANDA DE ESTA KEYWORD (Google Trends): ${describir(trendKeyword)}.
${
  trendKeyword.direccion === "baja"
    ? "La demanda cae. NO escribas una pieza de tendencias ni prometas que esto es el futuro: sería falso y se nota. Escribe para quien HOY tiene el problema y necesita resolverlo, con el paso concreto."
    : trendKeyword.direccion === "sube"
      ? "La demanda crece. Merece la pena cubrirlo a fondo y ser de los primeros con una respuesta completa."
      : trendKeyword.direccion === "sin-volumen"
        ? "Google Trends no ve volumen: es muy long-tail. Escribe para quien ya sabe exactamente qué busca, ve al detalle y sáltate la introducción de contexto general."
        : "La demanda se mantiene. Cubre el tema de forma perenne, sin anclarlo a un año concreto más de lo necesario."
}`
      : "";

    if (topic && !body.title) {
      // El agente elige un título SEO atractivo a partir del tema y escribe.
      const raw = await runClaude({
        model: "sonnet",
        system: WRITER_SYSTEM,
        // El escritor busca en la web. Sin esto se le exigía que toda cifra
        // llevara fuente enlazada y no se le daba con qué encontrarla, así que
        // sus dos únicas salidas eran inventar el dato u omitirlo. Inventaba, y
        // la compuerta lo bloqueaba después: 440 hallazgos en 17 artículos
        // salieron de esta contradicción, no de cómo estaban redactadas las
        // reglas. El corrector sí tenía búsqueda; el escritor no.
        allowedTools: ["WebSearch", "WebFetch"],
        prompt: `Tema/ángulo para el artículo (puede ser un insight de competidor o tendencia): "${topic}"
Idioma: ${lang === "es" ? "español (natural de LATAM)" : "inglés"}.
Audiencia: dueños de PYMEs y marketers.

Primero elige un TÍTULO SEO específico y atractivo para este tema (no genérico).
Tu respuesta debe empezar EXACTAMENTE con la línea:
TITLE: <el título>
Después, en una línea nueva, el bloque <<<DIFERENCIAL>>> y luego <<<ARTICULO>>> con el artículo completo en Markdown.`,
      });
      const m = raw.match(/^\s*TITLE:\s*(.+?)\s*\n/i);
      title = m ? m[1].trim().replace(/^["']|["']$/g, "") : topic.slice(0, 70);
      const partes = partir(raw);
      diferencial = partes.diferencial;
      porqueKeyword = partes.keyword;
      markdown = partes.markdown;

      // En este modo el título lo elige el agente, así que el choque solo se
      // puede comprobar AHORA. Es tarde para ahorrar la llamada, pero no para
      // evitar la canibalización: lo que no se puede es guardar un artículo que
      // compite con otro propio sin que nadie lo sepa.
      if (!force) {
        const v = await revisarTitulo(title);
        if (!v.ok) {
          return {
            ok: false,
            estado: 409,
            error: `El agente eligió "${title}", que se pisa con algo que ya existe`,
            explicacion: explicar(v),
            choques: v.choques,
            // El artículo va en el resultado para que no se pierda el trabajo
            // ya pagado: se puede reintentar con otro título y force: true.
            titulo: title,
            markdown,
            comoSeguir:
              "Reenvía con otro 'title' y force: true si el ángulo de verdad es distinto, o descarta.",
          };
        }
      }
    } else {
      // Sin título dado, lo elige el agente. El valor por defecto era
      // "Guía 2026: <keyword>", que es exactamente el título contra el que
      // compiten otros nueve iguales en la misma pantalla: promete "guía" y
      // "2026", que es lo que promete todo el mundo. Un título genérico en
      // posición 10 no se clica, y varios de los 17 artículos lo llevan.
      title = body.title ?? (await tituloPara(keyword ?? topic ?? "", lang));

      // El choque se comprueba con el TÍTULO, no con la keyword.
      //
      // Primero se sondeaba con la keyword, y salía mal: "best SEO tools for
      // small business 2026" chocaba al 75% con "SEO for Small Business: The
      // 2026 No-BS Guide", que es otra intención (una lista de herramientas
      // frente a una guía general). Una keyword tiene menos palabras que un
      // título, así que el parecido sale inflado y bloquea temas legítimos.
      //
      // Sigue yendo ANTES de escribir, que es donde está el ahorro: sacar el
      // título cuesta una llamada corta, redactar el artículo cuesta minutos.
      if (!force) {
        const v = await revisarTitulo(title);
        if (!v.ok) {
          return {
            ok: false,
            estado: 409,
            error: "Ya existe algo que cubre esto",
            titulo: title,
            explicacion: explicar(v),
            choques: v.choques,
            comoSeguir:
              "Manda un 'title' distinto con otro ángulo, o reenvía con force: true si de verdad son intenciones distintas.",
          };
        }
      }
      const crudo = await runClaude({
        model: "sonnet",
        system: WRITER_SYSTEM,
        // El escritor busca en la web. Sin esto se le exigía que toda cifra
        // llevara fuente enlazada y no se le daba con qué encontrarla, así que
        // sus dos únicas salidas eran inventar el dato u omitirlo. Inventaba, y
        // la compuerta lo bloqueaba después: 440 hallazgos en 17 artículos
        // salieron de esta contradicción, no de cómo estaban redactadas las
        // reglas. El corrector sí tenía búsqueda; el escritor no.
        allowedTools: ["WebSearch", "WebFetch"],
        prompt: `Escribe el artículo completo siguiendo TODOS los estándares de calidad.
Título del artículo (es el H1, no lo repitas): "${title}"
Keyword principal a posicionar: "${keyword ?? title}"
Idioma: ${lang === "es" ? "español (natural de LATAM, no traducido)" : "inglés"}.
Audiencia: dueños de PYMEs y marketers que buscan resultados prácticos.
La extensión la marca el tema, no una cuota. No hay mínimo de palabras.${contextoDemanda}`,
      });
      const partes = partir(crudo);
      diferencial = partes.diferencial;
      porqueKeyword = partes.keyword;
      markdown = partes.markdown;
    }

    // Sin el marcador del artículo no se guarda nada.
    //
    // No es celo: ya se publicaron tres posts con el plan del modelo pegado
    // dentro del cuerpo, uno de ellos con status publish, o sea a un clic de
    // salir así al sitio. Es preferible perder la corrida que guardar eso.
    if (!markdown.trim()) {
      return {
        ok: false,
        estado: 502,
        error:
          "El agente no devolvió el artículo con el marcador <<<ARTICULO>>>, así que no se puede " +
          "separar su razonamiento del texto. No se guardó nada.",
      };
    }

    // Comprobar antes de guardar, y corregir si hace falta.
    //
    // Las reglas ya van en el prompt, y eso reduce mucho los fallos pero no los
    // elimina: un modelo que sabe que no puede usar rayas largas todavía deja
    // alguna en un texto de dos mil palabras. Como el bloqueo se descubría al
    // intentar publicar, el artículo nacía roto y el problema aparecía días
    // después, cuando ya nadie recordaba de dónde salía.
    //
    // Una sola pasada correctiva, no un bucle: si tras corregir sigue
    // bloqueado, es que hay una cifra sin fuente pública, y eso necesita una
    // decisión que no le toca tomar a un agente.
    // El CTA va ANTES de la compuerta, para que la regla `no-cta` lo vea y para
    // que el corrector trabaje sobre el artículo completo. No dispara la regla
    // de autocita circular porque app.faststrat.ai está excluido de esa
    // comprobación: un "empieza gratis" no cita nada.
    markdown = conCta(markdown, lang);
    const revisado = await dejarPublicable(title, markdown, {
      differentiator: diferencial,
      exigirDiferencial: true,
    });
    markdown = revisado.markdown;

    // La meta description: la primera FRASE de verdad, no la primera línea.
    //
    // Antes cogía la primera línea no vacía, y eso publicó una descripción que
    // decía "Título: Customer Acquisition Cost: Formula, Examples" — la
    // etiqueta del prompt que el agente había repetido. Es el texto que Google
    // enseña debajo del resultado, así que un descuido ahí se ve en la SERP.
    //
    // Se descartan encabezados, citas, listas y líneas con pinta de etiqueta, y
    // se exige un mínimo de largo para no quedarse con un fragmento suelto.
    const esEtiqueta = (l: string) =>
      /^(?:t[íi]tulo|title|keyword|idioma|language|audiencia|audience|meta)\s*:/i.test(l);

    const primeraFrase = markdown
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length >= 40 &&
          !l.startsWith("#") &&
          !l.startsWith(">") &&
          !l.startsWith("|") &&
          !/^[-*+]\s/.test(l) &&
          !esEtiqueta(l.replace(/\*\*/g, "")),
      )[0];

    const excerpt = (primeraFrase ?? title).replace(/[#*`>_]/g, "").trim().slice(0, 155);

    // Sin slug no se guarda. Es la red debajo de la normalización de arriba.
    //
    // La corrida que descubrió esto llegó hasta aquí con el título vacío,
    // escribió el fichero como `.md` y solo se supo porque el push falló por
    // otro motivo. Un artículo de 24 minutos guardado sin nombre es un artículo
    // perdido que además ensucia el repositorio, así que se para antes.
    // La línea CADUCA sale del artículo y pasa a ser un campo.
    //
    // Va en el cuerpo porque es donde el agente puede escribirla sin inventarse
    // un formato, pero publicarla sería absurdo: al lector no le importa cuándo
    // tenemos que revisar el texto. Ver lib/caducidad.ts.
    let caduca: string | undefined;
    let motivoCaducidad: string | undefined;
    markdown = markdown.replace(
      /^[ \t]*(?:\\*\\*)?CADUCA(?:\\*\\*)?[ \t]*:[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*(?:[-–—][ \t]*(.*))?$/gim,
      (_todo, fecha: string, motivo?: string) => {
        caduca = new Date(`${fecha}T00:00:00Z`).toISOString();
        motivoCaducidad = motivo?.trim() || undefined;
        return "";
      },
    ).trim();

    const slug = slugify(title);
    if (!slug) {
      return {
        ok: false,
        estado: 500,
        error: `El artículo se escribió pero salió sin título, así que no se puede guardar (el nombre del fichero se saca del título). Keyword: "${keyword ?? topic ?? "?"}".`,
      };
    }

    const post = createBlogPost({
      title,
      slug,
      excerpt,
      keywords: [keyword ?? title],
      lang,
      category,
      status: "draft", // los generados desde reportes entran como borrador
      publishAt,
      differentiator: diferencial,
      keywordRationale: porqueKeyword,
      caduca,
      motivoCaducidad,
      keywordTrend: trendKeyword ?? undefined,
      markdown,
    });

    // Persiste al repo si está corriendo en producción (Render).
    await persistChanges(`new blog draft: ${post.slug}`, [
      path.join(process.cwd(), "content", "blog", `${post.slug}.md`),
    ]);

    // Preview: primeros ~500 caracteres del cuerpo para mostrar en el reporte.
    const preview = markdown.trim().slice(0, 500);

    apuntar("escribir", (Date.now() - arranque) / 1000);

    // Publicar, si se pidió.
    //
    // Nunca se publica un artículo que quedó con bloqueos: la compuerta existe
    // para eso, y saltársela porque "ya que estamos" la convierte en decorado.
    // En ese caso se guarda igual —el trabajo está pagado— y se dice el motivo.
    let publicacion: { intentado: boolean; ok: boolean; estado?: string; link?: string; motivo?: string } | undefined;
    if (peticion.publicar) {
      if (revisado.pendientes.length > 0) {
        publicacion = {
          intentado: true,
          ok: false,
          motivo: `Quedaron ${revisado.pendientes.length} bloqueo(s) sin resolver. El artículo está guardado como borrador.`,
        };
      } else {
        try {
          const r = await publishPost({
            title: post.title,
            slug: post.slug,
            contentHtml: renderHtml(post),
            excerpt: post.excerpt,
            category: post.category,
            status: peticion.enVivo === false ? "draft" : "publish",
            authorName: post.author,
            publishAt: post.publishAt,
          });
          publicacion = { intentado: true, ok: true, estado: r.status, link: r.link };
        } catch (e) {
          // Que no se pueda publicar no invalida el artículo: está escrito y
          // guardado, y publicarlo es un clic. Perderlo aquí sería el peor
          // intercambio posible.
          publicacion = { intentado: true, ok: false, motivo: (e as Error).message };
        }
      }
    }

    return {
      ok: true as const,
      publicacion,
      slug: post.slug,
      title: post.title,
      excerpt,
      preview,
      author: post.author,
      publishAt: post.publishAt,
      // Va en la respuesta para que se pueda leer y juzgar: la regla comprueba
      // que el trabajo se hizo, no que la respuesta sea buena. Eso lo decide
      // quien lo lee.
      diferencial,
      keywordRationale: porqueKeyword,
      keywordTrend: trendKeyword ?? undefined,
      pendientes: revisado.pendientes.length ? revisado.pendientes : undefined,
      quitadas: revisado.quitadas.length ? revisado.quitadas : undefined,
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
    };
  } catch (err: unknown) {
    return { ok: false, estado: 500, error: err instanceof Error ? err.message : String(err) };
  }
}
