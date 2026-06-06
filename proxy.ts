import { NextRequest, NextResponse } from "next/server";

// Protege todo el dashboard con HTTP Basic Auth.
// Credenciales en env: DASHBOARD_USER / DASHBOARD_PASSWORD.
// Si no están seteadas (ej. en local), no exige login.
export function proxy(request: NextRequest) {
  // El health check de Render y el cron semanal pasan sin Basic Auth.
  // (/api/weekly se protege solo con WEEKLY_SECRET).
  const open = ["/api/health", "/api/weekly"];
  if (open.includes(request.nextUrl.pathname)) return NextResponse.next();

  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  // Sin credenciales configuradas → acceso libre (desarrollo local).
  if (!user || !pass) return NextResponse.next();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/weekly).*)"],
};
