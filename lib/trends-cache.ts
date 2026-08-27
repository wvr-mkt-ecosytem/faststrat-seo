import fs from "fs";
import path from "path";
import type { Tendencia } from "@/lib/trends";

// La caché de Google Trends, en disco.
//
// EL PROBLEMA QUE RESUELVE no es la lentitud, es el 429. Una corrida semanal
// consulta hasta 26 keywords y cada una son DOS peticiones al endpoint no
// oficial: 52 seguidas. Eso es lo que activa el límite por IP, y cuando salta
// no falla una consulta, fallan todas las siguientes.
//
// Por eso hay dos mecanismos y no uno:
//
//   1. La caché evita repetir lo que ya se sabe.
//   2. Al fallar se sirve el valor GUARDADO aunque esté caducado. Un dato de
//      hace cinco semanas es mucho mejor que ningún dato, y sin esto el primer
//      429 dejaba la tanda entera sin dirección de demanda.
//
// Sobre el plazo: los puntos que devuelve Trends con "today 5-y" son MENSUALES,
// así que dentro del mismo mes la serie apenas cambia. Una semana es más corto
// de lo que el dato necesita, pero engancha con la tanda semanal y el coste de
// refrescar de más lo absorbe el punto 2.

const DIR = () => path.join(process.cwd(), "data", "trends");
const FICHERO = () => path.join(DIR(), "cache.json");

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

interface Entrada {
  t: Tendencia;
  /** Cuándo se consultó, en ISO. */
  cuando: string;
}

type Almacen = Record<string, Entrada>;

/** La clave incluye el país: la misma palabra no tiene la misma demanda en dos sitios. */
export const clave = (termino: string, geo = "") => `${geo}|${termino.toLowerCase().trim()}`;

function leer(): Almacen {
  try {
    return JSON.parse(fs.readFileSync(FICHERO(), "utf8")) as Almacen;
  } catch {
    // No existe todavía, o quedó a medias. Empezar de cero es correcto: lo peor
    // que pasa es que se vuelva a consultar.
    return {};
  }
}

function escribir(a: Almacen): void {
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(FICHERO(), JSON.stringify(a, null, 2));
  } catch {
    // Sin disco, el sistema sigue: la caché es una optimización, no un requisito.
  }
}

export interface Guardado {
  t: Tendencia;
  /** Cuántos días tiene el dato. */
  dias: number;
  /** true si ya pasó el plazo y habría que refrescarlo. */
  caducado: boolean;
}

/** Lo que hay guardado, esté caducado o no. Quien llama decide qué hacer. */
export function guardado(termino: string, geo = "", plazoMs = SEMANA_MS): Guardado | null {
  const e = leer()[clave(termino, geo)];
  if (!e) return null;
  const edad = Date.now() - new Date(e.cuando).getTime();
  return { t: e.t, dias: Math.floor(edad / 86400000), caducado: edad > plazoMs };
}

export function guardar(termino: string, geo: string, t: Tendencia): void {
  const a = leer();
  a[clave(termino, geo)] = { t, cuando: new Date().toISOString() };
  escribir(a);
}

/** Cuántas entradas hay y cuántas están caducadas. Para poder decirlo en pantalla. */
export function estado(plazoMs = SEMANA_MS): { total: number; frescas: number; caducadas: number } {
  const a = leer();
  let frescas = 0;
  for (const e of Object.values(a)) {
    if (Date.now() - new Date(e.cuando).getTime() <= plazoMs) frescas++;
  }
  const total = Object.keys(a).length;
  return { total, frescas, caducadas: total - frescas };
}

export const PLAZO_MS = SEMANA_MS;
