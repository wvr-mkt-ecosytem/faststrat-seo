import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { CLIENTE } from "@/lib/cliente";
import { LIMITE_GOOGLE } from "@/lib/house-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cambia el título de una página ya publicada, con vista previa obligatoria.
//
// Es la recomendación más rentable del analista y la más segura de automatizar:
// no toca el cuerpo, no rompe enlaces y no cambia el slug. Pero tampoco se
// deshace con un clic: Google tarda semanas en reevaluar un título, así que
// esta ruta NUNCA escribe sin que le pidan escribir. Sin `apply: true` solo
// devuelve la comparación.
//
// Lo que se cuenta es el título RENDERIZADO, no el del post. El sitio le añade
// un sufijo y Google corta en 60, así que el presupuesto real es lo que quede.
// Contar solo el título del post decía que 58 estaba bien cuando en la SERP
// salía cortado a media palabra.

const LIMITE_SERP = LIMITE_GOOGLE;

const cfg = () => {
  // La variable es WP_URL, la misma que usa lib/wordpress.ts.
  //
  // Aquí decía WORDPRESS_URL, que NO existe en el entorno: nadie la define. La
  // ruta caía siempre al valor por defecto y funcionaba solo porque, en este
  // cliente, el WordPress vive justo en el dominio del contenido. En cualquier
  // instalación donde no coincidan (un WordPress en otro host, o headless) esta
  // ruta habría escrito el título en el sitio equivocado, o en ninguno.
  const base = (process.env.WP_URL || `https://${CLIENTE.dominio}`).replace(/\/$/, "");
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;
  if (!user || !pass) throw new Error("Faltan WP_USER y WP_APP_PASSWORD");
  return { base, auth: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") };
};

const wp = async (ruta: string, opts: RequestInit = {}) => {
  const { base, auth } = cfg();
  const r = await fetch(`${base}/wp-json/wp/v2/${ruta}`, {
    ...opts,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`WordPress respondió ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
};

/** El slug a partir de una ruta o una URL completa. */
const slugDe = (p: string) =>
  p
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/|\/$/g, "")
    .split("/")
    .pop() ?? "";

/**
 * Lee el <title> real de la página en vivo.
 *
 * Hace falta porque el sufijo lo añade el tema, no WordPress: el título del
 * post puede tener 45 caracteres y el <title> 60. Sin leerlo no se puede saber
 * cuánto margen queda de verdad.
 */
async function tituloRenderizado(url: string): Promise<string | null> {
  try {
    const html = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).text();
    return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

// POST { path, title?, apply?: boolean }
export const POST = apiRoute(async (request: NextRequest) => {
  const { path: ruta, title: nuevo, apply } = await request.json().catch(() => ({}));
  if (!ruta) return NextResponse.json({ error: "Falta 'path'" }, { status: 400 });

  const slug = slugDe(String(ruta));
  if (!slug) return NextResponse.json({ error: `No se pudo sacar el slug de '${ruta}'` }, { status: 400 });

  const encontrados = await wp(`posts?slug=${encodeURIComponent(slug)}&_fields=id,slug,title,link`);
  const post = Array.isArray(encontrados) ? encontrados[0] : null;
  if (!post) {
    return NextResponse.json(
      { error: `No hay ningún post publicado con el slug '${slug}'. Comprueba la ruta.` },
      { status: 404 },
    );
  }

  const actual: string = post.title?.rendered ?? "";
  const renderizado = await tituloRenderizado(post.link);
  // El sufijo se deduce de la diferencia, en vez de escribirlo a mano: así
  // sigue siendo correcto el día que alguien lo cambie en el tema.
  const sufijo = renderizado && renderizado.endsWith(actual) === false && renderizado.includes(actual)
    ? renderizado.slice(renderizado.indexOf(actual) + actual.length)
    : "";
  const margen = Math.max(20, LIMITE_SERP - sufijo.length);

  const medir = (t: string) => ({
    texto: t,
    caracteres: t.length,
    enSerp: (t + sufijo).length,
    seCorta: (t + sufijo).length > LIMITE_SERP,
  });

  const base = {
    slug,
    id: post.id,
    link: post.link,
    sufijo,
    limiteSerp: LIMITE_SERP,
    margen,
    actual: medir(actual),
    propuesto: nuevo ? medir(String(nuevo)) : null,
  };

  // Sin `apply` no se escribe. La vista previa es el modo por defecto a
  // propósito: cambiar el título de una página que rankea tarda semanas en
  // reevaluarse y no hay botón de deshacer.
  if (!apply) {
    return NextResponse.json({ ...base, applied: false });
  }

  if (!nuevo || !String(nuevo).trim()) {
    return NextResponse.json({ error: "Para aplicar hace falta 'title'" }, { status: 400 });
  }

  const guardado = await wp(`posts/${post.id}`, {
    method: "POST",
    body: JSON.stringify({ title: String(nuevo).trim() }),
  });

  // Se comprueba contra la página en vivo, no contra lo que WordPress dice
  // haber guardado. Es el mismo criterio que el resto del sistema: cuenta el
  // resultado, no la intención.
  const despues = await tituloRenderizado(post.link);

  return NextResponse.json({
    ...base,
    applied: true,
    guardado: guardado.title?.rendered ?? null,
    // El slug NO cambia al cambiar el título: por eso esta acción es segura y
    // no requiere redirecciones.
    slugIntacto: guardado.slug === slug,
    tituloEnVivo: despues,
    tituloEnVivoCaracteres: despues?.length ?? null,
  });
});
