import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { analyse } from "@/lib/ga4-analyst";
import { ga4Configured } from "@/lib/ga4";
import { guardarInforme, listarInformes } from "@/lib/reports-store";
import { persistChanges } from "@/lib/persist";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// El agente tarda: es una llamada al modelo sobre unas 50 páginas.
export const maxDuration = 800;

// POST /api/ga4/analyst { days }
//
// Va por POST y no por GET a propósito: cuesta tokens de la suscripción, y un
// GET lo dispara cualquier precarga del navegador o del router sin que nadie lo
// haya pedido.

export const POST = apiRoute(async (request: NextRequest) => {
  // O el secreto del cron, o el login del dashboard.
  //
  // Sin esto el trabajo del lunes recibiría un 401 del proxy y el análisis
  // semanal no se generaría nunca, igual que le pasó a la tanda de ideas
  // durante dos meses sin que nada lo dijera.
  const secret = process.env.WEEKLY_SECRET;
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  const conSecreto = !!secret && request.headers.get("x-weekly-secret") === secret;
  let conLogin = false;
  const authz = request.headers.get("authorization");
  if (user && pass && authz?.startsWith("Basic ")) {
    const [u, p] = Buffer.from(authz.slice(6), "base64").toString().split(":");
    conLogin = u === user && p === pass;
  }
  if ((secret || (user && pass)) && !conSecreto && !conLogin) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  if (!ga4Configured()) {
    return NextResponse.json({
      connected: false,
      reason: "Falta GOOGLE_MEASUREMENT_REFRESH_TOKEN.",
      action: "Corre `node scripts/get-measurement-token.mjs`.",
    });
  }

  const body = await request.json().catch(() => ({}));
  const days = Number(body.days) || 28;

  const result = await analyse(days);

  // Se guarda con su fecha. Nueve minutos de agente no pueden perderse al
  // recargar la página, y sin histórico no se puede responder "¿esto mejoró?":
  // un informe describe un momento, dos describen una dirección.
  const guardado = guardarInforme(result);
  await persistChanges(`informe del analista: ${guardado.generadoEn.slice(0, 10)}`, [
    path.join(process.cwd(), "data", "reports"),
  ]).catch(() => {
    // Que no se pueda commitear no invalida el informe: ya está en disco y en
    // la respuesta. Perderlo por eso sería el peor intercambio posible.
  });

  return NextResponse.json({ connected: true, ...guardado });
});

// GET /api/ga4/analyst — los informes ya generados, sin gastar agente.
//
// Separado del POST a propósito: mirar lo que ya se analizó no debería costar
// nueve minutos ni consumir cupo.
export const GET = apiRoute(async () => {
  const informes = listarInformes(20);
  return NextResponse.json({
    informes: informes.map((i) => ({
      generadoEn: i.generadoEn,
      days: i.days,
      totals: i.totals,
      recomendaciones: i.recommendations?.length ?? 0,
    })),
    ultimo: informes[0] ?? null,
  });
});
