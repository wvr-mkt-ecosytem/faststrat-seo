import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { auditContainers, gtmConfigured } from "@/lib/gtm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Audita cómo está montada la medición, leyendo Tag Manager.
//
// No devuelve métricas: GTM no las tiene. Devuelve si lo que produce esas
// métricas está bien puesto, que es la pregunta que va antes.

export const GET = apiRoute(async () => {
  if (!gtmConfigured()) {
    return NextResponse.json({
      connected: false,
      // Decir qué falta y cómo se arregla, no solo que falta.
      reason:
        "Falta GOOGLE_MEASUREMENT_REFRESH_TOKEN. El token de Search Console no sirve: un refresh token lleva grabados sus scopes y no se pueden ampliar después.",
      action: "Corre `node scripts/get-measurement-token.mjs` y copia el token también a Render.",
    });
  }

  const containers = await auditContainers();

  if (!containers.length) {
    return NextResponse.json({
      connected: true,
      containers: [],
      reason:
        "La cuenta autorizada no ve ningún contenedor de Tag Manager. Suele ser que se autorizó con una cuenta de Google distinta a la que tiene acceso al contenedor.",
    });
  }

  const blocking = containers.flatMap((c) =>
    c.findings.filter((f) => f.severity === "block").map((f) => ({ container: c.container, ...f })),
  );

  return NextResponse.json({
    connected: true,
    containers,
    blocking,
    // El resumen que importa: si esto es falso, cualquier dato de GA4 que se
    // mire después está construido sobre una medición rota.
    measuring: blocking.length === 0,
  });
});
