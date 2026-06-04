import fs from "fs";
import path from "path";
import { getBlogPosts } from "../lib/blog.ts";
import { generateCover } from "../lib/cover.ts";

const OUT = path.join(process.cwd(), "public", "covers");
fs.mkdirSync(OUT, { recursive: true });

const eyebrowByLang: Record<string, string> = {
  en: "2026 Guide",
  es: "Guía 2026",
};

for (const post of getBlogPosts()) {
  const buf = await generateCover({
    eyebrow: eyebrowByLang[post.lang] ?? "2026",
    title: post.title,
    subtitle: post.excerpt,
    category: post.category,
  });
  const file = path.join(OUT, `${post.slug}.png`);
  fs.writeFileSync(file, buf);
  console.log(`✓ ${post.slug}.png (${Math.round(buf.length / 1024)} KB)`);
}
console.log("\nListo. Portadas en public/covers/");
