import { getBlogPosts } from "@/lib/blog";

// Cuándo deja de ser cierto un artículo.
//
// POR QUÉ EXISTE: el artículo de WhatsApp vs SMS construye sus tablas sobre la
// tarifa de Meta vigente, y Meta cambia el modelo de precios el 1 de octubre.
// El día después, el artículo dice cifras falsas con toda la confianza del
// mundo y nada en el sistema lo sabe. Multiplícalo por cincuenta artículos y el
// blog se convierte en un archivo de datos caducados con fecha de este año.
//
// Un recordatorio en la cabeza de alguien no es un mecanismo. Una fecha en el
// artículo sí, porque se puede consultar.
//
// La caducidad NO despublica nada: avisa. Decidir si un artículo sigue siendo
// cierto es un juicio, y automatizarlo sería peor que no tenerlo.

/** Cuánto se supone que aguanta un artículo sin revisarse, en días. */
export const VIDA_POR_DEFECTO = 180;

/** Días de margen para avisar ANTES de que caduque. */
const AVISO_ANTES = 21;

export type Caducidad = {
  slug: string;
  title: string;
  /** ISO, el día en que hay que revisarlo. */
  caduca: string;
  /** Negativo si ya pasó. */
  diasRestantes: number;
  estado: "caducado" | "por-caducar" | "vigente";
  /** Por qué caduca ese día, si el artículo lo dijo. */
  motivo?: string;
};

const DIA = 86_400_000;

/**
 * Cuándo hay que revisar un artículo.
 *
 * Si el artículo declaró su propia fecha —porque cita algo que cambia en una
 * fecha conocida— manda esa. Si no, se cuenta desde su publicación: no es
 * exacto, y no pretende serlo. Sirve para que ningún artículo se quede diez
 * meses sin que nadie lo mire.
 */
export function caducidadDe(post: {
  slug: string;
  title: string;
  date?: string;
  publishAt?: string;
  caduca?: string;
  motivoCaducidad?: string;
}): Caducidad {
  /** Una fecha, o null si no se puede leer. */
  const leer = (v?: string): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // La fecha de nacimiento TAMBIÉN puede estar mal escrita.
  //
  // `caduca` sí se protegía; `date` y `publishAt` no, y salen del frontmatter
  // de un fichero que edita una persona. Un `date: 2026-13-01` producía un
  // Invalid Date, y `toISOString()` sobre eso lanza RangeError: como porRevisar
  // recorre TODOS los artículos, un solo frontmatter mal escrito tumbaba
  // /api/caducidad entera. No es que faltara ese artículo: no salía ninguno.
  const declarada = leer(post.caduca);
  const nacimiento = leer(post.publishAt) ?? leer(post.date) ?? new Date();
  const cuando = declarada ?? new Date(nacimiento.getTime() + VIDA_POR_DEFECTO * DIA);

  const dias = Math.round((cuando.getTime() - Date.now()) / DIA);
  return {
    slug: post.slug,
    title: post.title,
    caduca: cuando.toISOString().slice(0, 10),
    diasRestantes: dias,
    estado: dias < 0 ? "caducado" : dias <= AVISO_ANTES ? "por-caducar" : "vigente",
    motivo: post.motivoCaducidad,
  };
}

/** Los artículos que hay que revisar, primero los más vencidos. */
export function porRevisar(): Caducidad[] {
  return getBlogPosts()
    .map((p): Caducidad => caducidadDe(p as Parameters<typeof caducidadDe>[0]))
    .filter((c) => c.estado !== "vigente")
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}
