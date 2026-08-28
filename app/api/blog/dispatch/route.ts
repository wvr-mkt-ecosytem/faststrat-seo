import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { revisarTitulo, explicar } from "@/lib/catalogo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Lanza la escritura en GitHub Actions y devuelve enseguida.
//
// POR QUÉ NO ESCRIBE AQUÍ. En el plan gratuito de Render, escribir mata la
// instancia: el agente se come la CPU, el health check deja de responder en 5
// segundos, Render da el servicio por caído y lo reinicia. Medido: 502 a los
// 3,2 minutos y la alerta "health check timed out after 5 seconds". Actions
// tiene CPU de verdad y seis horas.
//
// Esta ruta tarda un segundo: solo pide el trabajo. El artículo llega después
// como un commit y aparece solo en la pestaña Blogs.

const WORKFLOW = "escribir.yml";

// POST { keyword?, topic?, title?, lang?, category?, publishAt?, force?, publicar?, enVivo? }
export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  if (!body.keyword && !body.topic) {
    return NextResponse.json({ error: "Falta 'keyword' o 'topic'" }, { status: 400 });
  }

  const token = process.env.GIT_PERSIST_TOKEN;
  const repo = process.env.GIT_PERSIST_REPO;
  if (!token || !repo) {
    return NextResponse.json(
      {
        error: "Falta GIT_PERSIST_TOKEN o GIT_PERSIST_REPO",
        comoSeguir: "Sin ellas no se puede pedir el trabajo a GitHub. Están en el panel de Render.",
      },
      { status: 503 },
    );
  }

  // El choque se comprueba ANTES de pedir el trabajo.
  //
  // Cuesta un segundo aquí y ahorra 24 minutos de agente allí. Y sobre todo:
  // el error se ve en la pantalla, en el momento, en vez de enterrado en el
  // registro de un trabajo que nadie va a abrir.
  const sonda = (body.title ?? body.keyword ?? body.topic ?? "").trim();
  if (sonda && body.force !== true) {
    const v = await revisarTitulo(sonda);
    if (!v.ok) {
      return NextResponse.json(
        {
          error: "Ya existe algo que cubre esto",
          explicacion: explicar(v),
          choques: v.choques,
          comoSeguir: "Cambia el ángulo, o reenvía con force: true si son intenciones distintas.",
        },
        { status: 409 },
      );
    }
  }

  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "seo-dashboard",
    },
    body: JSON.stringify({
      ref: process.env.GIT_PERSIST_BRANCH ?? "main",
      inputs: {
        keyword: body.keyword ?? "",
        topic: body.topic ?? "",
        title: body.title ?? "",
        lang: body.lang ?? "en",
        category: body.category ?? "SEO",
        publishAt: body.publishAt ?? "",
        force: body.force === true ? "true" : "false",
        // Publicar es el caso normal: escribir para dejarlo guardado y no
        // publicarlo es la excepción, no al revés.
        publicar: body.publicar === false ? "false" : "true",
        enVivo: body.enVivo === false ? "false" : "true",
      },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 300);
    return NextResponse.json(
      {
        error: `GitHub no aceptó el trabajo (${r.status})`,
        detalle,
        comoSeguir:
          r.status === 403 || r.status === 401
            ? "El token no tiene permiso sobre Actions. Necesita el scope 'workflow'."
            : "Comprueba que .github/workflows/escribir.yml está en la rama principal.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    lanzado: true,
    // Sin esto no habría forma de ir a mirar cómo va.
    seguimiento: `https://github.com/${repo}/actions/workflows/${WORKFLOW}`,
    mensaje:
      "El artículo se está escribiendo en GitHub Actions. Tarda unos 25 minutos y aparecerá solo " +
      "en esta pestaña; puedes cerrar el navegador.",
  });
});
