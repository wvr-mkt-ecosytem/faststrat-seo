import { apiRoute } from "@/lib/google-auth-state";
import { NextRequest, NextResponse } from "next/server";
import { escribirArticulo } from "@/lib/escribir";

// Escribir un artículo, desde la web.
//
// La lógica no está aquí: vive en lib/escribir.ts porque el mismo trabajo lo
// hace también GitHub Actions, donde SÍ hay CPU para aguantar 24 minutos. En el
// plan gratuito de Render esta ruta se muere a medias (el health check deja de
// responder y Render reinicia la instancia), así que sirve para desarrollo y
// para artículos cortos, no para la producción de verdad.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const r = await escribirArticulo(body);
  if (r.ok) return NextResponse.json(r);
  const { estado, ...resto } = r;
  return NextResponse.json(resto, { status: estado });
});
