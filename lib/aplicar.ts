import fs from "fs";
import path from "path";

// Aplicar lo que el informe recomienda, desde el propio informe.
//
// POR QUÉ EXISTE: el analista producía ocho recomendaciones muy concretas
// —"redirige esta URL a esta otra"— y para ejecutarlas había que abrir
// WordPress, buscar la página a mano y repetirlo ocho veces. Un informe que
// dice exactamente qué hacer y no deja hacerlo es una lista de deberes.
//
// Lo que NO hace: adivinar. El destino del 301 viene dentro de una frase en
// español, no en un campo, así que se extrae con una expresión regular y se
// DEVUELVE para que una persona lo confirme. Una redirección mal puesta manda
// tráfico real a una página equivocada y no se nota hasta la semana siguiente.

const REGISTRO = path.join(process.cwd(), "data", "reports", "aplicadas.json");

export type Aplicada = {
  /** El informe al que pertenece, por su fecha de generación. */
  informe: string;
  indice: number;
  /** Qué se hizo: se aplicó de verdad, o alguien lo marcó como hecho a mano. */
  como: "aplicada" | "hecha-a-mano" | "descartada";
  cuando: string;
  detalle?: string;
};

export function leerAplicadas(): Aplicada[] {
  try {
    return JSON.parse(fs.readFileSync(REGISTRO, "utf8")) as Aplicada[];
  } catch {
    return [];
  }
}

export function anotar(a: Aplicada): Aplicada[] {
  const todas = leerAplicadas().filter((x) => !(x.informe === a.informe && x.indice === a.indice));
  todas.push(a);
  fs.mkdirSync(path.dirname(REGISTRO), { recursive: true });
  fs.writeFileSync(REGISTRO, JSON.stringify(todas, null, 2));
  return todas;
}

/** Quita la anotación: la recomendación vuelve a estar pendiente. */
export function borrar(informe: string, indice: number): Aplicada[] {
  const quedan = leerAplicadas().filter((x) => !(x.informe === informe && x.indice === indice));
  fs.mkdirSync(path.dirname(REGISTRO), { recursive: true });
  fs.writeFileSync(REGISTRO, JSON.stringify(quedan, null, 2));
  return quedan;
}

/**
 * Saca el par origen → destino de una recomendación de consolidación.
 *
 * El analista lo escribe como "Configurar redirección 301: /a/ → /b/", pero no
 * siempre con la misma flecha ni el mismo verbo, así que se acepta cualquiera
 * de las formas que ha usado. Si no se reconoce, se devuelve null: es mejor no
 * ofrecer el botón que ofrecer uno que redirige a donde no es.
 */
export function extraerRedireccion(rec: { target: string; suggestion: string }): { desde: string; hacia: string } | null {
  // La ruta NO puede acabar en el punto de la frase.
  //
  // Con `[^\s,;)]*` a secas, "redirige /a/ → /b/." capturaba "/b/." y el 301
  // habría apuntado a una URL con un punto pegado: una redirección rota, en
  // producción, que no se nota hasta que alguien mira los 404. Salió al probar
  // la extracción contra el informe de verdad, no leyendo la expresión.
  const ruta = String.raw`\/[^\s,;)]*[^\s,;).]`;
  const flecha = String.raw`(?:→|->|–>|=>)`;
  const m = rec.suggestion.match(new RegExp(`(${ruta})\\s*${flecha}\\s*(${ruta})`));
  if (!m) return null;

  const [, desde, hacia] = m;
  // El origen tiene que ser el objetivo de la recomendación. Si no coincide, la
  // frase estaba hablando de otra cosa (por ejemplo el lote de nueve, que lista
  // varios pares) y aplicar el primero que aparece sería una redirección a
  // ciegas.
  const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  if (norm(desde) !== norm(rec.target)) return null;
  if (norm(desde) === norm(hacia)) return null;

  return { desde, hacia };
}

type Resultado = { ok: boolean; detalle: string; comoArreglarlo?: string };

/**
 * Pone el 301 en WordPress, vía Rank Math.
 *
 * Se usa Rank Math y no el plugin Redirection porque este último exige cookie
 * de sesión y nonce: con contraseña de aplicación devuelve 401 siempre. Rank
 * Math sí acepta la credencial, pero el usuario necesita el permiso de
 * redirecciones, que se da en Rank Math → Role Manager. Sin él contesta
 * `rest_cannot_edit`, y eso se explica en vez de mostrarse como "falló".
 */
export async function aplicarRedireccion(par: { desde: string; hacia: string }): Promise<Resultado> {
  const base = process.env.WP_URL;
  const usuario = process.env.WP_USER;
  const clave = process.env.WP_APP_PASSWORD;
  if (!base || !usuario || !clave) {
    return { ok: false, detalle: "Faltan WP_URL, WP_USER o WP_APP_PASSWORD." };
  }
  const auth = "Basic " + Buffer.from(`${usuario}:${clave.replace(/ /g, "")}`).toString("base64");

  // Rank Math redirige POR POST, así que hace falta el id del que se va.
  const slug = par.desde.replace(/^\/|\/$/g, "").split("/").pop() ?? "";
  const busca = await fetch(`${base}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=id,link`, {
    headers: { Authorization: auth },
    signal: AbortSignal.timeout(60000),
  });
  const encontrados = (await busca.json().catch(() => [])) as { id: number; link: string }[];
  if (!Array.isArray(encontrados) || !encontrados.length) {
    return {
      ok: false,
      detalle: `En WordPress no hay ninguna entrada con el slug "${slug}", así que no se puede redirigir.`,
      comoArreglarlo: "Comprueba la URL de origen: puede que ya se haya renombrado o borrado.",
    };
  }

  const r = await fetch(`${base}/wp-json/rankmath/v1/updateRedirection`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      objectID: encontrados[0].id,
      hasRedirect: true,
      redirectionUrl: par.hacia,
      redirectionType: "301",
    }),
    signal: AbortSignal.timeout(60000),
  });
  const j = (await r.json().catch(() => ({}))) as { code?: string; message?: string };

  if (r.status === 401 && j.code === "rest_cannot_edit") {
    return {
      ok: false,
      detalle: "WordPress acepta la credencial pero no le deja crear redirecciones.",
      comoArreglarlo:
        `Al usuario "${usuario}" le falta el permiso de redirecciones. Se activa en WordPress → Rank Math → Role Manager, ` +
        "marcando Redirections para su rol. En cuanto esté, este botón funciona sin tocar nada más.",
    };
  }
  if (!r.ok) {
    return { ok: false, detalle: `WordPress respondió ${r.status}: ${j.message ?? "sin detalle"}.` };
  }

  return { ok: true, detalle: `301 puesto: ${par.desde} → ${par.hacia} (entrada ${encontrados[0].id}).` };
}
