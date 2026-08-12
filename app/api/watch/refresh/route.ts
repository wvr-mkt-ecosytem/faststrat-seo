import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { persistChanges } from "@/lib/persist";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// El rastreo lee 19 sitemaps y sus hijos: unos minutos, no unos segundos.
export const maxDuration = 800;

// Dispara la vigilancia a demanda.
//
// Hasta ahora la instantánea solo existía si alguien corría el script a mano
// desde una terminal. Eso hacía que la pantalla enseñara lo que hubiera del
// último día que alguien se acordó, sin decir de cuándo era, y que la
// comparación con la semana anterior no llegara nunca.
//
// Se ejecuta el script en vez de reimplementar el rastreo aquí. Duplicarlo
// habría creado dos versiones del filtro editorial, y ese filtro ya ha fallado
// tres veces por sitios que publican bajo rutas inesperadas: mantener dos
// copias garantiza que una se quede atrás.

export const POST = apiRoute(async (request: Request) => {
  // Esta ruta está fuera del proxy de autenticación, porque la llama el cron
  // de GitHub Actions y ese no tiene el login del dashboard. Así que se
  // protege aquí: o el secreto del cron, o el login del navegador. Sin esto,
  // estar fuera del proxy dejaría un botón público que rastrea 27.000 URLs.
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
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }

  const script = path.join(process.cwd(), "scripts", "watch-competitors.mjs");

  const salida = await new Promise<{ code: number; out: string; err: string }>((res) => {
    const p = spawn(process.execPath, [script], { cwd: process.cwd() });
    let out = "";
    let err = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (err += c));
    p.on("close", (code) => res({ code: code ?? 1, out, err }));
    p.on("error", (e) => res({ code: 1, out, err: String(e) }));
  });

  if (salida.code !== 0) {
    return NextResponse.json(
      {
        ok: false,
        // El motivo, no solo el fallo: sin las últimas líneas hay que entrar
        // al servidor para saber qué pasó.
        error: "El rastreo terminó con error.",
        detalle: (salida.err || salida.out).slice(-600),
      },
      { status: 500 },
    );
  }

  // La instantánea del día. Se saca de la salida y no de la fecha del servidor
  // porque el servidor calcula en UTC: pasadas las 7 de la tarde en Bogotá
  // pediríamos un archivo con la fecha de mañana, que no existe.
  const m = salida.out.match(/data\/competitor-watch\/(\d{4}-\d{2}-\d{2})\.json/);
  const fecha = m?.[1] ?? null;

  if (fecha) {
    await persistChanges(`vigilancia: instantánea ${fecha}`, [
      path.join(process.cwd(), "data", "competitor-watch", `${fecha}.json`),
      path.join(process.cwd(), "data", "competitor-watch.md"),
    ]);
  }

  const fuentes = (salida.out.match(/URLs editoriales/g) || []).length;

  return NextResponse.json({ ok: true, date: fecha, sources: fuentes });
});
