import fs from "fs";
import path from "path";

const IDEAS_DIR = path.join(process.cwd(), "data", "ideas");

export interface ArticleIdea {
  title: string;
  slug: string;
  lang: string;
  priority: "alta" | "media" | "baja";
  primaryKeyword: string;
  intent: string;
  rationale: string;
  outline: string[];
  /**
   * Por qué esta keyword: qué busca quien la escribe y por qué podemos
   * responderle mejor. Distinto de `rationale`, que habla del tema.
   */
  keywordRationale?: string;
  /**
   * Hacia dónde va la demanda del tema, según Google Trends.
   *
   * Opcional porque Trends no tiene API oficial y puede fallar. Una idea sin
   * este dato es una idea normal, no una idea rota: nunca frena la tanda.
   */
  trend?: {
    direccion: "sube" | "baja" | "estable" | "sin-volumen";
    /** Cambio interanual en porcentaje. */
    cambioAnual: number;
    /** Dónde está hoy respecto a su propio máximo, de 0 a 100. */
    nivelActual: number;
  };
}

export interface IdeaBatch {
  weekOf: string;
  generatedAt: string;
  source: string;
  summary: string;
  research: {
    competitors: string[];
    trends: string[];
  };
  ideas: ArticleIdea[];
}

/** Devuelve todas las tandas de ideas, más reciente primero. */
export function getIdeaBatches(): IdeaBatch[] {
  if (!fs.existsSync(IDEAS_DIR)) return [];
  return fs
    .readdirSync(IDEAS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(IDEAS_DIR, f), "utf8")) as IdeaBatch)
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf));
}

export function getLatestBatch(): IdeaBatch | undefined {
  return getIdeaBatches()[0];
}
