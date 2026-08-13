import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { leerMemoria } from "@/lib/idea-memory";
import { getIdeaBatches } from "@/lib/ideas";
import { getBlogPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// La memoria de ideas, para poder mirarla.
//
// Existía solo dentro del prompt: el sistema sabía qué se había propuesto ya,
// y quien lo usaba no. Eso hace imposible contestar la única pregunta que
// importa cuando salen ideas repetidas: ¿el agente las repitió, o es que el
// tema de verdad no está cubierto? Sin verlo, "salen las mismas" es una
// sensación; con la lista delante, es un dato.

export const GET = apiRoute(async () => {
  const m = leerMemoria();
  const batches = getIdeaBatches();
  const posts = getBlogPosts();

  // Escrito o solo propuesto: es la distinción que decide qué hacer. Una idea
  // propuesta cinco veces y nunca escrita no es un problema de repetición, es
  // una idea que nadie quiso.
  const escritos = new Set(posts.map((p) => p.title.toLowerCase().trim()));

  const propuestas = batches
    .flatMap((b) => (b.ideas ?? []).map((i) => ({ ...i, weekOf: b.weekOf, source: b.source })))
    .map((i) => ({
      title: i.title,
      slug: i.slug,
      keyword: i.primaryKeyword,
      weekOf: i.weekOf,
      source: i.source,
      escrita: escritos.has(i.title.toLowerCase().trim()),
    }));

  // Las que se propusieron más de una vez, que es lo que hay que vigilar.
  const cuenta = new Map<string, number>();
  for (const p of propuestas) {
    const k = p.title.toLowerCase().trim();
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  return NextResponse.json({
    totales: {
      propuestas: propuestas.length,
      titulosUnicos: m.titulos.length,
      escritos: m.escritos.length,
      keywords: m.keywords.length,
      tandas: batches.length,
    },
    // Más recientes primero: son las que más importa no repetir.
    propuestas: propuestas.reverse(),
    repetidas: [...cuenta.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([titulo, veces]) => ({ titulo, veces })),
  });
});
