import path from "path";
import { apiRoute } from "@/lib/google-auth-state";
import { NextRequest, NextResponse } from "next/server";
import { createBlogPost, slugify } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { REGLAS_DE_CASA } from "@/lib/house-rules";
import { dejarPublicable } from "@/lib/publicable";
import { persistChanges } from "@/lib/persist";

// Cuánto puede tardar. Sin esto, la plataforma corta la petición a mitad de la
// llamada al agente y no devuelve nada: el navegador se queda esperando una
// respuesta que ya no va a llegar y el botón gira para siempre. Ninguna de las
// rutas que llaman al agente lo declaraba, y por eso los cuatro botones
// (escribir, investigar, generar, escribir todos) fallaban a la vez.
export const maxDuration = 800;
export const dynamic = "force-dynamic";


const WRITER_SYSTEM = `Eres redactor SEO senior y estratega de contenido para FastStrat, una plataforma de agentes de IA de marketing para PYMEs (mercados LATAM y EEUU). Escribes artículos de blog de calidad publicable, del nivel de un especialista humano experimentado, no de IA genérica.

OBJETIVO: que el artículo (a) rankee en Google, (b) sea genuinamente útil para un dueño de PYME o marketer, y (c) sea lo suficientemente claro y citable como para que ChatGPT/Perplexity lo referencien (GEO).

ANTES DE ESCRIBIR NADA: INVESTIGA.

Este es el paso que decide si el artículo sale publicable a la primera o hay que corregirlo después. Tienes WebSearch y WebFetch: úsalos AHORA, no cuando ya hayas escrito.

1. Busca las cifras que vas a necesitar para este tema y ABRE las páginas. Precios reales, benchmarks, estudios.
2. Apunta la URL exacta de cada una. Si no abriste la página, la cifra no existe para ti.
3. Escribe DESDE lo que encontraste. No escribas primero y busques fuentes después para tapar huecos: así es como salen cifras plausibles que ninguna página respalda, y es lo que bloquea la publicación.

Si un dato que querías no tiene fuente pública, no lo escribas: di el mecanismo en su lugar. Un artículo sin ese número se publica; con él inventado, no.

ESTÁNDARES DE CALIDAD (obligatorios):
- Extensión: MÍNIMO 1.000 palabras, y a partir de ahí la que exija el tema. El mínimo no es una cuota que rellenar: si llegas a 1.000 con relleno, el artículo se bloquea igual por las reglas de lenguaje. Un tema que no da para 1.000 palabras con sustancia está mal acotado, y lo que hay que cambiar es el tema, no estirar el texto.
- El primer párrafo RESPONDE la pregunta del título, entera, en 40 palabras o menos, antes de cualquier contexto. Nada de plantear el problema primero: quien llega desde el resultado número diez ya leyó a dos competidores y viene a comprobar si aquí está la respuesta. Si tiene que bajar para averiguarlo, no baja.
- Estructura escaneable: como mucho 8 secciones H2, con H3 cuando ayude. Párrafos de 2-4 frases. Usa **negritas** para los puntos clave.
- Especificidad: ejemplos concretos, precios reales de herramientas reales con enlace a su página de precios, escenarios reales de PYMEs. Nada vago.
- Al menos una tabla comparativa o lista estructurada cuando el tema lo permita (las tablas se citan y rankean bien).
- Una respuesta directa y extractable cerca del inicio (un párrafo que responda la pregunta principal en 2-3 frases — esto es lo que las IA citan).
- Sección de FAQ al final (3-4 preguntas reales que la gente busca, con respuestas de 2-3 frases).
- Cierre: qué hace el lector el lunes, no un resumen de lo que acaba de leer. El enlace a una página nuestra es OBLIGATORIO y va a la página más útil para lo que acaba de leer, no a la home; la mención comercial de FastStrat es opcional y solo si encaja.
- Honestidad: toda cifra sale de una página que ABRISTE en esta sesión y cuya URL puedes pegar. Un "rango razonable" inventado es una estadística inventada con otro nombre. Si no encontraste el dato, escribe el mecanismo en vez del número ("el costo lo dominan las horas de setup, no la licencia"). Sustituir una cifra por una vaguedad tipo "la mayoría de las PYMEs" no cumple la regla: la incumple en silencio y deja la página sin nada que citar.
- Voz: experta, directa, útil, con personalidad. Le hablas al lector de "tú". Sin clichés de marketing, sin jerga vacía, sin promesas exageradas.
- SEO: usa la keyword principal de forma natural en intro, en al menos un H2 y en la conclusión — sin saturar. Incluye variantes y términos relacionados (semántica).

${REGLAS_DE_CASA}

FORMATO DE SALIDA: devuelve ÚNICAMENTE el cuerpo del artículo en Markdown. Sin frontmatter, sin título H1 (el H1 es el título del post), sin envolverlo en bloques de código. Empieza directo con el párrafo de intro.`;

