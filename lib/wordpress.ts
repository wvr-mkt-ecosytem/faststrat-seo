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

export interface PublishInput {
  title: string;
  slug: string;
  contentHtml: string;
  excerpt: string;
  category: string;
  status: "publish" | "draft";
  /** PNG de la imagen destacada (opcional). */
  coverImage?: Buffer;
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
