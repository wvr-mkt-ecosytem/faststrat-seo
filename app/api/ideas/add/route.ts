import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getIdeaBatches, type ArticleIdea, type IdeaBatch } from "@/lib/ideas";
import { slugify } from "@/lib/blog";
import { persistChanges } from "@/lib/persist";

const IDEAS_DIR = path.join(process.cwd(), "data", "ideas");

// POST /api/ideas/add { title, primaryKeyword, lang?, priority?, intent?, rationale? }
// Agrega una idea a la tanda más reciente (o crea una para la semana actual).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body.title || !body.primaryKeyword) {
    return NextResponse.json({ error: "Faltan 'title' o 'primaryKeyword'" }, { status: 400 });
  }

  const idea: ArticleIdea = {
    title: body.title,
    slug: slugify(body.title),
    lang: body.lang ?? "en",
    priority: body.priority ?? "media",
    primaryKeyword: body.primaryKeyword,
    intent: body.intent ?? "Informacional",
    rationale: body.rationale ?? "Agregada manualmente desde el reporte de queries.",
    outline: body.outline ?? [],
  };

  fs.mkdirSync(IDEAS_DIR, { recursive: true });
  const batches = getIdeaBatches();
  const today = new Date().toISOString().split("T")[0];

  let batch: IdeaBatch;
  let file: string;

  if (batches[0] && batches[0].weekOf === today) {
    batch = batches[0];
    file = `${today}.json`;
  } else {
    batch = {
      weekOf: today,
      generatedAt: new Date().toISOString(),
      source: "manual-add",
      summary: "Ideas agregadas manualmente desde el reporte.",
      research: { competitors: [], trends: [] },
      ideas: [],
    };
    file = `${today}.json`;
  }

  if (!batch.ideas.some((i) => i.slug === idea.slug)) {
    batch.ideas.unshift(idea);
  }

  const outPath = path.join(IDEAS_DIR, file);
  fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
  await persistChanges(`idea added: ${idea.slug}`, [outPath]);
  return NextResponse.json({ ok: true, weekOf: batch.weekOf, total: batch.ideas.length });
}
