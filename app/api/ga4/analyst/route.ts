import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { analyse } from "@/lib/ga4-analyst";
import { ga4Configured } from "@/lib/ga4";
import { guardarInforme, listarInformes } from "@/lib/reports-store";
import { informeComoCorreo } from "@/lib/informe-email";
import { sendEmail } from "@/lib/email";
import { puedeGastarCupo } from "@/lib/autorizacion";
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
  const permiso = puedeGastarCupo(request);
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.motivo }, { status: 401 });
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

  // El resultado de guardar se DICE, no se traga.
  //
  // El lunes 24 el analista corrió nueve minutos, devolvió el informe entero y
  // el cron imprimió "análisis guardado". No se guardó: el commit falló, nadie
  // se enteró, y al reiniciarse la instancia de Render el disco se borró con el
  // informe dentro. En un servicio sin disco persistente, "está en disco" no es
  // estar guardado, y un fallo de commit es la pérdida del trabajo entero.
  const persistido = await persistChanges(
    `informe del analista: ${guardado.generadoEn.slice(0, 10)}`,
    [path.join(process.cwd(), "data", "reports")],
  );

  // Y se manda por correo, que es la única forma de que alguien lo lea.
  //
  // Durante meses el analista corrió cada lunes, gastó nueve minutos de agente
  // y dejó el informe en una pestaña que había que acordarse de abrir. La tanda
  // de ideas sí avisaba; el análisis —que es la parte que dice QUÉ HACER— no.
  // Un informe que nadie ve no es un informe, es un archivo.
  //
  // Se omite con ?noEmail=1, igual que en la tanda semanal: el botón "Analizar"
  // del panel lo usa quien ya está mirando la pantalla.
  const noEmail = request.nextUrl.searchParams.get("noEmail") === "1";
  const destino = process.env.REPORT_EMAIL_TO;
  let correo: { ok: boolean; error?: string } | undefined;
  if (destino && !noEmail) {
    const { subject, html } = informeComoCorreo(guardado, process.env.APP_BASE_URL);
    correo = await sendEmail({ to: destino, subject, html });
  }

  return NextResponse.json({
    connected: true,
    ...guardado,
    guardado: persistido.ok,
    // El envío también se dice. Resend falla en silencio con una clave caducada
    // —devuelve 401 y ya está—, y así es como se pasaron semanas sin que
    // llegara ningún correo sin que nada lo delatara.
    correo: !destino
      ? "no hay REPORT_EMAIL_TO configurado"
      : noEmail
        ? undefined
        : correo?.ok
          ? `enviado a ${destino}`
          : `NO SE PUDO ENVIAR a ${destino}: ${correo?.error}`,
    // Va en la respuesta para que aparezca en el log del cron: es el único
    // sitio donde alguien lo va a ver antes de echar de menos el informe.
    avisoGuardado: persistido.ok
      ? undefined
      : `El informe se generó pero NO se pudo guardar en el repositorio, así que se perderá al reiniciarse el servicio. Motivo: ${persistido.error}`,
  });
});

// GET /api/ga4/analyst — los informes ya generados, sin gastar agente.
//
// Separado del POST a propósito: mirar lo que ya se analizó no debería costar
// nueve minutos ni consumir cupo.
export const GET = apiRoute(async (request: NextRequest) => {
  const informes = listarInformes(20);

  // El listado va ligero y el informe completo se pide aparte.
  //
  // Cada informe pesa unos 23 KB entre el texto y las recomendaciones. Mandar
  // veinte enteros para pintar un desplegable son cerca de medio mega en cada
  // carga de la página, casi todo para no mostrarse.
  const indice = informes.map((i) => ({
    generadoEn: i.generadoEn,
    days: i.days,
    totals: i.totals,
    recomendaciones: i.recommendations?.length ?? 0,
  }));

  // `?informe=<generadoEn>` devuelve ESE, no solo el último.
  //
  // Antes solo se servía el más reciente completo, y la pantalla avisaba de que
  // los anteriores estaban guardados pero no se podían abrir. Con un solo
  // informe no se notaba; en cuanto hubiera dos, elegir la semana pasada dejaba
  // la pantalla en blanco. El histórico es justo lo que hace útil el análisis:
  // un informe describe un momento, dos describen una dirección.
  const pedido = request.nextUrl.searchParams.get("informe");
  const elegido = pedido ? informes.find((i) => i.generadoEn === pedido) : informes[0];

  return NextResponse.json({
    informes: indice,
    ultimo: elegido ?? null,
    // Se dice cuando se pidió uno que no está, en vez de devolver el último
    // como si fuera el pedido: mirar los datos de otra semana creyendo que son
    // los de esta es peor que no ver nada.
    noEncontrado: pedido && !elegido ? pedido : undefined,
  });
});
