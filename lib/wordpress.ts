// Cliente mínimo del WordPress REST API usando Application Passwords.
// Requiere en .env.local:
//   WP_URL=https://faststrat.ai
//   WP_USER=<usuario de WordPress>
//   WP_APP_PASSWORD=<application password, con o sin espacios>

interface WpConfig {
  url: string;
  user: string;
  appPassword: string;
}

function getConfig(): WpConfig {
  const url = process.env.WP_URL;
  const user = process.env.WP_USER;
  const appPassword = process.env.WP_APP_PASSWORD;
  if (!url || !user || !appPassword) {
    throw new Error(
      "Faltan credenciales de WordPress (WP_URL, WP_USER, WP_APP_PASSWORD en .env.local)"
    );
  }
  return { url: url.replace(/\/$/, ""), user, appPassword: appPassword.replace(/\s/g, "") };
}

function authHeader(cfg: WpConfig): string {
  const token = Buffer.from(`${cfg.user}:${cfg.appPassword}`).toString("base64");
  return `Basic ${token}`;
}

async function wpFetch(cfg: WpConfig, endpoint: string, init?: RequestInit) {
  const res = await fetch(`${cfg.url}/wp-json/wp/v2/${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(cfg),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `WP ${endpoint} → ${res.status}: ${body?.message ?? JSON.stringify(body)}`
    );
  }
  return body;
}

/** Busca una categoría por nombre; la crea si no existe. Devuelve su ID. */
async function ensureCategory(cfg: WpConfig, name: string): Promise<number> {
  const found = await wpFetch(
    cfg,
    `categories?search=${encodeURIComponent(name)}`
  );
  const match = Array.isArray(found)
    ? found.find((c: { name: string }) => c.name.toLowerCase() === name.toLowerCase())
    : null;
  if (match) return match.id;
  const created = await wpFetch(cfg, "categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return created.id;
}

/** Devuelve el post existente con ese slug, o null. */
async function findBySlug(cfg: WpConfig, slug: string) {
  const found = await wpFetch(cfg, `posts?slug=${encodeURIComponent(slug)}&status=any`);
  return Array.isArray(found) && found.length > 0 ? found[0] : null;
}

/** Sube una imagen PNG a la biblioteca de medios. Devuelve el ID del media. */
async function uploadMedia(
  cfg: WpConfig,
  bytes: Buffer,
  filename: string,
  altText: string
): Promise<number> {
  const res = await fetch(`${cfg.url}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(bytes),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WP media → ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  }
  if (altText) {
    await wpFetch(cfg, `media/${body.id}`, {
      method: "POST",
      body: JSON.stringify({ alt_text: altText }),
    }).catch(() => {});
  }
  return body.id as number;
}

/**
 * Todos los títulos que ya existen en WordPress, publicados o en borrador.
 *
 * Hace falta para no volver a escribir algo que ya está. El repositorio local
 * solo tiene 21 artículos y el sitio tiene 109: comprobar contra content/blog
 * dejaba fuera el 80% de lo publicado, que es justo donde están las
 * canibalizaciones que hoy hay que deshacer con redirecciones.
 *
 * Nunca lanza. Si WordPress no responde, devuelve lo que tenga y dice por qué:
 * quedarse sin catálogo no puede impedir escribir, pero sí tiene que constar,
 * porque una comprobación que falla en silencio se lee como una que pasó.
 */
export async function listarTitulos(): Promise<{
  posts: { title: string; slug: string; status: string }[];
  error: string | null;
}> {
  let cfg: WpConfig;
  try {
    cfg = getConfig();
  } catch (e) {
    return { posts: [], error: `WordPress sin configurar: ${(e as Error).message}` };
  }

  const posts: { title: string; slug: string; status: string }[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const list = await wpFetch(
        cfg,
        `posts?per_page=100&page=${page}&status=any&_fields=title,slug,status`,
      );
      if (!Array.isArray(list) || list.length === 0) break;
      for (const p of list) {
        // WordPress devuelve el título con entidades HTML (&amp;, &#8217;).
        // Sin decodificarlas, la comparación trata "AI &amp; SEO" y "AI & SEO"
        // como títulos distintos y el choque no se detecta.
        const bruto: string = p.title?.rendered ?? "";
        const limpio = bruto
          .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#0?39;|&apos;|&#8217;/g, "'")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        if (limpio) posts.push({ title: limpio, slug: p.slug ?? "", status: p.status ?? "" });
      }
      if (list.length < 100) break;
    }
  } catch (e) {
    return { posts, error: `No se pudo listar WordPress: ${(e as Error).message}` };
  }
  return { posts, error: null };
}

