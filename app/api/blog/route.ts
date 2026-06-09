import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getBlogPosts, renderHtml } from "@/lib/blog";
import { getPublishStatuses } from "@/lib/wordpress";

export async function GET() {
  const coversDir = path.join(process.cwd(), "public", "covers");
  const all = getBlogPosts();

  // Estado real en WordPress por slug (en vivo / borrador / no publicado).
  const wpStatuses = await getPublishStatuses(all.map((p) => p.slug));

  const posts = all.map((p) => {
    const hasCover = fs.existsSync(path.join(coversDir, `${p.slug}.png`));
    const wp = wpStatuses[p.slug];
    return {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      keywords: p.keywords,
      lang: p.lang,
      category: p.category,
      status: p.status,
      wordCount: p.markdown.split(/\s+/).filter(Boolean).length,
      coverUrl: hasCover ? `/covers/${p.slug}.png` : null,
      // Estado en WordPress: "publish" (en vivo), "draft" (borrador), o null (no está en WP)
      wpStatus: wp?.status ?? null,
      wpLink: wp?.link ?? null,
      html: renderHtml(p),
    };
  });
  return NextResponse.json({ posts });
}
