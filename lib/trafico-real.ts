import type { Fuente, Dispositivo } from "@/lib/ga4";

// Separar el tráfico humano del que no lo es.
//
// Sin esto, todo lo que mide el sistema está contaminado. Los números medidos:
//
//   1.655 de 1.825 sesiones (91%) llegaban como "(direct) / (none)" con DIEZ
//   segundos de permanencia. De ellas, 1.015 desde Singapur, y 960 de esas con
//   el mismo navegador exacto, "Chrome / Macintosh". Novecientos sesenta Mac
//   idénticos en Singapur entrando a un blog de marketing para PYMEs de LATAM.
//
// Eso es un centro de datos, no una audiencia. Y mientras se cuente como
// tráfico, el CTR del sitio, la tasa de conversión y la permanencia media
// dicen lo contrario de lo que pasa: el sistema informaba "1.784 sesiones y
// cero conversiones" como si fuera un problema de conversión, cuando el
// problema es que no había a quién convertir.
//
// GA4 tiene filtros de datos para esto, pero se configuran desde su panel y el
// token de este sistema es de solo lectura. Así que el filtro vive aquí: no
// cambia lo que GA4 guarda, cambia lo que el sistema cuenta como audiencia.

/**
 * Fuentes que no son personas buscando.
 *
 * `temp-mail.org` y `yopmail.com` son servicios de correo desechable: aparecen
 * cuando alguien registra cuentas de prueba en masa. Los otros son referral
 * spam conocido.
 */
const FUENTE_BASURA = /(temp-mail|yopmail|alphaengine|doubao|semalt|buttons-for|darodar|hulfingtonpost|best-seo)/i;

/** Nuestros propios entornos. Medirlos como tráfico infla los números. */
const HOST_PROPIO = /^(dev|staging|test|preview|localhost)/i;

export interface RepartoTrafico {
  humano: { sesiones: number; segundos: number };
  sospechoso: { sesiones: number; segundos: number };
  /** Por qué se descartó cada bloque, con su número. Sin esto es un filtro opaco. */
  motivos: { motivo: string; sesiones: number }[];
  /** Qué proporción del total se descartó. Si es alta, es EL hallazgo. */
  porcentajeSospechoso: number;
}

/**
 * Reparte las fuentes entre humano y sospechoso.
 *
 * El criterio del tráfico directo merece explicación, porque es el que más
 * volumen mueve y el que más fácil se malinterpreta: alguien que teclea tu URL
 * te conoce y se queda. Diez segundos de media sobre mil quinientas sesiones no
 * es gente distraída, es automatización. Por eso el umbral mira las dos cosas a
 * la vez, volumen y permanencia: un directo pequeño con permanencia baja puede
 * ser ruido normal y no se toca.
 */
export function repartirTrafico(fuentes: Fuente[]): RepartoTrafico {
  const motivos = new Map<string, number>();
  const suma = (m: string, n: number) => motivos.set(m, (motivos.get(m) ?? 0) + n);

  let humanoSes = 0;
  let humanoSeg = 0;
  let malaSes = 0;
  let malaSeg = 0;

  const total = fuentes.reduce((a, f) => a + f.sessions, 0);

  for (const f of fuentes) {
    const sospechoso =
      FUENTE_BASURA.test(f.fuente) ||
      HOST_PROPIO.test(f.fuente) ||
      // Directo masivo con permanencia mínima: la firma del tráfico de bots.
      (/^\(?direct\)?$/i.test(f.fuente) && f.sessions > 100 && f.avgEngagement < 15);

    if (sospechoso) {
      malaSes += f.sessions;
      malaSeg += f.avgEngagement * f.sessions;
      if (FUENTE_BASURA.test(f.fuente)) suma("correo desechable o referral spam", f.sessions);
      else if (HOST_PROPIO.test(f.fuente)) suma("nuestros propios entornos", f.sessions);
      else suma(`directo masivo con ${f.avgEngagement}s de permanencia`, f.sessions);
    } else {
      humanoSes += f.sessions;
      humanoSeg += f.avgEngagement * f.sessions;
    }
  }

  return {
    humano: { sesiones: humanoSes, segundos: humanoSes ? Math.round(humanoSeg / humanoSes) : 0 },
    sospechoso: { sesiones: malaSes, segundos: malaSes ? Math.round(malaSeg / malaSes) : 0 },
    motivos: [...motivos.entries()].map(([motivo, sesiones]) => ({ motivo, sesiones })).sort((a, b) => b.sesiones - a.sesiones),
    porcentajeSospechoso: total ? Math.round((malaSes / total) * 1000) / 10 : 0,
  };
}

/**
 * Un aviso cuando el escritorio y el móvil no se parecen en nada.
 *
 * El tráfico automatizado es casi todo de escritorio. Si el móvil tiene mucha
 * menos sesión pero MÁS permanencia, es otra confirmación independiente de que
 * el volumen del escritorio no es humano. Medido aquí: escritorio 11s contra
 * móvil 19s, con 1.749 sesiones contra 67.
 */
export function avisoDispositivo(d: Dispositivo[]): string | null {
  const esc = d.find((x) => /desktop/i.test(x.dispositivo));
  const mov = d.find((x) => /mobile/i.test(x.dispositivo));
  if (!esc || !mov || !esc.sessions || !mov.sessions) return null;
  if (esc.sessions > mov.sessions * 5 && mov.avgEngagement > esc.avgEngagement * 1.4) {
    return `El escritorio tiene ${esc.sessions} sesiones con ${esc.avgEngagement}s y el móvil ${mov.sessions} con ${mov.avgEngagement}s. Que el móvil retenga más con veinte veces menos volumen apunta a que el volumen del escritorio no es humano.`;
  }
  return null;
}
