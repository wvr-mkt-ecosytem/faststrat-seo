import path from "path";
import { apiRoute } from "@/lib/google-auth-state";
import { NextRequest, NextResponse } from "next/server";
import { getBlogPost, createBlogPost, slugify, emparejar } from "@/lib/blog";
import { runClaude } from "@/lib/claude";
import { REGLAS_DE_CASA } from "@/lib/house-rules";
import { INSTRUCCION_LEGIBILIDAD } from "@/lib/legibilidad";
import { INSTRUCCION_DIFERENCIAL, INSTRUCCION_KEYWORD, partir } from "@/lib/diferencial";
import { instruccionesAdaptar, cabecera, NOMBRE_IDIOMA } from "@/lib/adaptar";
import { revisarTitulo, explicar } from "@/lib/catalogo";
import { dejarPublicable } from "@/lib/publicable";
import { persistChanges } from "@/lib/persist";
import { apuntar } from "@/lib/duraciones";
import { CONTEXTO_CLIENTE, conCta, geosDe } from "@/lib/cliente";
import { tendenciaEnVarios } from "@/lib/trends";

export const maxDuration = 800;
export const dynamic = "force-dynamic";

// La versión en el otro idioma de un artículo que ya existe.
//
// POR QUÉ ES UNA RUTA APARTE Y NO UN PARÁMETRO DE /generate. Escribir un
// artículo tarda unos 24 minutos medidos. Dos son 48, y el límite de la
// plataforma son 13,3 (maxDuration = 800s): una sola petición que escribiera
// las dos versiones se cortaría a media faena y perdería el trabajo pagado.
//
// Así que el botón "en los dos idiomas" hace DOS llamadas seguidas: primero
// /generate, después esta con el slug que salió. Cada una cabe de sobra, y si
// la segunda falla, la primera ya está guardada.

const SISTEMA = `${CONTEXTO_CLIENTE} Eres redactor SEO senior y escribes de forma nativa en el idioma que se te pida.

${REGLAS_DE_CASA}

${INSTRUCCION_LEGIBILIDAD}

${INSTRUCCION_DIFERENCIAL}

${INSTRUCCION_KEYWORD}`;

// POST { slug, lang }   lang = idioma DESTINO
export const POST = apiRoute(async (request: NextRequest) => {
  // Se cronometra la corrida entera para que la barra de progreso diga un
  // tiempo medido y no uno supuesto. Solo se apunta si TERMINA.
  const arranque = Date.now();
  const { slug, lang, force } = await request.json().catch(() => ({}));
  if (!slug) return NextResponse.json({ error: "Falta 'slug'" }, { status: 400 });

  const original = getBlogPost(slug);
  if (!original) return NextResponse.json({ error: `No se encontró '${slug}'` }, { status: 404 });

  const destino: string = lang ?? (original.lang === "es" ? "en" : "es");
  if (destino === original.lang) {
    return NextResponse.json(
      { error: `El artículo ya está en ${NOMBRE_IDIOMA[destino] ?? destino}` },
      { status: 400 },
    );
  }

  // Si ya tiene pareja en ese idioma, no se escribe otra: sería crear
  // exactamente la canibalización que el resto del sistema evita.
  if (original.alternate?.lang === destino) {
    return NextResponse.json(
      {
        error: `Ya existe la versión en ${NOMBRE_IDIOMA[destino] ?? destino}`,
        slug: original.alternate.slug,
      },
      { status: 409 },
    );
  }

  try {
    const raw = await runClaude({
      model: "sonnet",
      // Busca en la web porque tiene que mirar la SERP del idioma destino, que
      // es el punto entero de adaptar en vez de traducir.
      allowedTools: ["WebSearch", "WebFetch"],
      system: SISTEMA,
      prompt: instruccionesAdaptar({
        idiomaDestino: destino,
        tituloOriginal: original.title,
        markdownOriginal: original.markdown,
        keywordOriginal: original.keywords[0] ?? original.title,
      }),
    });

    const { title, keyword } = cabecera(raw);
    const partes = partir(raw);

    if (!partes.markdown.trim() || !title) {
      return NextResponse.json(
        {
          error:
            "El agente no devolvió el título o el marcador <<<ARTICULO>>>, así que no se puede separar " +
            "su razonamiento del texto. No se guardó nada.",
        },
        { status: 502 },
      );
    }

    // El choque se comprueba también aquí.
    //
    // Una versión en otro idioma no suele pisarse con nada —las palabras son
    // otras— pero el agente puede elegir un título que coincida con un artículo
    // que ya existe en ESE idioma, y entonces sí compiten.
    if (!force) {
      const v = await revisarTitulo(title);
      if (!v.ok) {
        return NextResponse.json(
          {
            error: `El título elegido, "${title}", se pisa con algo que ya existe`,
            explicacion: explicar(v),
            choques: v.choques,
            titulo: title,
            markdown: partes.markdown,
            comoSeguir: "Reenvía con force: true si de verdad son intenciones distintas.",
          },
          { status: 409 },
        );
      }
    }

    const kw = keyword ?? original.keywords[0] ?? title;
    const conCierre = conCta(partes.markdown, destino);
    const revisado = await dejarPublicable(title, conCierre, {
      differentiator: partes.diferencial,
      exigirDiferencial: true,
    });

    const esEtiqueta = (l: string) =>
      /^(?:t[íi]tulo|title|keyword|idioma|language|audiencia|audience|meta)\s*:/i.test(l);
    const primeraFrase = revisado.markdown
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

    const nuevo = createBlogPost({
      title,
      slug: slugify(title),
      excerpt: (primeraFrase ?? title).replace(/[#*`>_]/g, "").trim().slice(0, 155),
      keywords: [kw],
      lang: destino,
      category: original.category,
      status: "draft",
      differentiator: partes.diferencial,
      keywordRationale: partes.keyword,
      // Se mide en el país del idioma DESTINO. Medir la keyword en español
      // contra la demanda mundial daría una cifra que no describe a nadie.
      keywordTrend: (await tendenciaEnVarios(kw, geosDe(destino))) ?? undefined,
      markdown: revisado.markdown,
    });

    // El enlace es recíproco y se hace DESPUÉS de crear: hasta que el archivo
    // no existe, emparejar no lo encuentra.
    emparejar(original.slug, nuevo.slug);

    await persistChanges(`versión en ${destino}: ${nuevo.slug}`, [
      path.join(process.cwd(), "content", "blog", `${nuevo.slug}.md`),
      path.join(process.cwd(), "content", "blog", original.file),
    ]);

    apuntar("adaptar", (Date.now() - arranque) / 1000);

    return NextResponse.json({
      ok: true,
      slug: nuevo.slug,
      title: nuevo.title,
      lang: destino,
      keyword: kw,
      original: original.slug,
      diferencial: partes.diferencial,
      keywordRationale: partes.keyword,
      wordCount: revisado.markdown.split(/\s+/).filter(Boolean).length,
      pendientes: revisado.pendientes.length ? revisado.pendientes : undefined,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
});