/**
 * Consulta el estado en WordPress de una lista de slugs.
 * Devuelve un mapa slug → { status, link } para los que existen en WP.
 * Si no hay credenciales, devuelve {} (no rompe).
 */
export async function getPublishStatuses(
  slugs: string[]
): Promise<{ statuses: Record<string, { status: string; link: string }>; error: string | null }> {
  // Devuelve el error en vez de tragárselo.
  //
  // Antes devolvía {} tanto si faltaban credenciales como si WordPress fallaba,
  // y la pantalla pintaba "○ No publicado" en TODOS los posts. Dos problemas:
  // el estado que se enseñaba era falso, y "Publicar todos" tomaba esa lista
  // de falsos pendientes como objetivo y reempujaba al sitio en vivo artículos
  // que ya estaban publicados.
  let cfg: WpConfig;
  try {
    cfg = getConfig();
  } catch (e) {
    return { statuses: {}, error: `WordPress sin configurar: ${(e as Error).message}` };
  }

  const statuses: Record<string, { status: string; link: string }> = {};
  try {
    // Todas las páginas. Con el tope de 100 por petición, el post 101 en
    // adelante siempre salía como "No publicado" sin que nada lo delatara.
    for (let page = 1; page <= 20; page++) {
      const list = await wpFetch(
        cfg,
        `posts?per_page=100&page=${page}&status=any&_fields=slug,status,link`
      );
      if (!Array.isArray(list) || list.length === 0) break;
      for (const p of list) {
        if (p.slug && slugs.includes(p.slug)) {
          statuses[p.slug] = { status: p.status, link: p.link };
        }
      }
      if (list.length < 100) break;
    }
  } catch (e) {
    return { statuses, error: `No se pudo consultar WordPress: ${(e as Error).message}` };
  }
  return { statuses, error: null };
}

/**
 * Guarda en WordPress la pareja de idiomas, en los dos posts.
 *
 * El campo lo lee el fragmento de WPCode para emitir las etiquetas hreflang
 * (ver docs/hreflang-wpcode.md). Si el fragmento no está pegado, esto guarda un
 * campo que nadie lee: no rompe nada y queda listo para cuando se pegue.
 *
 * Recíproco porque Google ignora el grupo entero si una versión no devuelve el
 * enlace. Nunca lanza: quedarse sin hreflang es un defecto, no publicar es peor.
 */
