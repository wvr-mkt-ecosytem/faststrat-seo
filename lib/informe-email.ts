import type { InformeGuardado } from "@/lib/reports-store";
import { CLIENTE } from "@/lib/cliente";

// El informe semanal, en un correo.
//
// POR QUÉ EXISTE: el analista guardaba el informe y no avisaba a nadie. Nueve
// minutos de agente cada lunes para algo que solo se veía si a alguien se le
// ocurría abrir la pestaña Reportes. La tanda de ideas sí mandaba correo; el
// análisis, que es la parte que dice QUÉ HACER, no.
//
// El correo es otro medio: no hay hoja de estilos externa, ni variables CSS, ni
// tema oscuro fiable. Todo va en atributos `style` y con una sola paleta que se
// lee sobre fondo claro y sobre fondo oscuro.

const TINTA = "#241A1A";
const SUAVE = "#6E625C";
const LINEA = "#E6DDD7";
const ALTA = "#A3341F";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Negritas y código dentro de un párrafo. El resto del Markdown no hace falta. */
const enLinea = (t: string) =>
  escapar(t)
    .replace(/`([^`]+)`/g, `<code style="font-family:${MONO};font-size:13px;background:#F0E2E0;padding:1px 4px;border-radius:2px;">$1</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:600;">$1</strong>');

/**
 * El subconjunto de Markdown que produce el analista: ##, ###, ---, párrafos.
 *
 * Se convierte a mano en vez de meter una librería porque el correo necesita
 * estilos EN LÍNEA en cada etiqueta: un conversor normal devuelve HTML limpio
 * que en Gmail se ve como texto plano sin formato.
 */
function markdownACorreo(md: string): string {
  const fuera: string[] = [];
  let parrafo: string[] = [];

  const cerrar = () => {
    if (parrafo.length) {
      fuera.push(
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${TINTA};">${enLinea(parrafo.join(" ").trim())}</p>`,
      );
      parrafo = [];
    }
  };

  for (const linea of md.split("\n")) {
    const s = linea.trim();
    if (!s) cerrar();
    else if (s === "---") {
      cerrar();
      fuera.push(`<div style="height:1px;background:${LINEA};margin:26px 0;"></div>`);
    } else if (s.startsWith("### ")) {
      cerrar();
      fuera.push(`<h3 style="margin:24px 0 6px;font-size:15px;font-weight:600;line-height:1.35;color:#7A2222;">${enLinea(s.slice(4))}</h3>`);
    } else if (s.startsWith("## ")) {
      cerrar();
      fuera.push(`<h2 style="margin:30px 0 10px;font-size:20px;font-weight:600;line-height:1.25;color:${TINTA};">${enLinea(s.slice(3))}</h2>`);
    } else parrafo.push(s);
  }
  cerrar();
  return fuera.join("\n");
}

const ETIQUETA: Record<string, string> = {
  consolidate: "Consolidar",
  "rewrite-title": "Reescribir título",
  "technical-fix": "Arreglo técnico",
};

export function informeComoCorreo(informe: InformeGuardado, urlPanel?: string): { subject: string; html: string } {
  const fecha = new Date(informe.generadoEn).toLocaleDateString("es", { day: "numeric", month: "long" });

  const acciones = (informe.recommendations ?? [])
    .map(
      (r, i) => `
    <tr><td style="padding:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINEA};border-left:3px solid ${r.priority === "alta" ? ALTA : "#7E6316"};border-radius:3px;background:#FFFFFF;">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${SUAVE};">
            ${i + 1} &nbsp;·&nbsp; ${ETIQUETA[r.kind] ?? escapar(r.kind)} &nbsp;·&nbsp; prioridad ${escapar(r.priority)}
          </p>
          <p style="margin:0 0 8px;font-family:${MONO};font-size:13px;color:${TINTA};word-break:break-all;">${escapar(r.target)}</p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:${TINTA};">${enLinea(r.reason)}</p>
          <p style="margin:0 0 4px;font-family:${MONO};font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${SUAVE};">Qué hacer</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:${TINTA};">${enLinea(r.suggestion)}</p>
        </td></tr>
      </table>
    </td></tr>`,
    )
    .join("");

  const limites = (informe.limits ?? [])
    .map((l) => `<li style="margin:6px 0;font-size:13px;line-height:1.6;color:${SUAVE};">${enLinea(l)}</li>`)
    .join("");

  const html = `<div style="margin:0;padding:24px 12px;background:#FAF7F4;font-family:${SANS};">
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
  <tr><td>
    <p style="margin:0;font-family:${MONO};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${SUAVE};">
      ${escapar(CLIENTE.dominio)} &nbsp;·&nbsp; ${informe.days} días &nbsp;·&nbsp; ${fecha}
    </p>
    <h1 style="margin:8px 0 16px;font-size:26px;line-height:1.2;font-weight:700;color:${TINTA};">Análisis semanal de SEO</h1>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;background:#FFFFFF;border:1px solid ${LINEA};border-radius:3px;">
      <tr><td style="padding:16px;">
        <p style="margin:0;font-family:${MONO};font-size:13px;color:${TINTA};">
          ${informe.totals.clicks} clics &nbsp;·&nbsp; ${informe.totals.sessions} sesiones &nbsp;·&nbsp; ${informe.totals.conversions} conversiones
        </p>
      </td></tr>
    </table>

    ${markdownACorreo(informe.report ?? "")}

    <h2 style="margin:34px 0 4px;font-size:20px;font-weight:600;color:${TINTA};">Qué hacer, por prioridad</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;">${acciones}</table>

    ${
      limites
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
      <tr><td style="padding:14px 16px;border:1px dashed ${LINEA};border-radius:3px;">
        <p style="margin:0;font-size:15px;font-weight:600;color:${TINTA};">Lo que este análisis no puede decir</p>
        <ul style="margin:8px 0 0;padding-left:18px;">${limites}</ul>
      </td></tr></table>`
        : ""
    }

    ${urlPanel ? `<p style="margin:26px 0 0;font-size:14px;"><a href="${escapar(urlPanel)}/reports" style="color:#7A2222;font-weight:600;">Ver en el panel &rarr;</a></p>` : ""}

    <p style="margin:26px 0 0;padding-top:14px;border-top:1px solid ${LINEA};font-family:${MONO};font-size:11px;line-height:1.7;color:${SUAVE};">
      Generado por el analista · ventana de ${informe.days} días<br />
      Fuentes: Search Console y GA4 de ${escapar(CLIENTE.dominio)}, más búsquedas en vivo de cada SERP citada.
    </p>
  </td></tr>
</table>
</div>`;

  return {
    subject: `${CLIENTE.nombre} · Análisis SEO de ${fecha} · ${(informe.recommendations ?? []).length} acciones`,
    html,
  };
}
