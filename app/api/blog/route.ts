import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getBlogPosts, renderHtml } from "@/lib/blog";

export async function GET() {
  const coversDir = path.join(process.cwd(), "public", "covers");
  const posts = getBlogPosts().map((p) => {
    const hasCover = fs.existsSync(path.join(coversDir, `${p.slug}.png`));
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
      html: renderHtml(p),
    };
  });
  return NextResponse.json({ posts });
}
