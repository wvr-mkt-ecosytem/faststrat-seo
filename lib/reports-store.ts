import fs from "fs";
import path from "path";
import type { AnalystResult } from "@/lib/ga4-analyst";

// Guarda los informes del analista.
//
// Sin esto el informe vivía solo en la pantalla: recargar lo perdía, y volver a
// tenerlo costaba nueve minutos de agente. Eso convierte una herramienta de
// consulta en algo que se mira una vez y se abandona.
//
// Y hay una segunda razón, más importante que la comodidad: sin histórico no se
// puede responder "¿esto mejoró?". Un informe suelto describe un momento; dos
// informes describen una dirección, que es lo que decide si lo que hicimos
// sirvió. El sistema lleva todo el día midiendo cosas sin poder compararlas
// consigo mismas.

const DIR = () => path.join(process.cwd(), "data", "reports");

export interface InformeGuardado extends AnalystResult {
  /** Cuándo se generó, en ISO. Es la clave para comparar dos. */
  generadoEn: string;
}

/** Nombre de archivo por fecha y hora: varias corridas el mismo día no se pisan. */
const nombre = (iso: string) => `${iso.replace(/[:.]/g, "-")}.json`;

export function guardarInforme(r: AnalystResult): InformeGuardado {
  const generadoEn = new Date().toISOString();
  const completo: InformeGuardado = { ...r, generadoEn };
  fs.mkdirSync(DIR(), { recursive: true });
  fs.writeFileSync(path.join(DIR(), nombre(generadoEn)), JSON.stringify(completo, null, 2));
  return completo;
}

/** Los informes, del más reciente al más antiguo. */
export function listarInformes(limite = 20): InformeGuardado[] {
  try {
    return fs
      .readdirSync(DIR())
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limite)
      .map((f) => JSON.parse(fs.readFileSync(path.join(DIR(), f), "utf8")) as InformeGuardado)
      // Un archivo corrupto no puede tumbar la lista entera.
      .filter((x) => x && typeof x.generadoEn === "string");
  } catch {
    return [];
  }
}

export function ultimoInforme(): InformeGuardado | null {
  return listarInformes(1)[0] ?? null;
}
