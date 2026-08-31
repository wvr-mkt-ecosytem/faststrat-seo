import { NextRequest, NextResponse } from "next/server";
import { puedeGastarCupo } from "@/lib/autorizacion";
import { apiRoute } from "@/lib/google-auth-state";
import { generarTanda } from "@/lib/semanal";

// Cuánto puede tardar. Sin esto, la plataforma corta la petición a mitad de la
// llamada al agente y no devuelve nada: el navegador se queda esperando una
// respuesta que ya no va a llegar y el botón gira para siempre.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

// POST /api/weekly — la tanda semanal, disparada a mano desde el panel.
//
// El trabajo de verdad vive en lib/semanal.ts. El cron de los lunes ya NO pasa
// por aquí: corre esa misma librería dentro de GitHub Actions, que tiene CPU y
// no se reinicia a mitad. Esta ruta queda para el botón "Refrescar" del panel.
export const POST = apiRoute(async (request: NextRequest) => {
  const permiso = puedeGastarCupo(request);
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.motivo }, { status: 401 });
  }

  try {
    const r = await generarTanda({
      noEmail: new URL(request.url).searchParams.get("noEmail") === "1",
    });
    return NextResponse.json(r);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