// POST /api/blog/generate { keyword, title?, lang?, category? }

/**
 * El cierre que lleva al producto.
 *
 * Los 109 posts vivos lo tienen porque se les añadió con un script, pero el
 * escritor no lo ponía: cada artículo nuevo nacía sin ninguna ruta a
 * app.faststrat.ai. Se detectó publicando el primer artículo generado, que
 * llegó a WordPress con un enlace a una página de contenido y ninguno al
 * producto.
 *
 * Importa más de lo que parece: el sistema mide 1.784 sesiones y CERO
 * conversiones. Un artículo que atrae y no ofrece el paso siguiente es
 * exactamente esa cifra, repetida.
 *
 * El texto es el mismo que llevan los publicados, para que el lector encuentre
 * el mismo cierre venga del artículo que venga.
 */
const CTA = {
  en: `

---

You now know what to do. The hard part is doing it every week, without a marketing team, while you run the business.

That is the job FastStrat does: it plans the content, writes it, publishes it, and tells you what actually moved. One place, no stack to assemble.

**[Start free at app.faststrat.ai →](https://app.faststrat.ai)**

Set it up in minutes. Keep what works.
`,
  es: `

---

Ya sabes qué hacer. Lo difícil es hacerlo cada semana, sin equipo de marketing y mientras sacas adelante el negocio.

De eso se encarga FastStrat: planea el contenido, lo escribe, lo publica y te dice qué funcionó de verdad. En un solo sitio, sin herramientas que ensamblar.

**[Empieza gratis en app.faststrat.ai →](https://app.faststrat.ai)**

Se configura en minutos. Te quedas con lo que funcione.
`,
};

/** Añade el cierre si no está ya. Idempotente: el corrector puede haberlo dejado. */
const conCta = (markdown: string, lang: string) =>
  markdown.includes("app.faststrat.ai") ? markdown : markdown.trimEnd() + CTA[lang === "es" ? "es" : "en"];

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
  const LIMITE = 45; // 60 de Google menos " - faststrat.ai"
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

export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  // Modo A: keyword (+ title opcional). Modo B: topic libre (el agente elige título).
  const keyword: string | undefined = body.keyword;
  const topic: string | undefined = body.topic;
  if (!keyword && !topic) {
    return NextResponse.json({ error: "Falta 'keyword' o 'topic'" }, { status: 400 });
  }
  const lang: string = body.lang ?? "en";
  const category: string = body.category ?? "SEO";

  try {
    let title: string;
    let markdown: string;

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
Luego una línea en blanco y después el artículo completo en Markdown, siguiendo todos los estándares de calidad.`,
      });
      const m = raw.match(/^\s*TITLE:\s*(.+?)\s*\n/i);
      title = m ? m[1].trim().replace(/^["']|["']$/g, "") : topic.slice(0, 70);
      markdown = raw.replace(/^\s*TITLE:\s*.+?\n/i, "").trim();
    } else {
      // Sin título dado, lo elige el agente. El valor por defecto era
      // "Guía 2026: <keyword>", que es exactamente el título contra el que
      // compiten otros nueve iguales en la misma pantalla: promete "guía" y
      // "2026", que es lo que promete todo el mundo. Un título genérico en
      // posición 10 no se clica, y varios de los 17 artículos lo llevan.
      title = body.title ?? (await tituloPara(keyword ?? topic ?? "", lang));
      markdown = await runClaude({
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
La extensión la marca el tema, no una cuota. No hay mínimo de palabras.`,
      });
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
    const revisado = await dejarPublicable(title, markdown);
    markdown = revisado.markdown;

    const excerpt =
      markdown
        .replace(/[#*`>_-]/g, "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0]
        ?.slice(0, 155) ?? title;

    const post = createBlogPost({
      title,
      slug: slugify(title),
      excerpt,
      keywords: [keyword ?? title],
      lang,
      category,
      status: "draft", // los generados desde reportes entran como borrador
      markdown,
    });

    // Persiste al repo si está corriendo en producción (Render).
    await persistChanges(`new blog draft: ${post.slug}`, [
      path.join(process.cwd(), "content", "blog", `${post.slug}.md`),
    ]);

    // Preview: primeros ~500 caracteres del cuerpo para mostrar en el reporte.
    const preview = markdown.trim().slice(0, 500);

    return NextResponse.json({
      ok: true,
      slug: post.slug,
      title: post.title,
      excerpt,
      preview,
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
