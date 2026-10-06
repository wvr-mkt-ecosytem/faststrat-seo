import { CLIENTE } from "@/lib/cliente";

/**
 * Envío de email vía Resend (tier gratuito: 3k/mes).
 * En local sin RESEND_API_KEY: no-op.
 */
/**
 * Degrada un HTML a texto legible, para cuando quien llama no trae uno escrito.
 *
 * Exportada para poder comprobarla: corre en CADA envío, y si rompiera el texto
 * empeoraría justo lo que vino a arreglar.
 */
export function soloTexto(html: string): string {
  return html
    .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|tr|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /**
   * La misma cosa en texto plano. NO es opcional por gusto.
   *
   * Un correo solo-HTML es una de las señales de spam más viejas que hay:
   * ningún cliente de correo humano manda HTML a secas. El informe semanal
   * estuvo cayendo en spam mientras el de ideas, con un HTML cuatro veces más
   * corto, entraba a la bandeja. Resend daba los dos por entregados, y lo
   * estaban: entregado a la carpeta de spam también cuenta como entregado, y
   * por eso el registro de envíos no delataba nada.
   */
  text?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY no configurado" };

  // Tier gratis sin dominio verificado: solo se puede enviar AL dueño de la
  // cuenta de Resend. Si el destinatario del aviso semanal es otro, hay que
  // verificar el dominio en Resend o el envío falla en silencio.
  const from = process.env.RESEND_FROM ?? `${CLIENTE.nombre} Bot <onboarding@resend.dev>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      // Si no viene texto se degrada el HTML a texto. Peor que uno escrito a
      // mano, mejor que ninguno.
      text: opts.text ?? soloTexto(opts.html),
      // Para que una respuesta llegue a alguna parte, y porque un correo sin
      // Reply-To posible puntúa como envío automático de lista.
      reply_to: process.env.REPORT_EMAIL_TO ?? opts.to,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: body.id };
}
