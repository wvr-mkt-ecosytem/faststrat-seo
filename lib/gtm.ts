import { google } from "googleapis";

// Lee la configuración del contenedor de Google Tag Manager.
//
// Lo primero que conviene entender: GTM NO tiene datos de rendimiento. No sabe
// cuántas visitas hubo ni de dónde vinieron. GTM despliega etiquetas; los
// números viven en GA4. Pedirle métricas a esta API es pedirle algo que no
// tiene.
//
// Lo que sí responde, y no responde nada más en todo el sistema:
//
//   ¿la medición está bien puesta?
//
// Es la pregunta que va ANTES de mirar cualquier dato. Si la etiqueta de GA4
// no está, o mide contra otra propiedad, o las conversiones no existen, los
// números de mañana serán limpios, convincentes y falsos. Un panel de analítica
// sobre una medición rota es peor que no tener panel: da confianza sin base.

const measurementAuth = () => {
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  o.setCredentials({ refresh_token: process.env.GOOGLE_MEASUREMENT_REFRESH_TOKEN });
  return o;
};

export const gtmConfigured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_MEASUREMENT_REFRESH_TOKEN,
  );

const tagmanager = () => google.tagmanager({ version: "v2", auth: measurementAuth() });

export interface TagSummary {
  name: string;
  type: string;
  /** Para etiquetas GA4: contra qué propiedad mide. */
  measurementId?: string;
  paused: boolean;
  firingTriggers: number;
}

export interface ContainerAudit {
  account: string;
  container: string;
  publicId: string;
  workspace: string;
  tags: TagSummary[];
  /** Los IDs de medición distintos encontrados. Más de uno es una señal. */
  measurementIds: string[];
  findings: { severity: "block" | "warn" | "ok"; detail: string }[];
}

/** El valor de un parámetro de la etiqueta, buscando por clave. */
function param(tag: { parameter?: { key?: string | null; value?: string | null }[] }, key: string) {
  return tag.parameter?.find((p) => p.key === key)?.value ?? undefined;
}

/**
 * Audita todos los contenedores accesibles.
 *
 * Se recorre el workspace por defecto y no la versión publicada, porque lo que
 * está en el workspace es lo que alguien está tocando ahora. Una etiqueta bien
 * configurada pero SIN PUBLICAR no mide nada, y esa diferencia es justo la que
 * hace que "ya lo configuré" y "está midiendo" no sean lo mismo.
 */
export async function auditContainers(): Promise<ContainerAudit[]> {
  const t = tagmanager();
  const accounts = (await t.accounts.list()).data.account ?? [];
  const out: ContainerAudit[] = [];

  for (const acc of accounts) {
    if (!acc.path) continue;
    const containers = (await t.accounts.containers.list({ parent: acc.path })).data.container ?? [];

    for (const c of containers) {
      if (!c.path) continue;
      const workspaces = (await t.accounts.containers.workspaces.list({ parent: c.path })).data.workspace ?? [];
      const ws = workspaces[0];
      if (!ws?.path) continue;

      const tags = (await t.accounts.containers.workspaces.tags.list({ parent: ws.path })).data.tag ?? [];

      const summaries: TagSummary[] = tags.map((tag) => ({
        name: tag.name ?? "(sin nombre)",
        type: tag.type ?? "?",
        measurementId:
          param(tag, "measurementId") ??
          param(tag, "measurementIdOverride") ??
          param(tag, "trackingId") ??
          undefined,
        paused: Boolean(tag.paused),
        firingTriggers: (tag.firingTriggerId ?? []).length,
      }));

      const ga4 = summaries.filter((s) => /gaawc|googtag|gaawe/i.test(s.type));
      const ids = [...new Set(summaries.map((s) => s.measurementId).filter(Boolean) as string[])];

      const findings: ContainerAudit["findings"] = [];

      if (!ga4.length) {
        findings.push({
          severity: "block",
          detail:
            "No hay ninguna etiqueta de GA4 en este contenedor. Sin ella no se está midiendo nada, y los informes de GA4 estarán vacíos o incompletos.",
        });
      } else {
        const activas = ga4.filter((g) => !g.paused);
        if (!activas.length) {
          findings.push({
            severity: "block",
            detail: `Hay ${ga4.length} etiqueta(s) de GA4 pero TODAS están pausadas. Configurada no es lo mismo que midiendo.`,
          });
        }
        const sinTrigger = activas.filter((g) => g.firingTriggers === 0);
        if (sinTrigger.length) {
          findings.push({
            severity: "block",
            detail: `${sinTrigger.length} etiqueta(s) de GA4 sin activador: nunca se disparan (${sinTrigger.map((s) => s.name).join(", ")}).`,
          });
        }
      }

      if (ids.length > 1) {
        findings.push({
          severity: "warn",
          detail: `Se miden ${ids.length} IDs distintos (${ids.join(", ")}). Puede ser deliberado, pero también es como se parte el tráfico en dos propiedades sin querer.`,
        });
      }

      const pausadas = summaries.filter((s) => s.paused);
      if (pausadas.length) {
        findings.push({
          severity: "warn",
          detail: `${pausadas.length} etiqueta(s) pausada(s). Aparecen en el contenedor y no hacen nada.`,
        });
      }

      if (!findings.length) {
        findings.push({ severity: "ok", detail: "Sin hallazgos: la medición se ve bien montada." });
      }

      out.push({
        account: acc.name ?? "(cuenta)",
        container: c.name ?? "(contenedor)",
        publicId: c.publicId ?? "",
        workspace: ws.name ?? "",
        tags: summaries,
        measurementIds: ids,
        findings,
      });
    }
  }

  return out;
}
