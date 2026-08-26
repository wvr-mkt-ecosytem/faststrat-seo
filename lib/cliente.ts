// Todo lo que cambia de un cliente a otro, en un solo sitio.
//
// El sistema nació atado a FastStrat: el nombre, el dominio, el CTA y la
// descripción del negocio estaban repartidos en veinte archivos, dentro de
// prompts, expresiones regulares y componentes de pantalla. Replicarlo para
// otra empresa significaba buscar y reemplazar a mano, con el riesgo evidente
// de que un prompt siguiera diciendo "FastStrat" en el artículo de otro
// cliente.
//
// Ahora todo sale de aquí, y todo se puede rellenar por variables de entorno.
// Poner el sistema a funcionar para otra empresa es escribir su bloque de
// variables y desplegar; no hay que tocar código.
//
// Lo que NO va aquí: las reglas de SEO y de GEO. Esas son universales y viven
// en house-rules.ts, que ya recibe el dominio por parámetro. La separación
// importa porque mezclarlas ya nos costó una vez: la primera versión de la
// compuerta traía "prohibido el em dash" del manual de OTRO cliente y bloqueó
// los dieciséis posts de este, que los usaba con normalidad.

const env = (clave: string, porDefecto: string) => process.env[clave]?.trim() || porDefecto;

export interface Cliente {
  /** Cómo se llama la marca, tal cual se escribe. */
  nombre: string;
  /** El dominio del sitio de contenido, sin protocolo. */
  dominio: string;
  /** Dónde vive el producto. Es a donde apunta el CTA y donde acaba el embudo. */
  dominioApp: string;
  /** Lo que el sitio añade al <title>. Se descuenta del límite de Google. */
  sufijoTitulo: string;
  /** Qué vende y a quién, en una frase. Va dentro de los prompts. */
  queHace: string;
  /** Los mercados, para que el contenido hable en el idioma y el contexto correctos. */
  mercados: string;
  /** Con quién compite. El analista los busca para ver qué prometen ellos. */
  competidores: string[];
  /**
   * Quién firma el contenido.
   *
   * Google pregunta expresamente "¿Se muestra claramente a los visitantes quién
   * ha creado el contenido?", y hasta ahora la respuesta del sitio era que no:
   * el frontmatter tenía cuatro campos y ninguno era el autor. Una persona
   * responsable del contenido es lo que separa un blog de una granja de
   * páginas, y es la parte de E-E-A-T que se puede resolver escribiéndola.
   */
  autor: string;
  /** Si el manual de marca prohíbe la raya larga. Es decisión de marca, no SEO. */
  sinRayaLarga: boolean;
  /**
   * Cómo se escriben los encabezados. Es estilo de casa, no una regla de SEO.
   *
   * "libre" es el valor por defecto y solo marca la INCOHERENCIA: mezclar los
   * dos estilos dentro del mismo artículo. Medido sobre los 21 artículos del
   * repositorio, exigir minúsculas producía 88 avisos de 112, o sea que ahogaba
   * las cuatro señales que sí decían algo. Title Case no es un rastro de IA: es
   * el estilo de medio internet en inglés.
   */
  encabezados: "libre" | "minusculas" | "titulo";
  /** La línea bajo el logo en las portadas generadas. En mayúsculas. */
  tagline: string;
  /** Los colores de la marca, para las portadas generadas. */
  colorPrincipal: string;
  colorFondo: string;
}

export const CLIENTE: Cliente = {
  nombre: env("CLIENTE_NOMBRE", "FastStrat"),
  dominio: env("CLIENTE_DOMINIO", "faststrat.ai"),
  dominioApp: env("CLIENTE_DOMINIO_APP", "app.faststrat.ai"),
  sufijoTitulo: env("CLIENTE_SUFIJO_TITULO", " - faststrat.ai"),
  queHace: env(
    "CLIENTE_QUE_HACE",
    "plataforma de agentes de IA de marketing para PYMEs y agencias pequeñas",
  ),
  mercados: env("CLIENTE_MERCADOS", "LATAM y EE.UU."),
  competidores: env("CLIENTE_COMPETIDORES", "Jasper,HubSpot,Copy.ai,Writesonic")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  autor: env("CLIENTE_AUTOR", "Walter Von Roestel"),
  sinRayaLarga: env("CLIENTE_SIN_RAYA_LARGA", "true") === "true",
  encabezados: env("CLIENTE_ENCABEZADOS", "libre") as Cliente["encabezados"],
  tagline: env("CLIENTE_TAGLINE", "AI MARKETING FOR SMALL BUSINESS"),
  // Los valores por defecto son los que ya usaban las portadas publicadas. Si
  // se cambian sin querer, las portadas nuevas dejan de parecerse a las 109 que
  // ya están en el sitio.
  colorPrincipal: env("CLIENTE_COLOR", "#5A1A1A"),
  colorFondo: env("CLIENTE_COLOR_FONDO", "#F7F2E9"),
};