export async function emparejarEnWordpress(
  slugA: string,
  langA: string,
  slugB: string,
  langB: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = getConfig();
    const a = await findBySlug(cfg, slugA);
    const b = await findBySlug(cfg, slugB);
    if (!a || !b) {
      // Lo normal cuando solo se ha publicado una de las dos. No es un fallo:
      // al publicar la segunda se vuelve a intentar y entonces sí encuentra las dos.
      return { ok: false, error: `Todavía no están las dos en WordPress (falta ${!a ? slugA : slugB})` };
    }

    const meta = (otro: { link: string }, langOtro: string, langPropio: string) => ({
      faststrat_alternate: { lang: langOtro, url: otro.link, self_lang: langPropio },
    });

    await wpFetch(cfg, `posts/${a.id}`, {
      method: "POST",
      body: JSON.stringify({ meta: meta(b, langB, langA) }),
    });
    await wpFetch(cfg, `posts/${b.id}`, {
      method: "POST",
      body: JSON.stringify({ meta: meta(a, langA, langB) }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface PublishInput {
  title: string;
  slug: string;
  contentHtml: string;
  excerpt: string;
  category: string;
  status: "publish" | "draft";
  /** PNG de la imagen destacada (opcional). */
  coverImage?: Buffer;
  /** Nombre del autor. Se resuelve al usuario de WordPress que coincida. */
  authorName?: string;
  /**
   * Cuándo debe salir, en ISO. Si es futura y el estado es "publish",
   * WordPress lo deja PROGRAMADO en vez de publicarlo ya.
   */
  publishAt?: string;
}

/**
 * El id de usuario de WordPress que corresponde a un nombre.
 *
 * WordPress no acepta el nombre en el campo `author`: quiere el id numérico.
 * Si no encuentra a nadie devuelve undefined y el post se publica con el autor
 * de las credenciales, que es lo que pasaba hasta ahora. Nunca lanza: quedarse
 * sin firmar es un defecto, no publicar es peor.
 */
async function buscarAutor(cfg: WpConfig, nombre: string): Promise<number | undefined> {
  try {
    const users = await wpFetch(cfg, `users?search=${encodeURIComponent(nombre)}&_fields=id,name,slug`);
    if (!Array.isArray(users) || users.length === 0) return undefined;
    const exacto = users.find(
      (u: { name?: string }) => (u.name ?? "").toLowerCase() === nombre.toLowerCase(),
    );
    return (exacto ?? users[0])?.id;
  } catch {
    return undefined;
  }
}

export interface PublishResult {
  id: number;
  link: string;
  action: "created" | "updated";
  /** Estado REAL devuelto por WordPress: "publish" = en vivo, "draft" = borrador. */
  status: string;
  /** true solo si WordPress confirma que está publicado en vivo. */
  live: boolean;
}

/** Crea o actualiza un post en WordPress (idempotente por slug). */
export async function publishPost(input: PublishInput): Promise<PublishResult> {
  const cfg = getConfig();
  const categoryId = await ensureCategory(cfg, input.category);
  const existing = await findBySlug(cfg, input.slug);

  let featuredMedia: number | undefined;
  if (input.coverImage) {
    featuredMedia = await uploadMedia(
      cfg,
      input.coverImage,
      `${input.slug}.png`,
      input.title
    );
  }

  const payload: Record<string, unknown> = {
    title: input.title,
    slug: input.slug,
    content: input.contentHtml,
    excerpt: input.excerpt,
    status: input.status,
    categories: [categoryId],
  };
  if (featuredMedia) payload.featured_media = featuredMedia;

  if (input.authorName) {
    const autorId = await buscarAutor(cfg, input.authorName);
    if (autorId) payload.author = autorId;
  }

  // Fecha futura + estado "publish" = programado.
  //
  // WordPress exige el estado "future" explícitamente: mandar solo una fecha
  // futura con status "publish" lo publica igualmente, con la fecha por delante
  // pero visible desde ya. La comparación se hace contra el instante actual,
  // no contra el día, para que programar "hoy a las 18:00" funcione.
  if (input.publishAt) {
    const cuando = new Date(input.publishAt);
    if (!Number.isNaN(cuando.getTime())) {
      payload.date_gmt = cuando.toISOString().replace(/\.\d{3}Z$/, "");
      if (input.status === "publish" && cuando.getTime() > Date.now()) {
        payload.status = "future";
      }
    }
  }

  const saved = existing
    ? await wpFetch(cfg, `posts/${existing.id}`, { method: "POST", body: JSON.stringify(payload) })
    : await wpFetch(cfg, "posts", { method: "POST", body: JSON.stringify(payload) });

  // Releemos el post para confirmar el estado REAL en WordPress (no asumimos).
  let confirmedStatus = saved.status as string;
  let confirmedLink = saved.link as string;
  try {
    const check = await wpFetch(cfg, `posts/${saved.id}?status=any&_fields=status,link`);
    confirmedStatus = check.status ?? confirmedStatus;
    confirmedLink = check.link ?? confirmedLink;
  } catch {
    /* si falla la verificación, usamos lo que devolvió el guardado */
  }

  return {
    id: saved.id,
    link: confirmedLink,
    action: existing ? "updated" : "created",
    status: confirmedStatus,
    live: confirmedStatus === "publish",
  };
}
