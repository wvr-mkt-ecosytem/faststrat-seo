import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  keywords: string[];
  lang: string;
  category: string;
  status: string;
  file: string;
  /** Raw markdown body (without frontmatter). */
  markdown: string;
}

/** Reads all markdown blog posts from content/blog. */
export function getBlogPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
      const { data, content } = matter(raw);
      return {
        slug: data.slug ?? file.replace(/\.md$/, ""),
        title: data.title ?? "(untitled)",
        excerpt: data.excerpt ?? "",
        keywords: data.keywords ?? [],
        lang: data.lang ?? "en",
        category: data.category ?? "Uncategorized",
        status: data.status ?? "draft",
        file,
        markdown: content,
      };
    });
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return getBlogPosts().find((p) => p.slug === slug);
}

/** Converts a post's markdown body to HTML ready for WordPress. */
export function renderHtml(post: BlogPost): string {
  return marked.parse(post.markdown, { async: false }) as string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Crea un nuevo archivo de blog (frontmatter + cuerpo markdown). */
export function createBlogPost(meta: {
  title: string;
  slug?: string;
  excerpt: string;
  keywords: string[];
  lang: string;
  category: string;
  status?: string;
  markdown: string;
}): BlogPost {
  const slug = meta.slug ?? slugify(meta.title);
  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });
  const file = `${slug}.md`;
  const data = {
    title: meta.title,
    slug,
    excerpt: meta.excerpt,
    keywords: meta.keywords,
    lang: meta.lang,
    category: meta.category,
    status: meta.status ?? "publish",
  };
  fs.writeFileSync(
    path.join(BLOG_DIR, file),
    matter.stringify(meta.markdown.trim() + "\n", data)
  );
  return { ...data, file, markdown: meta.markdown };
}

/**
 * Reescribe el cuerpo markdown de un post conservando su frontmatter.
 * Devuelve el post actualizado.
 */
export function updateBlogMarkdown(slug: string, newMarkdown: string): BlogPost {
  const post = getBlogPost(slug);
  if (!post) throw new Error(`No se encontró el post '${slug}'`);
  const filePath = path.join(BLOG_DIR, post.file);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);
  const rebuilt = matter.stringify(newMarkdown.trim() + "\n", data);
  fs.writeFileSync(filePath, rebuilt);
  return { ...post, markdown: newMarkdown };
}
