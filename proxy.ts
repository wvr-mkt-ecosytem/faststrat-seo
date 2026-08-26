import { NextRequest, NextResponse } from "next/server";

// Quién puede entrar al panel.
//
// MIRAR es público. ACTUAR seguía pidiendo login, y esa línea no es arbitraria:
// las acciones de este panel no son consultas, son efectos sobre el mundo.
// Publican artículos en el sitio en vivo, cambian títulos de páginas que ya
// rankean, lanzan corridas de agente de veinticuatro minutos que gastan el cupo
// de Claude de una persona concreta y crean redirecciones 301.
//
// Abrir del todo significaba que cualquiera que supiera la ruta podía publicar
// en faststrat.ai o agotar el cupo desde una pestaña. Los datos, en cambio, no
// tienen ese problema: son métricas del propio sitio y análisis de contenido
// que igualmente se enseñan a quien haga falta.
//
// Cambiar esto es un interruptor: ACCIONES_PUBLICAS=true lo abre entero.

const PUBLICO_SIEMPRE = ["/api/health", "/api/weekly", "/api/ga4/analyst"];

/**
 * ¿Esta petición solo lee?
 *
 * Se mira el MÉTODO, no la ruta. Una lista de rutas hay que mantenerla, y el
 * día que alguien añada una ruta nueva que escribe se olvidará de apuntarla:
 * el método lo dice el propio protocolo y no se puede olvidar. Todo lo que
 * escribe en este sistema es POST.
 */
const soloLee = (request: NextRequest) =>
  request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS";

export function proxy(request: NextRequest) {
  // El cron y el analista traen su propio secreto y lo comprueban por dentro.
  if (PUBLICO_SIEMPRE.includes(request.nextUrl.pathname)) return NextResponse.next();

  // Todo lo que solo lee: abierto. Es lo que hace que "cualquiera pueda entrar"
  // y ver el panel entero sin pedir nada.
  if (soloLee(request)) return NextResponse.next();

  // A partir de aquí, solo acciones.
  if (process.env.ACCIONES_PUBLICAS === "true") return NextResponse.next();

  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  // Sin credenciales configuradas: libre en local, CERRADO en producción.
  //
  // El valor por defecto importa más que el caso normal. Si estas variables
  // faltan en Render, una versión anterior servía el panel entero sin login y
  // sin avisar, incluidas las rutas que publican en el sitio en vivo. Un fallo
  // de configuración no puede convertirse en permiso de escritura.
  if (!user || !pass) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Falta configurar DASHBOARD_USER y DASHBOARD_PASSWORD. Las acciones no se sirven sin ellas.",
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

  return new NextResponse(
    "Esta acción publica contenido o gasta cupo del agente, así que pide identificarse. Mirar el panel no.",
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="SEO Dashboard"' },
    },
  );
}

export const config = {
  // Aplica a todo menos assets estáticos de Next y las rutas con secreto propio.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|api/weekly|api/ga4/analyst).*)"],
};
