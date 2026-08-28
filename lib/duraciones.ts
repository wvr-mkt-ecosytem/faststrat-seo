import fs from "fs";
import path from "path";

// Cuánto tarda de verdad cada cosa.
//
// La barra de progreso decía "~8:00" para escribir un artículo. Al lado, en el
// código, un comentario afirmaba que "los tiempos salen de corridas medidas".
// Las dos cosas no podían ser ciertas: la corrida medida tardó 23,8 minutos.
// El número era una suposición con un comentario que decía lo contrario, que es
// peor que no tener número, porque nadie lo cuestiona.
//
// Esto lo arregla de raíz: cada corrida que termina apunta lo que tardó, y la
// estimación sale de la MEDIANA de las últimas. Se corrige sola, y cuanto más
// se usa el sistema más se acerca.
//
// La mediana y no la media: una corrida que se topó con el límite de sesión y
// tardó tres veces más no debe mover la estimación de las demás.

const DIR = () => path.join(process.cwd(), "data");
const FICHERO = () => path.join(DIR(), "duraciones.json");

/** Cuántas corridas se guardan por tipo. Más allá, la vieja deja de importar. */
const MEMORIA = 15;

export type Tarea = "escribir" | "adaptar" | "ideas" | "tanda" | "analista" | "corregir";

/**
 * Lo que se enseña mientras no hay medidas propias.
 *
 * Son las corridas reales que sí se cronometraron, no números redondos:
 * escribir midió 23,8 minutos de punta a punta y el analista 8,2. Se quedan
 * como punto de partida y las sustituye la primera medida de verdad.
 */
const POR_DEFECTO: Record<Tarea, number> = {
  escribir: 1430,
  adaptar: 1500,
  ideas: 180,
  tanda: 300,
  analista: 500,
  corregir: 120,
};

type Almacen = Partial<Record<Tarea, number[]>>;

function leer(): Almacen {
  try {
    return JSON.parse(fs.readFileSync(FICHERO(), "utf8")) as Almacen;
  } catch {
    return {};
  }
}

/** Apunta lo que tardó una corrida. Nunca lanza: medir no puede romper nada. */
export function apuntar(tarea: Tarea, segundos: number): void {
  // Una corrida de dos segundos no es una corrida: es un error que volvió
  // pronto, y meterlo en la mediana hundiría la estimación.
  if (!Number.isFinite(segundos) || segundos < 5) return;
  try {
    const a = leer();
    a[tarea] = [...(a[tarea] ?? []), Math.round(segundos)].slice(-MEMORIA);
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(FICHERO(), JSON.stringify(a, null, 2));
  } catch {
    // Sin disco se sigue: la estimación cae al valor por defecto.
  }
}

export interface Estimacion {
  segundos: number;
  /** Sobre cuántas corridas reales. Cero significa que es el valor por defecto. */
  corridas: number;
}

export function estimar(tarea: Tarea): Estimacion {
  const medidas = leer()[tarea] ?? [];
  if (medidas.length === 0) return { segundos: POR_DEFECTO[tarea], corridas: 0 };

  const orden = [...medidas].sort((a, b) => a - b);
  const m = Math.floor(orden.length / 2);
  const mediana = orden.length % 2 === 1 ? orden[m] : Math.round((orden[m - 1] + orden[m]) / 2);
  return { segundos: mediana, corridas: medidas.length };
}

/** Todas las estimaciones, para que la pantalla las pida de una vez. */
export function todas(): Record<Tarea, Estimacion> {
  const tareas: Tarea[] = ["escribir", "adaptar", "ideas", "tanda", "analista", "corregir"];
  return Object.fromEntries(tareas.map((t) => [t, estimar(t)])) as Record<Tarea, Estimacion>;
}

/** Envuelve una operación y apunta lo que tardó si sale bien. */
export async function cronometrar<T>(tarea: Tarea, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  // Solo se apunta lo que TERMINÓ. Una corrida que falló a los treinta
  // segundos no dice nada sobre cuánto tarda hacer el trabajo.
  apuntar(tarea, (Date.now() - t0) / 1000);
  return r;
}
