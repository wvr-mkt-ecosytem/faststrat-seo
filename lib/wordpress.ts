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

  if (existing) {
    const updated = await wpFetch(cfg, `posts/${existing.id}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { id: updated.id, link: updated.link, action: "updated" };
  }

  const created = await wpFetch(cfg, "posts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { id: created.id, link: created.link, action: "created" };
}
