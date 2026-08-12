import path from "path";
import { apiRoute } from "@/lib/google-auth-state";
import { NextRequest, NextResponse } from "next/server";
import { getBlogPost, updateBlogMarkdown } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { runQa, type Finding, type HouseRules } from "@/lib/qa";
import { persistChanges } from "@/lib/persist";

// El corrector: coge lo que la compuerta bloqueó y lo arregla.
//
// Hasta ahora la compuerta decía "no publicas" y ahí acababa. Es correcto como
// freno y es inútil como herramienta: el borrador se quedaba parado esperando
// a que alguien tradujera cinco hallazgos técnicos a cinco ediciones. Esto
// hace esa traducción.
//
// Dos decisiones que sostienen todo lo demás:
//
// 1. NO se cree al agente. Después de editar se vuelve a correr runQa sobre el
//    texto nuevo, y lo que se devuelve es el resultado de esa segunda pasada,
//    no lo que el agente diga que hizo. Un corrector que se autocertifica es
//    exactamente el fallo que la compuerta existe para evitar.
//
// 2. Solo se guarda si mejora. Si la corrección deja MÁS bloqueos que antes,
//    se descarta y se devuelve el original: es preferible un borrador parado a
//    un borrador roto de otra manera.
//
// Sobre las cifras sin fuente: el agente tiene búsqueda web, así que puede
// buscar la fuente real y enlazarla. Lo que no puede es inventarse un enlace
// para callar la regla, y por eso la segunda pasada comprueba el resultado y
// no la intención.

const HOUSE: HouseRules = { noEmDash: true };

/**
 * Sustituye las rayas largas. Determinista y sin criterio: por eso no se le
 * pide a un agente, que además se deja alguna (29 de 30 en la primera prueba
 * real, y una sola basta para que el artículo no se publique).
 */
const barrerRayas = (t: string) =>
  t
    // Al final de línea, un punto: una coma dejaría la frase colgando.
    .replace(/\s*—\s*$/gm, ".")
    // Entre espacios es un inciso: la coma es lo que menos cambia el ritmo.
    .replace(/\s+—\s+/g, ", ")
    .replace(/—/g, ", ");

const SYSTEM = `Eres el editor que deja un artículo listo para publicar. Recibes el artículo en Markdown y la lista EXACTA de lo que una comprobación mecánica bloqueó.

Tu trabajo es arreglar cada hallazgo con el mínimo cambio posible. No es una reescritura: si un hallazgo se arregla cambiando tres palabras, cambias tres palabras.

Cómo se arregla cada tipo:

- banned-phrase: reescribe la frase diciendo lo mismo sin esa palabra. No la cambies por otra igual de vacía.
- placeholder-left-in: el marcador se resuelve o se va, junto con la frase que lo necesitaba si no puedes resolverlo.
- figure-without-source: tienes búsqueda web. Busca la fuente real de la cifra y enlázala en la misma frase o en la siguiente. Si NO encuentras una fuente que diga exactamente esa cifra, QUITA la cifra y reformula en cualitativo. Prohibido inventar un enlace, atribuir la cifra a alguien que no la publicó, o enlazar a una página que no la contiene.
- quote-not-verbatim: quita la cita o parafraséala sin comillas. Nunca la ajustes para que encaje.
- circular-self-citation: añade una fuente externa real y comprobable.
- no-external-links / no-internal-link: añade el enlace que falta, relevante y real.
- heading-too-deep / heading-skips-level: ajusta el nivel del encabezado sin tocar el texto.

Reglas que no puedes romper:
- No cambies el tema, el idioma ni la estructura del artículo.
- No toques el frontmatter. Devuelves SOLO el cuerpo en Markdown.
- No añadas cifras nuevas que no estuvieran.
- Devuelve el artículo entero, no un fragmento ni un diff.

Devuelve ÚNICAMENTE el Markdown del cuerpo, sin explicaciones y sin envolverlo en bloques de código.`;

const listar = (f: Finding[]) =>
  f.map((x) => `- [${x.rule}] ${x.detail}${x.excerpt ? `\n  en: "${x.excerpt}"` : ""}`).join("\n");

