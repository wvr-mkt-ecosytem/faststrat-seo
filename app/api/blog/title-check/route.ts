import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { revisarTitulo, explicar } from "@/lib/catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ¿Este título se pisa con algo que ya existe?
//
// Se consulta ANTES de escribir. No llama al agente ni gasta cupo: compara
// palabras contra el inventario completo (WordPress + borradores + ideas ya
// propuestas) y responde en el tiempo que tarda WordPress en devolver la lista.
//
// Es la pieza más barata del sistema y la que más trabajo evita. Cinco de las
// ocho acciones del informe del 24 de agosto son consolidar páginas propias que
// compiten entre sí; todas se habrían evitado con esta comprobación.

// POST { title }
export const POST = apiRoute(async (request: NextRequest) => {
  const { title } = await request.json().catch(() => ({}));
  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Falta 'title'" }, { status: 400 });
  }

  const v = await revisarTitulo(title.trim());

  return NextResponse.json({
    ok: v.ok,
    // Cuántos títulos se compararon. Si es 0, no se comprobó nada y decirlo
    // importa más que el veredicto: un "ok" sobre un catálogo vacío no es un
    // ok, es una comprobación que no ocurrió.
    comparados: v.comparados,
    aviso: v.aviso ?? undefined,
    explicacion: v.choques.length ? explicar(v) : undefined,
    choques: v.choques.map((c) => ({
      titulo: c.titulo,
      slug: c.slug,
      origen: c.origen,
      parecido: Math.round(c.parecido * 100),
      motivo: c.motivo,
    })),
  });
});
