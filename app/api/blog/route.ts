import fs from "fs";
import { apiRoute } from "@/lib/google-auth-state";
import path from "path";
import { NextResponse } from "next/server";
import { getBlogPosts } from "@/lib/blog";
import { getPublishStatuses } from "@/lib/wordpress";

export const GET = apiRoute(async () => {
  const coversDir = path.join(process.cwd(), "public", "covers");
  const all = getBlogPosts();

  // Estado real en WordPress por slug (en vivo / borrador / no publicado).
  const { statuses: wpStatuses, error: wpError } = await getPublishStatuses(all.map((p) => p.slug));

  const posts = all.map((p) => {
    const hasCover = fs.existsSync(path.join(coversDir, `${p.slug}.png`));
    const wp = wpStatuses[p.slug];
    return {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      keywords: p.keywords,
      keywordRationale: p.keywordRationale,
      keywordTrend: p.keywordTrend,
      alternate: p.alternate,
      publishAt: p.publishAt,
      lang: p.lang,
      category: p.category,
      status: p.status,
      wordCount: p.markdown.split(/\s+/).filter(Boolean).length,
      coverUrl: hasCover ? `/covers/${p.slug}.png` : null,
      // Estado en WordPress: "publish" (en vivo), "draft" (borrador), o null (no está en WP)
      wpStatus: wp?.status ?? null,
      wpLink: wp?.link ?? null,
      // `html` se enviaba con el artículo entero renderizado para cada post y
      // la pantalla nunca lo usa: era el cuerpo completo de 17 artículos
      // viajando al navegador para tirarlo. Fuera.
    };
  });
  // Si WordPress no respondió, se dice. Sin esto, todos los posts salían con
  // wpStatus null y la pantalla los pintaba como "No publicado" aunque
  // estuvieran en vivo.
  return NextResponse.json({ posts, wpError });
});