/** La URL del producto, ya formada. Es a donde lleva el CTA. */
export const URL_PRODUCTO = `https://${CLIENTE.dominioApp}`;

/** El bloque que describe al cliente dentro de un prompt. */
export const CONTEXTO_CLIENTE = `Escribes para ${CLIENTE.nombre}, ${CLIENTE.queHace}. Mercados: ${CLIENTE.mercados}.`;

/**
 * El cierre que lleva al producto, en los dos idiomas.
 *
 * Se genera desde la configuración en vez de estar escrito a mano porque era
 * uno de los sitios donde el nombre del cliente estaba más enterrado: dentro
 * de un literal de texto, repetido en tres archivos distintos.
 */
export const CTA: Record<"en" | "es", string> = {
  en: `

---

You now know what to do. The hard part is doing it every week, without a marketing team, while you run the business.

That is the job ${CLIENTE.nombre} does: it plans the content, writes it, publishes it, and tells you what actually moved. One place, no stack to assemble.

**[Start free at ${CLIENTE.dominioApp} →](${URL_PRODUCTO})**

Set it up in minutes. Keep what works.
`,
  es: `

---

Ya sabes qué hacer. Lo difícil es hacerlo cada semana, sin equipo de marketing y mientras sacas adelante el negocio.

De eso se encarga ${CLIENTE.nombre}: planea el contenido, lo escribe, lo publica y te dice qué funcionó de verdad. En un solo sitio, sin herramientas que ensamblar.

**[Empieza gratis en ${CLIENTE.dominioApp} →](${URL_PRODUCTO})**

Se configura en minutos. Te quedas con lo que funcione.
`,
};

/** Añade el cierre si no está. Idempotente: el corrector puede haberlo dejado. */
export const conCta = (markdown: string, lang: string) =>
  markdown.includes(CLIENTE.dominioApp) ? markdown : markdown.trimEnd() + CTA[lang === "es" ? "es" : "en"];

/**
 * Las formas en las que aparece escrita la marca, como fragmento de expresión
 * regular.
 *
 * Sirve para descartar la propia marca de las listas de palabras clave: una
 * idea de contenido que consiste en buscar el nombre del cliente no es una
 * idea, es tráfico que ya se tiene. Estaba escrito a mano como
 * "fast ?strat|strat ?fast|faststrat", lo cual solo funcionaba para un cliente
 * concreto, y en cualquier otro dejaba pasar su marca como si fuera un tema.
 *
 * Se generan variantes con y sin espacio entre las partes en mayúscula porque
 * la gente las busca de las dos formas, y en cualquier orden por lo mismo.
 *
 * El escapado va sobre cada PARTE, antes de unirlas. Hacerlo sobre la variante
 * ya montada escapaba también el "?" que se inserta a propósito como
 * cuantificador, y el resultado buscaba un signo de interrogación literal:
 * "fast ?strat" dejaba de reconocer "fast strat". Salió al probar la función
 * con cuatro nombres de cliente distintos, no al leerla.
 */
export const RUIDO_MARCA: string = (() => {
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const limpio = CLIENTE.nombre.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const partes = limpio.split(/(?=[A-Z])|\s+/).map((p) => p.trim()).filter(Boolean);

  const variantes = new Set<string>([escapar(limpio.toLowerCase().replace(/\s+/g, ""))]);
  if (partes.length > 1) {
    const escapadas = partes.map((p) => escapar(p.toLowerCase()));
    variantes.add(escapadas.join(" ?"));
    variantes.add([...escapadas].reverse().join(" ?"));
  }
  variantes.add(escapar(CLIENTE.dominio.split(".")[0].toLowerCase()));

  // Los alias existen porque un nombre no basta para deducir cómo lo escribe la
  // gente. "Grupo Triple-S" se busca como "triple s", sin el "grupo", y ninguna
  // regla derivada del nombre completo lo alcanza sin filtrar además cualquier
  // consulta que lleve la palabra "grupo". Se declara y se acabó.
  for (const alias of env("CLIENTE_MARCA_ALIAS", "").split(",")) {
    const a = alias.trim().toLowerCase();
    if (a) variantes.add(a.split(/\s+/).map(escapar).join(" ?"));
  }

  return [...variantes].join("|");
})();
