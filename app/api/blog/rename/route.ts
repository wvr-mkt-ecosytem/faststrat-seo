import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { getBlogPost, slugify } from "@/lib/blog";
import { revisarTitulo, explicar } from "@/lib/catalogo";
import { persistChanges } from "@/lib/persist";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cambiar el título de un BORRADOR.
//
// Existe para dar salida al bloqueo por canibalización. Antes, cuando un
// artículo chocaba con una página ya publicada, la pantalla decía "compite con
// una página que ya está publicada" y ahí acababa: ni decía con cuál ni dejaba
// hacer nada. Un freno sin salida se acaba rodeando, y el rodeo aquí es
// publicar igual y crear la canibalización.
//
// Solo borradores. Renombrar algo ya publicado cambia su URL y necesita una
// redirección 301: eso es otra operación, con otras consecuencias, y tiene su
// propio flujo (scripts/arreglar-slugs.mjs).

// POST { slug, title }
export const POST = apiRoute(async (request: NextRequest) => {
  const { slug, title } = await request.json().catch(() => ({}));
  if (!slug || !title?.trim()) {
    return NextResponse.json({ error: "Faltan 'slug' y 'title'" }, { status: 400 });
  }

  const post = getBlogPost(slug);
  if (!post) return NextResponse.json({ error: `No se encontró '${slug}'` }, { status: 404 });

  const nuevoTitulo = String(title).trim();
  const nuevoSlug = slugify(nuevoTitulo);

  // El título nuevo se comprueba igual que el viejo. Si no, esto sería una
  // puerta trasera para meter exactamente lo que la compuerta impide.
  const v = await revisarTitulo(nuevoTitulo);
  const contraPublicado = v.choques.filter((c) => c.origen === "wordpress" && c.slug !== slug);
  if (contraPublicado.length > 0) {
    return NextResponse.json(
      {
        error: "El título nuevo también se pisa con una página publicada",
        explicacion: explicar({ ...v, choques: contraPublicado }),
        choques: contraPublicado,
      },
      { status: 409 },
    );
  }

  const DIR = path.join(process.cwd(), "content", "blog");
  const rutaVieja = path.join(DIR, post.file);
  const rutaNueva = path.join(DIR, `${nuevoSlug}.md`);

  if (nuevoSlug !== slug && fs.existsSync(rutaNueva)) {
    return NextResponse.json(
      { error: `Ya existe un borrador con el slug '${nuevoSlug}'` },
      { status: 409 },
    );
  }

  const { data, content } = matter(fs.readFileSync(rutaVieja, "utf8"));
  fs.writeFileSync(
    rutaNueva,
    matter.stringify(content.trim() + "\n", { ...data, title: nuevoTitulo, slug: nuevoSlug }),
  );
  if (nuevoSlug !== slug) fs.unlinkSync(rutaVieja);

  await persistChanges(`renombrado: ${slug} -> ${nuevoSlug}`, [rutaNueva]);

  return NextResponse.json({ ok: true, slug: nuevoSlug, title: nuevoTitulo, slugAnterior: slug });
});
