import { CLIENTE } from "@/lib/cliente";
import { revisarDiferencial } from "@/lib/diferencial";
import { revisarLegibilidad } from "@/lib/legibilidad";

// Comprobación mecánica de un borrador antes de que salga.
//
// Portado del sistema de contenido de Leasey, donde estas reglas no se
// dedujeron: cada una viene de algo que se publicó o estuvo a punto. Corren en
// milisegundos y no gastan tokens, así que van ANTES de cualquier revisión con
// modelo: lo que se puede comprobar contando caracteres no necesita criterio.
//
// Los casos que dieron origen a cada regla están en context/writing-failures.md.
//
// Lo importante del diseño: esto BLOQUEA, no avisa. La versión que solo avisaba
// dejó pasar tres documentos con cifras sin respaldo, porque un aviso que
// aparece siempre se lee como decoración.

export type Severity = "block" | "warn";

export interface Finding {
  severity: Severity;
  rule: string;
  detail: string;
  /** El fragmento donde aparece, para poder encontrarlo sin buscar a ciegas. */
  excerpt?: string;
}

// Muletillas de tolerancia cero. No es purismo de estilo: son las palabras que
// aparecen cuando un modelo rellena en vez de decir algo.
const BANNED =
  /\b(streamlin\w*|leverag\w*|seamless\w*|game.?chang\w*|robust|unlock\w*|delve|elevate|harness|tapestry|testament to|in today'?s (?:fast.?paced|digital) world|it'?s worth noting|navigate the landscape)\b/gi;

// Las mismas muletillas, en español. La lista de arriba es solo inglesa y el
// sistema publica también en español para LATAM, así que sobre buena parte del
// contenido real no filtraba nada: un artículo entero de relleno en español
// pasaba limpio por una regla que existe precisamente para atraparlo.
const BANNED_ES =
  /\b(potenciar|revolucionar|sin fisuras|clave fundamental|pieza clave|el gigante tecnológico|en la era digital|en el mundo actual|en un mundo cada vez más|no es un secreto que|cabe destacar|es importante mencionar|a día de hoy|en definitiva|sin lugar a dudas)\b/gi;

// El marcador que viaja. Se publicó uno dentro de una frase acabada.
const PLACEHOLDER = /\[(?:VERIFICAR|VERIFY|TBD|TODO|source to verify|pendiente|placeholder)[^\]]*\]|\(source to verify\)|XX+%/gi;

const EM_DASH = /—/g;

