import fs from "fs";
import path from "path";
import { getIdeaBatches, type ArticleIdea } from "@/lib/ideas";
import { getBlogPosts } from "@/lib/blog";

// El calendario editorial: reparte en fechas las ideas que ya existen.
//
// Portado del sistema de Leasey, pero de raíz distinta. Allí el calendario vive
// en una hoja de Google y la cadencia se DEDUCE de las últimas semanas reales.
// Aquí no hay hoja ni historial de publicación, así que deducirla sería
// inventarla: la cadencia se declara en PLAN_FILE y por defecto son dos piezas
// por semana. Un valor declarado se puede discutir; uno deducido de la nada se
// confunde con un hecho.
//
// La otra diferencia importa más: una idea sin fecha no se escribe nunca. Las
// dos tandas de ideas que hay acumulan 13 y 13 propuestas, y lo que faltaba no
// era generarlas, era decidir cuándo va cada una.

const PLAN_FILE = path.join(process.cwd(), "data", "plan.json");

export interface PlannedPiece {
  date: string;
  slug: string;
  title: string;
  keyword: string;
  lang: string;
  priority: string;
  /** De qué tanda salió, para poder volver al contexto que la originó. */
  batch: string;
  /** Si ya se escribió, aquí está. Se recalcula leyendo content/blog. */
  written?: boolean;
}

export interface Plan {
  cadence: { weekdays: number[]; perWeek: number };
  updatedAt: string;
  pieces: PlannedPiece[];
}

/** Martes y jueves. Declarado, no deducido. */
const DEFAULT_CADENCE = { weekdays: [2, 4], perWeek: 2 };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function readPlan(): Plan {
  try {
    return JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")) as Plan;
  } catch {
    return { cadence: DEFAULT_CADENCE, updatedAt: "", pieces: [] };
  }
}

export function writePlan(plan: Plan): void {
  fs.mkdirSync(path.dirname(PLAN_FILE), { recursive: true });
  fs.writeFileSync(PLAN_FILE, JSON.stringify(plan, null, 2));
}

/** Los slugs que ya tienen artículo escrito. */
function writtenSlugs(): Set<string> {
  return new Set(getBlogPosts().map((p) => p.slug));
}

/**
 * Palabras significativas de un título, para no programar dos veces el mismo
 * tema con slugs distintos.
 *
 * Las tandas de ideas repiten: "Small Business Marketing Budget: Is 5% or 10%"
 * y "Small business marketing budget percentage of revenue 5% 10%" son la misma
 * pieza con dos slugs. Comparar slugs no lo habría visto.
 */
const sig = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );

function sameTopic(a: string, b: string): boolean {
  const wa = sig(a);
  const wb = sig(b);
  if (!wa.size) return false;
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return hits >= Math.max(3, Math.floor(wa.size * 0.6));
}

export interface BuildOptions {
  weeks?: number;
  /** Desde cuándo programar. Por defecto, mañana. */
  from?: string;
  cadence?: { weekdays: number[]; perWeek: number };
}

export interface BuildResult {
  planned: PlannedPiece[];
  skipped: { title: string; reason: string }[];
  available: number;
  exhausted: boolean;
  cadence: { weekdays: number[]; perWeek: number };
}

/**
 * Reparte en fechas las ideas que aún no están escritas ni programadas.
 *
 * No genera ideas nuevas: eso ya lo hace el agente semanal. Esto solo decide
 * cuándo va cada una, que es el paso que faltaba entre "tenemos 26 ideas" y
 * "publicamos dos por semana".
 */
export function buildPlan(opts: BuildOptions = {}): BuildResult {
  const weeks = Math.min(Math.max(opts.weeks ?? 4, 1), 26);
  const existing = readPlan();
  const cadence = opts.cadence ?? existing.cadence ?? DEFAULT_CADENCE;

  const written = writtenSlugs();
  const alreadyPlanned = existing.pieces.map((p) => p.title);

  const skipped: { title: string; reason: string }[] = [];
  const queue: { idea: ArticleIdea; batch: string }[] = [];
  const taken: string[] = [...alreadyPlanned];

  for (const batch of [...getIdeaBatches()].reverse()) {
    for (const idea of batch.ideas || []) {
      if (written.has(idea.slug)) {
        skipped.push({ title: idea.title, reason: "already written" });
        continue;
      }
      if (taken.some((t) => sameTopic(idea.title, t))) {
        skipped.push({ title: idea.title, reason: "same topic as one already planned or queued" });
        continue;
      }
      taken.push(idea.title);
      queue.push({ idea, batch: batch.weekOf });
    }
  }

  // Prioridad alta primero; dentro de cada nivel, el orden de la tanda.
  const rank: Record<string, number> = { alta: 0, media: 1, baja: 2 };
  queue.sort((a, b) => (rank[a.idea.priority] ?? 9) - (rank[b.idea.priority] ?? 9));

  const start = opts.from ? new Date(opts.from + "T00:00:00Z") : new Date();
  if (!opts.from) start.setUTCDate(start.getUTCDate() + 1);

  const usedDates = new Set(existing.pieces.map((p) => p.date));
  const planned: PlannedPiece[] = [];
  let i = 0;

  for (let d = 0; d < weeks * 7 && i < queue.length; d++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + d);
    if (!cadence.weekdays.includes(day.getUTCDay())) continue;
    const date = iso(day);
    if (usedDates.has(date)) continue;

    const { idea, batch } = queue[i++];
    usedDates.add(date);
    planned.push({
      date,
      slug: idea.slug,
      title: idea.title,
      keyword: idea.primaryKeyword,
      lang: idea.lang || "en",
      priority: idea.priority,
      batch,
      written: false,
    });
  }

  return {
    planned,
    skipped,
    available: queue.length,
    // Que las ideas se acaben antes que las semanas es un resultado que se
    // dice, no un hueco que se rellena con temas inventados.
    exhausted: i >= queue.length,
    cadence,
  };
}

/**
 * Marca lo que ya se escribió, leyendo content/blog en vez de fiarse del plan.
 *
 * Compara por slug Y por tema. El generador crea el slug a partir del título
 * que él mismo redacta, que no tiene por qué ser el de la idea: fiarse solo del
 * slug habría dejado piezas ya escritas marcadas como pendientes, y la
 * siguiente tanda las habría vuelto a programar.
 */
export function planWithStatus(): Plan {
  const plan = readPlan();
  const posts = getBlogPosts();
  const bySlug = new Set(posts.map((p) => p.slug));
  const titles = posts.map((p) => p.title);

  return {
    ...plan,
    pieces: plan.pieces.map((p) => ({
      ...p,
      written: bySlug.has(p.slug) || titles.some((t) => sameTopic(p.title, t)),
    })),
  };
}
