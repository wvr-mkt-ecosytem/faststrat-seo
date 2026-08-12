import { NextRequest, NextResponse } from "next/server";

// Protege todo el dashboard con HTTP Basic Auth.
// Credenciales en env: DASHBOARD_USER / DASHBOARD_PASSWORD.
// Si no están seteadas (ej. en local), no exige login.
export function proxy(request: NextRequest) {
  // El health check de Render y el cron semanal pasan sin Basic Auth.
  // (/api/weekly y /api/watch/refresh se protegen solos con WEEKLY_SECRET;
  // los llama el cron de GitHub Actions, que no tiene el login del dashboard).
  //
  // Exceptuar aquí NO es dejarlas abiertas: cada una comprueba el secreto o el
  // login por su cuenta. Exceptuar sin esa comprobación dentro sería publicar
  // un botón de "rastrea 27.000 URLs" para cualquiera que sepa la ruta.
  const open = ["/api/health", "/api/weekly", "/api/watch/refresh"];
  if (open.includes(request.nextUrl.pathname)) return NextResponse.next();

  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  // Sin credenciales configuradas: libre en local, CERRADO en producción.
  //
  // El valor por defecto importa más que el caso normal. Si estas variables
  // faltan en Render, la versión anterior servía el panel entero sin login y
  // sin avisar, incluidas las rutas que publican en el sitio en vivo. Un fallo
  // de configuración no puede convertirse en acceso público.
  if (!user || !pass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Falta configurar DASHBOARD_USER y DASHBOARD_PASSWORD. El panel no se sirve sin ellas.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
      if (u === user && p === pass) return NextResponse.next();
    }
  }

  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="FastStrat SEO"' },
  });
}

export const config = {
  // Aplica a todo menos assets estáticos de Next y el health check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/weekly|api/watch/refresh).*)"],
};
