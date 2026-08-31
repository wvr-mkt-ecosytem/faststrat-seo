import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { apiRoute } from "@/lib/google-auth-state";
import { puedeGastarCupo } from "@/lib/autorizacion";
import { listarInformes } from "@/lib/reports-store";
import { anotar, borrar, leerAplicadas, extraerRedireccion, aplicarRedireccion } from "@/lib/aplicar";
import { persistChanges } from "@/lib/persist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/reports/aplicar — qué recomendaciones ya están resueltas.
export const GET = apiRoute(async () => NextResponse.json({ aplicadas: leerAplicadas() }));

// POST /api/reports/aplicar { informe, indice, accion }
//
// Ejecuta una recomendación del informe, o la marca como resuelta.
//
// La recomendación se lee del informe GUARDADO, no del cuerpo de la petición.
// Si el navegador mandara la URL de destino, cualquiera podría pedir un 301
// hacia donde quisiera: aquí el destino solo puede salir de lo que el analista
// escribió y quedó en disco.
export const POST = apiRoute(async (request: NextRequest) => {
  const permiso = puedeGastarCupo(request);
  if (!permiso.ok) return NextResponse.json({ error: permiso.motivo }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    informe?: string;
    indice?: number;
    accion?: "aplicar" | "hecha-a-mano" | "descartada" | "reabrir";
  };
  const { informe, indice, accion } = body;
  if (!informe || typeof indice !== "number" || !accion) {
    return NextResponse.json({ error: "Faltan 'informe', 'indice' o 'accion'." }, { status: 400 });
  }

  const elegido = listarInformes(50).find((i) => i.generadoEn === informe);
  const rec = elegido?.recommendations?.[indice];
  if (!rec) {
    return NextResponse.json({ error: "Esa recomendación no está en ningún informe guardado." }, { status: 404 });
  }

  if (accion === "reabrir") {
    return NextResponse.json({ ok: true, aplicadas: borrar(informe, indice) });
  }

  if (accion !== "aplicar") {
    // "Hecha a mano" y "descartada" no tocan WordPress: son memoria. Existen
    // porque la mitad de lo que recomienda el analista —revisar un flujo de
    // registro, cerrar un subdominio— no vive en WordPress y ningún botón
    // puede ejecutarlo. Sin esto, esas recomendaciones reaparecen cada semana
    // idénticas y el informe deja de leerse.
    const aplicadas = anotar({ informe, indice, como: accion, cuando: new Date().toISOString() });
    await persistChanges(`recomendación ${accion}: ${rec.target}`, [
      path.join(process.cwd(), "data", "reports", "aplicadas.json"),
    ]);
    return NextResponse.json({ ok: true, aplicadas });
  }

  // Aplicar de verdad. Hoy solo las consolidaciones: son las únicas con una
  // acción mecánica y comprobable detrás.
  if (rec.kind !== "consolidate") {
    return NextResponse.json(
      { error: `Las recomendaciones de tipo "${rec.kind}" no se pueden aplicar automáticamente.` },
      { status: 400 },
    );
  }

  const par = extraerRedireccion(rec);
  if (!par) {
    return NextResponse.json(
      {
        error: "No se pudo leer un único par origen → destino en esta recomendación.",
        comoArreglarlo: "Aplícala a mano en WordPress y márcala como hecha.",
      },
      { status: 400 },
    );
  }

  const r = await aplicarRedireccion(par);
  if (!r.ok) {
    return NextResponse.json({ error: r.detalle, comoArreglarlo: r.comoArreglarlo }, { status: 502 });
  }

  const aplicadas = anotar({
    informe,
    indice,
    como: "aplicada",
    cuando: new Date().toISOString(),
    detalle: r.detalle,
  });
  await persistChanges(`301 aplicado: ${par.desde} -> ${par.hacia}`, [
    path.join(process.cwd(), "data", "reports", "aplicadas.json"),
  ]);
  return NextResponse.json({ ok: true, detalle: r.detalle, aplicadas });
});
