import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { porRevisar, VIDA_POR_DEFECTO } from "@/lib/caducidad";

export const dynamic = "force-dynamic";

// GET /api/caducidad — los artículos que hay que volver a mirar.
//
// La regla existía y no la veía nadie: lib/caducidad.ts calculaba la fecha y no
// había ninguna pantalla ni ruta que la consultara. Una comprobación que nadie
// consulta no es una comprobación, es un archivo.
export const GET = apiRoute(async () => {
  const lista = porRevisar();
  return NextResponse.json({
    vidaPorDefectoDias: VIDA_POR_DEFECTO,
    caducados: lista.filter((c) => c.estado === "caducado").length,
    porCaducar: lista.filter((c) => c.estado === "por-caducar").length,
    articulos: lista,
  });
});