// Un número dentro de un ejemplo hipotético no es una afirmación que verificar.
// "Si un cliente te deja $50 de valor, no puedes gastar $40 en captarlo" no
// necesita fuente: no dice que eso ocurra, dice cómo se hace la cuenta.
// Cada alternativa lleva su propio límite final. Sin él, /say/ casaba dentro
// de "says" y degradaba a aviso la forma más común de citar una estadística
// real ("Gartner says 63% of..."), y /si/ hacía lo mismo con "Si bien...".
// Solo formas EXPLÍCITAS de plantear una hipótesis.
//
// Antes estaban "if", "say", "says" y "si" sueltas, y eso abría un agujero:
// "Si haces esto, la conversión subió 63%" degradaba de BLOQUEO a aviso una
// estadística sin fuente, y en español "si" aparece en cualquier frase. Bastaba
// con meter un condicional para colar un dato inventado. Comprobado antes de
// tocarlo: "Conversion rose 63%" bloqueaba y "If you do this, conversion rose
// 63%" solo avisaba.
const HYPOTHETICAL =
  /\b(suppose|imagine|let'?s say|for example|e\.g\.|assume|hypothetical|hypothetically|illustrative|illustration|scenario|worked example|pretend|calculated|calculation|break.?even|pongamos|supongamos|por ejemplo|imagina|imaginemos|ilustrativ\w*|escenario|calculad\w*|punto de equilibrio)\b/i;

/** Porcentajes y millares: la forma que toma una estadística. */
const STAT = /\d+(?:[.,]\d+)?\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g;
/** Importes: casi siempre precio o ejemplo, verificables en la propia página del proveedor. */
const MONEY = /\$\s?\d[\d,.]*/g;

const URL_NEAR = /https?:\/\/|\]\(|<a\s|\[\d+\]/i;

/** Rangos de meta que Google recorta. */
const META_TITLE_MAX = 60;
const META_DESC_MIN = 120;
const META_DESC_MAX = 160;

const excerptAround = (text: string, index: number, span = 70) =>
  text.slice(Math.max(0, index - span), index + span).replace(/\s+/g, " ").trim();

/**
 * Las cifras que no tienen ninguna URL cerca.
 *
 * Se mira línea a línea con una ventana de una línea arriba y otra abajo,
 * porque la fuente suele ir en la frase siguiente y no en la misma. El fallo
 * que esto atrapa es el del 30 de julio: dos artículos llegaron a punto de
 * publicarse con CERO enlaces externos y el verificador de enlaces pasó limpio,
 * porque no había ni un enlace que verificar.
 */
export function unsourcedFigures(markdown: string): Finding[] {
  const lines = markdown.split("\n");
  const out: Finding[] = [];
  const seen = new Set<string>();

  lines.forEach((line, i) => {
    void i;
    // Los bloques de código y las tablas de datos propios no son afirmaciones.
    if (/^\s{4,}|^\s*```|^\s*\|/.test(line)) return;

    const near = [lines[i - 1] || "", line, lines[i + 1] || ""].join(" ");
    if (URL_NEAR.test(near)) return;

    const hypothetical = HYPOTHETICAL.test(line);

    // Un número pegado a una unidad es una especificación, no una estadística.
    // "(2.500+ words)" es una recomendación de extensión y "90% depth" es el
    // parámetro de un evento de GA4: ninguno afirma nada sobre el mundo, y
    // pedirles fuente convertía artículos técnicos en impublicables.
    const isSpec = (idx: number) =>
      // Se añadieron las unidades de CANTIDAD DE COSAS (mensajes, usuarios,
      // contactos…). El primer artículo generado con las reglas nuevas salió
      // bloqueado por "2.000 marketing + 1.500 utility messages", que son los
      // tramos de una tabla de precios, no una afirmación sobre el mundo.
      // Pedirle fuente a eso vuelve impublicable cualquier artículo de precios,
      // que es justo el tipo de contenido con más intención de compra.
      /^\s*(?:\+?\s*)?(words?|palabras|visits?|visitas|characters?|caracteres|px|depth|scroll|seconds?|segundos|minutes?|minutos|hours?|horas|days?|días|mb|kb|gb|messages?|mensajes?|conversations?|conversaciones|users?|usuarios?|contacts?|contactos|leads?|emails?|correos?|subscribers?|suscriptores?|customers?|clientes?|products?|productos?)\b/i.test(
        line.slice(idx),
      );

    // Lo que va entre acentos graves es código, no prosa.
    const codeSpans: [number, number][] = [];
    for (const m of line.matchAll(/`[^`]*`/g)) {
      codeSpans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
    const inCode = (idx: number) => codeSpans.some(([a, b]) => idx >= a && idx < b);

    // La posición llega desde fuera, por aparición. Antes se resolvía con
    // line.indexOf(f), que devuelve siempre la PRIMERA: una cifra dentro de un
    // bloque de código silenciaba la misma cifra escrita más adelante en prosa,
    // y esa segunda sí era una afirmación sin fuente.
    const add = (f: string, at: number, severity: Severity, why: string) => {
      const t = f.trim();
      if (/^\b(19|20)\d{2}\b$/.test(t)) return; // años
      if (inCode(at) || isSpec(at + f.length)) return;
      // La clave incluye dónde aparece: si no, una cifra citada al principio
      // daba inmunidad a la misma cifra sin fuente páginas después.
      const clave = i + ":" + at + ":" + t;
      if (seen.has(clave)) return;
      seen.add(clave);
      out.push({
        severity,
        rule: "figure-without-source",
        detail: `${t} ${why}`,
        excerpt: excerptAround(line, at),
      });
    };

    // Los importes se miran PRIMERO y se guardan sus tramos, para que los
    // dígitos de dentro no se cuenten otra vez como estadística. Sin esto,
    // "$4,500" producía un aviso por el importe y un BLOQUEO por "4,500", y
    // cualquier artículo de precios quedaba impublicable.
    const tramosMoney: [number, number][] = [];
    for (const m of line.matchAll(MONEY)) {
      const at = m.index ?? 0;
      tramosMoney.push([at, at + m[0].length]);
      add(m[0], at, "warn", "is a figure with no source nearby. Check it is a price you can point at.");
    }
    const dentroDeMoney = (idx: number) => tramosMoney.some(([a, b]) => idx >= a && idx < b);

    // Una estadística dentro de una hipótesis sigue mereciendo mirada, pero no
    // frena una publicación: no afirma un hecho del mundo.
    for (const m of line.matchAll(STAT)) {
      const at = m.index ?? 0;
      if (dentroDeMoney(at)) continue;
      add(m[0], at, hypothetical ? "warn" : "block", "has no link to a source near it.");
    }
  });
  return out;
}

/** Comprueba que cada cita entre comillas exista literal en la lista permitida. */
export function quotesAreVerbatim(markdown: string, allowed: string[]): Finding[] {
  if (!allowed.length) return [];
  const out: Finding[] = [];
  // Comillas rectas y tipográficas.
  const quotes = [...markdown.matchAll(/"([^"\n]{25,})"|[“]([^”\n]{25,})[”]/g)];

  for (const m of quotes) {
    const quoted = (m[1] || m[2] || "").trim();
    // Subcadena literal y contigua: convertir una coma en punto le atribuye a
    // una persona real una frase que no dijo.
    const ok = allowed.some((a) => a.includes(quoted));
    if (!ok) {
      out.push({
        severity: "block",
        rule: "quote-not-verbatim",
        detail: "This quotation does not appear verbatim in the approved testimonials.",
        excerpt: quoted.slice(0, 120),
      });
    }
  }
  return out;
}

/**
 * Reglas de casa, no universales.
 *
 * Separadas a propósito. La primera versión de esto traía prohibido el em dash
 * porque el manual de marca de OTRO cliente lo prohíbe, y bloqueó los 16 posts
 * del blog de FastStrat, que los usa con normalidad. Una compuerta que bloquea
 * todo se apaga en un día, y entonces tampoco atrapa lo que sí importa.
 *
 * Lo que viaja entre clientes es "una cifra necesita fuente". Lo que no viaja
 * es la tipografía.
 */
export interface HouseRules {
  /** Prohibir el em dash. Apagado: es decisión de manual de marca. */
  noEmDash?: boolean;
  /**
   * El dominio propio del cliente, sin protocolo. Ej: "faststrat.ai".
   *
   * Estaba quemado en cuatro sitios de este archivo mientras la cabecera y
   * house-rules.ts presumían de ser agnósticos. Al replicar el sistema a otro
   * cliente, las tres reglas de enlaces se invertían EN SILENCIO: cualquier
   * enlace propio contaba como externo (no-external-links no saltaba nunca),
   * ninguno contaba como interno (no-internal-link saltaba siempre) y la
   * autocita circular no se detectaba jamás. Ningún error, ningún aviso:
   * simplemente tres reglas dando lo contrario de lo que dicen.
   */
  dominio?: string;
  /** Subdominios propios que no cuentan como cita. Ej: el de la app del CTA. */
  dominiosPropios?: string[];
  /**
   * Exigir un enlace al producto. Apagado por defecto: es decisión de cada
   * cliente si su contenido tiene que llevar a algún sitio.
   *
   * Encendido para FastStrat porque el primer artículo que generó el sistema
   * llegó a WordPress SIN él: los 109 posts vivos lo tenían por un script, y el
   * escritor nunca lo añadía. Con 1.784 sesiones y cero conversiones, un
   * artículo que atrae y no ofrece el paso siguiente es esa cifra repetida.
   */
  /**
   * Palabras con las que el contenido no debe describir al cliente.
   *
   * Ver Cliente.categoriaProhibida: el anchor text es la etiqueta con la que
   * Google y los modelos aprenden qué es una marca.
   */
  categoriaProhibida?: string[];
  /** Dominios que valen como fuente primaria para precios y especificaciones. */
  fuentesPrimarias?: string[];
  urlProducto?: string;
}

/** Escapa un host para meterlo en una expresión regular. */
const escapar = (h: string) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface QaInput {
  title?: string;
  metaDescription?: string;
  markdown: string;
  /**
   * El idioma en el que SE PIDIÓ el artículo ("en" | "es").
   *
   * Sin esto no se puede comprobar que el cuerpo esté en el idioma correcto, y
   * el 4 de septiembre salió un artículo con título en inglés y 2.221 palabras
   * de cuerpo en español sin que nada lo notara.
   */
  lang?: string;
  /** Citas aprobadas, textuales. Sin esto no se comprueban las comillas. */
  approvedQuotes?: string[];
  /**
   * Qué aporta este artículo frente a los que ya rankean.
   *
   * Opcional a propósito: los 21 artículos que ya existen no lo tienen y
   * bloquearlos a todos de golpe convertiría la compuerta en un muro. Solo se
   * exige cuando `exigirDiferencial` está encendido, que es lo que hacen las
   * rutas que ESCRIBEN contenido nuevo.
   */
  differentiator?: string;
  exigirDiferencial?: boolean;
  house?: HouseRules;
}

export interface QaResult {
  ok: boolean;
  blocking: Finding[];
  warnings: Finding[];
}

export function runQa(input: QaInput): QaResult {
  const { markdown, title = "", metaDescription = "" } = input;
  const findings: Finding[] = [];

  // El dominio del cliente. Por defecto faststrat.ai para no romper las
  // llamadas que ya existen, pero ahora es un parámetro: sin él, replicar el
  // sistema a otro cliente invertía las tres reglas de enlaces sin avisar.
  const dominio = input.house?.dominio ?? CLIENTE.dominio;
  const propios = [dominio, ...(input.house?.dominiosPropios ?? [`app.${dominio}`])];
  const dom = escapar(dominio);
  const esPropio = (host: string) =>
    propios.some((d) => host.toLowerCase() === d.toLowerCase() || host.toLowerCase().endsWith("." + d.toLowerCase()));

  // Lo primero que se mira es si aporta algo, porque es lo único que no se
  // arregla editando: un artículo que repite a los de arriba sigue repitiéndolos
  // con las rayas cambiadas.
  if (input.exigirDiferencial) {
    const d = revisarDiferencial(input.differentiator);
    if (!d.ok) {
      findings.push({
        severity: "block",
        rule: "no-differentiator",
        detail: d.motivo ?? "Falta el diferencial.",
      });
    }
  }

  // Cómo se lee. Todo esto AVISA y nada bloquea: la verificabilidad es binaria
  // (una cifra tiene fuente o no), el estilo es un juicio, y frenar un artículo
  // cierto y útil por abusar de las negritas sería peor que publicarlo.
  findings.push(...revisarLegibilidad(markdown, { encabezados: CLIENTE.encabezados }));

  for (const m of markdown.matchAll(BANNED)) {
    findings.push({
      severity: "block",
      rule: "banned-phrase",
      detail: `"${m[0]}" is on the zero-tolerance list.`,
      excerpt: excerptAround(markdown, m.index ?? 0),
    });
  }

  for (const m of markdown.matchAll(BANNED_ES)) {
    findings.push({
      severity: "block",
      rule: "banned-phrase",
      detail: `"${m[0]}" es muletilla de relleno y está en la lista de tolerancia cero.`,
      excerpt: excerptAround(markdown, m.index ?? 0),
    });
  }

  for (const m of markdown.matchAll(PLACEHOLDER)) {
    findings.push({
      severity: "block",
      rule: "placeholder-left-in",
      detail: `The marker ${m[0]} is still in the text. Markers travel: one was published inside a finished sentence.`,
      excerpt: excerptAround(markdown, m.index ?? 0),
    });
  }

  if (input.house?.noEmDash) {
    for (const m of markdown.matchAll(EM_DASH)) {
      findings.push({
        severity: "block",
        rule: "em-dash",
        detail: "Em dash, and this brand's guide forbids it. Use a comma, parentheses or a full stop.",
        excerpt: excerptAround(markdown, m.index ?? 0),
      });
    }
  }

  findings.push(...unsourcedFigures(markdown));
  findings.push(...quotesAreVerbatim(markdown, input.approvedQuotes || []));

  // Un artículo sin un solo enlace externo no es verificable. Es aviso y no
  // bloqueo porque hay piezas legítimas sin fuente externa, pero merece mirada.
  if (!new RegExp(`https?://(?!(?:www\\.)?${dom})`, "i").test(markdown)) {
    findings.push({
      severity: "warn",
      rule: "no-external-links",
      detail:
        "Not one external link. Citing by name without linking is the easiest way to slip past a format review.",
    });
  }

  if (title && title.length > META_TITLE_MAX) {
    findings.push({
      severity: "warn",
      rule: "meta-title-length",
      detail: `Title is ${title.length} characters; Google truncates past ${META_TITLE_MAX}.`,
    });
  }
  if (metaDescription) {
    const n = metaDescription.length;
    if (n < META_DESC_MIN || n > META_DESC_MAX) {
      findings.push({
        severity: "warn",
        rule: "meta-description-length",
        detail: `Meta description is ${n} characters; aim for ${META_DESC_MIN}-${META_DESC_MAX}.`,
      });
    }
  }

  // Jerarquía de encabezados. Un H3 colgando de un H1, o un H4 cualquiera,
  // rompe el esquema que Google usa para entender la página.
  const headings = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));
  headings.forEach((h, i) => {
    if (h.level >= 4) {
      findings.push({
        severity: "warn",
        rule: "heading-too-deep",
        detail: `H${h.level} ("${h.text.slice(0, 50)}"). Keep it to H1 to H3.`,
      });
    }
    const prev = headings[i - 1];
    if (prev && h.level > prev.level + 1) {
      findings.push({
        severity: "warn",
        rule: "heading-skips-level",
        detail: `H${prev.level} jumps straight to H${h.level} at "${h.text.slice(0, 50)}".`,
      });
    }
  });

  // Todo artículo enlaza al menos una página propia de servicio o herramienta:
  // sin eso el contenido atrae tráfico y no lo lleva a ningún sitio.
  if (!new RegExp(`\\]\\((?:/|https?://(?:www\\.)?${dom})`, "i").test(markdown)) {
    findings.push({
      severity: "warn",
      rule: "no-internal-link",
      detail: "No link to a page of our own. The piece brings traffic and sends it nowhere.",
    });
  }

  // Autocita circular: si la única fuente de una cifra es nuestra propia web,
  // no está respaldada, está repetida.
  // El enlace del CTA queda fuera: un 'empieza gratis' no cita nada, y
  // contarlo hacía que añadir el botón volviera impublicable el artículo.
  // Que no haya fuentes externas ya lo dice la regla no-external-links.
  const external = [...markdown.matchAll(/https?:\/\/([^/\s)]+)/g)]
    .map((m) => m[1])
    .filter((h) => !(input.house?.dominiosPropios ?? [`app.${dominio}`]).some((d) => h.toLowerCase() === d.toLowerCase()));
  if (external.length && external.every((h) => esPropio(h))) {
    findings.push({
      severity: "block",
      rule: "circular-self-citation",
      detail: "Every link points at our own site. A figure whose only source is us is not sourced.",
    });
  }

  // El anchor de los enlaces propios no puede llamarnos por otra categoría.
  //
  // El agente escribió "FastStrat's marketing automation tools" apuntando a una
  // página nuestra. FastStrat no vende automatización, vende la capa de
  // estrategia. El anchor text es literalmente cómo Google y los modelos
  // aprenden qué es una marca, así que equivocar la categoría en cada artículo
  // desgasta justo la que intentas construir.
  //
  // Bloquea en vez de avisar porque el arreglo es mecánico —cambiar unas
  // palabras— y el corrector lo resuelve solo. Un aviso se queda ahí para
  // siempre.
  // La primera posición de una coincidencia es el texto entero, no el primer
  // grupo. Sin la coma, `anchor` valía "[texto](url)" y `destino` valía el
  // anchor: la regla no saltaba nunca y parecía que el artículo estaba limpio.
  for (const [, anchor, destino] of markdown.matchAll(/\[([^\]]+)\]\((\/[^)]*|https?:\/\/[^)]+)\)/g)) {
    const esNuestro = destino.startsWith("/") || esPropio(destino.replace(/^https?:\/\/(?:www\.)?/, "").split("/")[0]);
    if (!esNuestro) continue;
    const mala = (input.house?.categoriaProhibida ?? []).find((c) => anchor.toLowerCase().includes(c));
    if (mala) {
      findings.push({
        severity: "block",
        rule: "anchor-off-category",
        detail: `El enlace propio "${anchor}" nos llama "${mala}", que no es la categoría del cliente. Reescribe el anchor describiendo lo que de verdad hace.`,
      });
    }
  }

  // Un precio o un límite de plataforma se cita de quien lo publica.
  //
  // Un artículo demolió el "98% de open rate" ajeno por no tener fuente
  // primaria y construyó su propia tabla de costos sobre blogs de vendors de
  // WhatsApp, con la tarifa de Meta publicada y sin citarla. La compuerta
  // comprobaba que la cifra TUVIERA fuente, no que la fuente fuera
  // independiente de quien se beneficia del dato.
  //
  // Avisa, no bloquea: no se puede saber cuál es la fuente oficial de todo, y
  // bloquear por lo que no sabemos es como se ahogan las señales que sí valen.
  const primarias = input.house?.fuentesPrimarias ?? [];
  if (primarias.length) {
    const PRECIO = /(?:\$|US\$|€)\s?\d|(?:\d+[.,]\d+|\d+)\s*(?:por mensaje|per message|\/msg|per conversation|por conversación)/i;
    for (const parrafo of markdown.split(/\n\s*\n/)) {
      if (!PRECIO.test(parrafo)) continue;
      const fuentes = [...parrafo.matchAll(/https?:\/\/([^/\s)]+)/g)].map((m) => m[1].toLowerCase());
      if (!fuentes.length) continue; // eso ya lo dice figure-without-source
      if (fuentes.some((h) => primarias.some((d) => h === d || h.endsWith(`.${d}`)))) continue;
      // El dominio de un producto ES la fuente primaria de SU precio.
      //
      // La lista de arriba solo conoce a Meta, Google y unos pocos más, así que
      // el primer artículo escrito con esta regla salió con cuatro avisos por
      // citar screamingfrog.co.uk, semrush.com y ahrefs.com — que son
      // exactamente quien publica esos precios. Una regla que avisa en cada
      // artículo que compara herramientas deja de leerse.
      //
      // Si el párrafo NOMBRA la marca cuyo dominio se cita, la cita es
      // primaria. "Blueticks dice que WhatsApp cuesta X" no pasa: ahí lo que se
      // pone precio es WhatsApp, no Blueticks.
      const nombreDe = (host: string) =>
        host.replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase();
      // Se conserva el TEXTO del enlace y se tira solo la URL.
      //
      // La primera versión borraba `[Screaming Frog](url)` entero, y con él la
      // marca: el artículo decía "[Screaming Frog](su-web) cuesta $279/año",
      // que es la cita primaria perfecta, y aun así avisaba. La marca suele
      // estar justo en el anchor.
      // Lo que decide no es que la marca aparezca, sino en qué PAPEL.
      //
      //   "[Screaming Frog](su-web) cuesta $279"      -> es el sujeto: primaria
      //   "WhatsApp cuesta $0.06, [según Blueticks]"  -> es quien reporta: no
      //
      // Conservar todos los anchors dejaba pasar el segundo, porque "según
      // Blueticks" también nombra a Blueticks. Así que los anchors que van
      // detrás de una fórmula de cita se borran con ella: quien atribuye no es
      // quien cobra.
      const CITA = /seg[úu]n|according to|per|via|v[íi]a|fuente|source|datos de|data from/i;
      const textoPlano = parrafo
        // La fórmula de cita puede ir ANTES del enlace…
        .replace(new RegExp(`(?:${CITA.source})\\s*:?\\s*\\[[^\\]]*\\]\\([^)]*\\)`, "gi"), " ")
        // …o DENTRO del propio anchor, que es como lo escribe el agente:
        // "[según Blueticks](url)". Sin esto, la marca que solo REPORTA el
        // precio se contaba como si fuera la que lo cobra.
        .replace(new RegExp(`\\[\\s*(?:${CITA.source})[^\\]]*\\]\\([^)]*\\)`, "gi"), " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
      if (fuentes.some((h) => nombreDe(h).length > 3 && textoPlano.includes(nombreDe(h)))) continue;
      findings.push({
        severity: "warn",
        rule: "pricing-not-from-primary-source",
        detail:
          `Hay precios citados solo desde ${[...new Set(fuentes)].join(", ")}, que no son la fuente oficial. ` +
          `Busca la tarifa publicada por la propia plataforma; si no existe, di que el dato es de un proveedor y no está auditado.`,
      });
    }
  }

  // El cuerpo tiene que estar en el idioma que se pidió.
  //
  // Se pidió un artículo en inglés y el agente devolvió el título en inglés y
  // las 2.221 palabras del cuerpo en español. Pasó la compuerta entera —cero
  // bloqueos— porque ninguna regla miraba el idioma, y se guardó listo para
  // publicar bajo una keyword en inglés.
  //
  // Se cuenta con palabras funcionales, que son las que no se pueden evitar al
  // escribir: "the/and/for" frente a "el/la/que". Un artículo en inglés que
  // cite marcas o frases en español sigue teniendo abrumadora mayoría inglesa,
  // así que solo salta cuando el idioma equivocado GANA.
  if (input.lang) {
    const cuenta = (re: RegExp) => (markdown.match(re) ?? []).length;
    const enES = cuenta(/\b(el|la|los|las|de|del|que|para|con|una|más|está|pero|cuando|donde|tus?|cada|sitio|porque)\b/gi);
    const enEN = cuenta(/\b(the|and|for|with|that|this|your|from|have|are|will|which|about|each|because)\b/gi);
    const pedido = input.lang === "es" ? "español" : "inglés";
    const escrito = enES > enEN ? "español" : "inglés";
    // El margen evita saltar con textos muy cortos o muy técnicos, donde diez
    // palabras funcionales de más no significan nada.
    if (escrito !== pedido && Math.max(enES, enEN) > 30 && Math.max(enES, enEN) > Math.min(enES, enEN) * 2) {
      findings.push({
        severity: "block",
        rule: "wrong-language",
        detail: `Se pidió el artículo en ${pedido} y el cuerpo está en ${escrito} (${enES} marcadores de español frente a ${enEN} de inglés). Reescribe el cuerpo entero en ${pedido}.`,
      });
    }
  }

  // El enlace al producto. Bloquea, no avisa: un aviso que aparece siempre se
  // lee como decoración, y esta es la única ruta de conversión que tiene el
  // artículo.
  if (input.house?.urlProducto && !markdown.includes(input.house.urlProducto)) {
    findings.push({
      severity: "block",
      rule: "no-cta",
      detail: `Falta el enlace al producto (${input.house.urlProducto}). El artículo atrae tráfico y no le ofrece a dónde ir.`,
    });
  }

  const blocking = findings.filter((f) => f.severity === "block");
  return { ok: blocking.length === 0, blocking, warnings: findings.filter((f) => f.severity === "warn") };
}
