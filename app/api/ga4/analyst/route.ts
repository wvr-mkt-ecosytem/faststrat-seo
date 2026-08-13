import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { analyse } from "@/lib/ga4-analyst";
import { ga4Configured } from "@/lib/ga4";

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
  return NextResponse.json({ connected: true, ...result });
});
