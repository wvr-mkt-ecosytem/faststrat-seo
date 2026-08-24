import { CLIENTE } from "@/lib/cliente";

/**
 * Envío de email vía Resend (tier gratuito: 3k/mes).
 * En local sin RESEND_API_KEY: no-op.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
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
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.message ?? `HTTP ${res.status}` };
  return { ok: true, id: body.id };
}