// POST /api/blog/fix  { slug, preview?: boolean }
export const POST = apiRoute(async (request: NextRequest) => {
  const { slug, preview } = await request.json().catch(() => ({}));
  if (!slug) return NextResponse.json({ error: "Falta 'slug'" }, { status: 400 });

  const post = getBlogPost(slug);
  if (!post) return NextResponse.json({ error: `No se encontró el post '${slug}'` }, { status: 404 });

  // El barrido va PRIMERO, no solo al final.
  //
  // Estaba solo después, para que el agente eligiera entre coma, punto y
  // paréntesis. Medido sobre los 17 artículos: de 306 bloqueos, 203 eran rayas
  // largas. El agente gastaba la mayor parte de su respuesta sustituyendo
  // caracteres, y esas llamadas son lo que se agota cuando llega el límite de
  // sesión: dos corridas seguidas se quedaron a medias por eso. Sustituir un
  // carácter no necesita criterio, así que se hace antes gratis y el agente se
  // queda con lo único que sí lo necesita, las cifras sin fuente.
  //
  // Sigue habiendo un barrido al final, como red por si el agente reintroduce
  // alguna al reescribir.
  const markdownBase = HOUSE.noEmDash ? barrerRayas(post.markdown) : post.markdown;

  const antes = runQa({
    title: post.title,
    metaDescription: post.excerpt,
    markdown: markdownBase,
    house: HOUSE,
  });

  if (antes.ok) {
    // Si el barrido bastó, se guarda: descartarlo obligaría a rehacerlo en la
    // siguiente corrida y el artículo seguiría bloqueado en pantalla.
    const cambio = markdownBase !== post.markdown;
    if (cambio && !preview) {
      const actualizado = updateBlogMarkdown(slug, markdownBase);
      await persistChanges(`fix blog (barrido) : ${actualizado.slug}`, [
        path.join(process.cwd(), "content", "blog", actualizado.file),
      ]);
    }
    return NextResponse.json({
      changed: cambio,
      publishable: true,
      message: cambio
        ? "Bastó con el barrido de rayas largas; no hizo falta el agente."
        : "No había nada que bloqueara la publicación; no se tocó el artículo.",
      qa: antes,
    });
  }

  const nuevo = await runClaude({
    model: "sonnet",
    system: SYSTEM,
    allowedTools: ["WebSearch", "WebFetch"],
    prompt: `Título: "${post.title}"

BLOQUEOS (hay que resolver todos):
${listar(antes.blocking)}

AVISOS (resuélvelos si puedes hacerlo sin forzar el texto):
${listar(antes.warnings)}

ARTÍCULO:
---
${markdownBase}
---

Devuelve el artículo entero corregido en Markdown.`,
  });

  let limpio = nuevo
    .trim()
    .replace(/^```(?:markdown|md)?/i, "")
    .replace(/```$/, "")
    .trim();

  // El mismo barrido otra vez, ahora como red.
  //
  // El texto que recibió el agente ya venía sin rayas, pero al reescribir
  // párrafos puede introducir alguna nueva, y una sola basta para que el
  // artículo no se publique.
  if (HOUSE.noEmDash) limpio = barrerRayas(limpio);

  // La segunda pasada es el único juez. Lo que el agente crea haber arreglado
  // no cuenta: cuenta lo que la misma comprobación dice del texto nuevo.
  const despues = runQa({
    title: post.title,
    metaDescription: post.excerpt,
    markdown: limpio,
    house: HOUSE,
  });

  const mejora = despues.blocking.length < antes.blocking.length;

  if (!mejora) {
    return NextResponse.json({
      changed: false,
      publishable: false,
      message:
        `La corrección no redujo los bloqueos (${antes.blocking.length} antes, ${despues.blocking.length} después), ` +
        "así que se descarta y el artículo queda como estaba. Suele pasar cuando la cifra bloqueada no tiene fuente pública: " +
        "en ese caso hay que decidir a mano si se quita o de dónde sale.",
      qa: { antes, despues },
      markdown: post.markdown,
    });
  }

  if (preview) {
    return NextResponse.json({ changed: true, publishable: despues.ok, markdown: limpio, qa: { antes, despues } });
  }

  const updated = updateBlogMarkdown(slug, limpio);
  await persistChanges(`fix blog para publicar: ${updated.slug}`, [
    path.join(process.cwd(), "content", "blog", updated.file),
  ]);

  return NextResponse.json({
    changed: true,
    saved: true,
    // Se dice si quedó publicable o no. Devolver "arreglado" cuando aún
    // bloquea sería el mismo problema que teníamos, con otra cara.
    publishable: despues.ok,
    message: despues.ok
      ? "Corregido y ya pasa la compuerta."
      : `Corregido en parte: quedan ${despues.blocking.length} bloqueo(s) que necesitan una decisión humana.`,
    markdown: updated.markdown,
    qa: { antes, despues },
  });
});
