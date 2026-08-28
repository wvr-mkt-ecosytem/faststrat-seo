import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { todas } from "@/lib/duraciones";

export const dynamic = "force-dynamic";

// Cuánto tarda cada cosa, según las corridas que de verdad terminaron.
//
// La pantalla lo pide al cargar para que las barras de progreso digan un tiempo
// medido y no uno inventado. Es GET y no gasta nada, así que lo puede ver
// cualquiera.
export const GET = apiRoute(async () => NextResponse.json({ estimaciones: todas() }));
