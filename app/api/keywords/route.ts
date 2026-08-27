import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { candidatas, porIntencion } from "@/lib/sugerencias";
import { tendencia } from "@/lib/trends";
import { estado } from "@/lib/trends-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sugerencias de keywords para un tema, con su dirección de demanda.
//
// Dos fuentes con papeles distintos, y conviene no confundirlos:
//
//   Autocomplete dice qué ESCRIBE la gente. Sin autenticación, una petición por
//   consulta, no ha fallado ni una vez. De ahí salen los candidatos.
//
//   Trends dice hacia dónde VA cada uno. Endpoint no oficial que devuelve 429
//   cuando se le pide mucho, así que va cacheado y solo se consulta para los
//   pocos finalistas.
//
// Es GET a propósito: solo consulta, no escribe nada ni gasta agente, así que
// entra en lo que cualquiera puede mirar sin identificarse.

export const GET = apiRoute(async (request: NextRequest) => {
  const termino = request.nextUrl.searchParams.get("q")?.trim();
  if (!termino) return NextResponse.json({ error: "Falta 'q'" }, { status: 400 });

  const idioma = request.nextUrl.searchParams.get("lang") === "es" ? "es" : "en";
  const geo = request.nextUrl.searchParams.get("geo") ?? "";

  const c = await candidatas(termino, { idioma, letras: 4 });
  const todas = [...c.directas, ...c.ampliadas];
  const { conIntencion, resto } = porIntencion(todas, termino);

  // La dirección solo se pide para los finalistas.
  //
  // Consultarla para las cuarenta candidatas serían ochenta peticiones a
  // Trends: exactamente la ráfaga que activa el límite y deja al sistema sin
  // dato para todo lo demás durante horas.
  const finalistas: { keyword: string; intencion: boolean; trend: Awaited<ReturnType<typeof tendencia>> }[] = [];
  for (const q of [...conIntencion.slice(0, 5), ...resto.slice(0, 3)]) {
    finalistas.push({ keyword: q, intencion: conIntencion.includes(q), trend: await tendencia(q, geo) });
  }

  return NextResponse.json({
    termino,
    totalCandidatas: todas.length,
    conIntencion,
    resto,
    finalistas,
    cache: estado(),
  });
});
