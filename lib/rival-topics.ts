import fs from "fs";
import path from "path";


// Saca temas candidatos de lo que competidores y medios publicaron de verdad.
//
// La señal es el SLUG del artículo, no una categoría. El tab de PR clasifica en
// ocho temas anchos ("IA y automatización") porque ahí lo que importa es de qué
// habla cada medio; para decidir una pieza eso no sirve: "IA y automatización"
// no es un artículo. El slug sí es, en la práctica, el titular que eligieron.
//
// Dos filtros hacen casi todo el trabajo:
//   - fuera lo que no es un artículo (paginación, /tag/, /author/, /category/),
//     que si no domina el ranking por volumen;
//   - fuera lo viejo. Un post de 2021 no es una señal de qué se está hablando
//     ahora, y el sitemap devuelve el archivo entero.

// Las instantáneas viven en data/, que es donde las deja watch-competitors.mjs.
const DIR = () => path.join(process.cwd(), "data", "competitor-watch");

interface Page {
  url: string;
  lastmod: string;
}
interface Entry {
  kind?: string;
  error?: string;
  pages?: Page[];
}

export interface RivalTopic {
  /**
   * El tema son las DOS palabras que comparten las fuentes, no el slug de un
   * artículo concreto.
   *
   * La versión anterior enseñaba el slug de la pieza más reciente y debajo la
   * lista de las cinco fuentes que "lo cubren". Era falso: las cinco compartían
   * el par de palabras, no ese artículo. Se leía como "cinco competidores
   * escribieron esto" cuando lo cierto era "cinco escribieron sobre esto".
   */
  phrase: string;
  sources: string[]; // quién lo cubre
  kinds: string[]; // "competidor" | "medio"
  newest: string; // lastmod más reciente ("" si la fuente no publica fecha)
  /** En cuántas URLs aparece este par: separa un tema de una categoría. */
  hits: number;
  /** Un ejemplo real por fuente, para poder abrir y comprobarlo. */
  examples: { source: string; url: string }[];
}

export interface SourceCoverage {
  name: string;
  kind: string;
  total: number;
  used: number;
  /** Por qué se consideran "recientes": fecha, diff entre instantáneas, o nada. */
  basis: "date" | "new-since-last-snapshot" | "no-date-signal";
}

export interface RivalTopicsResult {
  topics: RivalTopic[];
  sources: SourceCoverage[];
  /** Fuentes sin fecha y sin instantánea previa: su "novedad" no está probada. */
  undatedWithoutDiff: string[];
}

/** URLs que no son artículos y solo hacen ruido en el ranking. */
const NOT_AN_ARTICLE =
  /\/(page|tag|tags|category|categories|author|authors|topic|topics|feed|amp|search|wp-content|events?|webinars?)\//i;

// Palabras de IDIOMA, no de sector.
//
// La separación importa: esta lista es inglés y vale igual para cualquier
// cliente, mientras que las palabras propias del sector ("multifamily",
// "property") se deducen por frecuencia más abajo y se reajustan solas cuando
// se vigile a otro cliente. Mezclarlas obligaría a reescribir la lista entera
// en cada proyecto.
//
// La versión corta de esta lista dejaba pasar pares como "know + should" y
// "have + must": el filtro por frecuencia no los tumbaba porque, uno a uno, no
// son frecuentes; solo son vacíos.
const STOP = new Set(
  (
    "the a an and or for of to in on with without your you yours how what why when where which who" +
    " is are was were be been being am do does did done have has had having can could will would" +
    " shall should may might must need needs let lets" +
    " that this these those it its at from by as into over under after before between about against" +
    " we our us they them their he she his her i me my" +
    " all any each every some more most other another such only own same than then too very just" +
    " new best top great good better ways way guide guides tip tips step steps things thing stuff" +
    " know knowing learn make making get getting take taking use using help helps need work works" +
    " here there now next last first second third much many lot lots" +
    " whats dont doesnt isnt arent cant wont youre thats" +
    " part full free easy simple quick fast smart complete ultimate essential common key main" +
    " year years month months week weeks day days time times today" +
    " 2018 2019 2020 2021 2022 2023 2024 2025 2026 2027"
  ).split(/\s+/),
);

/** El slug final de la URL, convertido en frase legible. */
function phraseOf(url: string): string | null {
  let p: string;
  try {
    p = new URL(url).pathname;
  } catch {
    return null;
  }
  if (NOT_AN_ARTICLE.test(p)) return null;

  const segs = p.split("/").filter(Boolean);
  if (!segs.length) return null;

  // MultifamilyBiz mete un id numérico antes del slug: /news/11435/slug_here.
  // El último segmento útil es el que tiene palabras.
  const slug = [...segs].reverse().find((s) => /[a-z]{3}/i.test(s) && !/^\d+$/.test(s));
  if (!slug) return null;

  const words = slug
    .replace(/\.(html?|php|aspx)$/i, "")
    .replace(/[_+]/g, "-")
    .split("-")
    .filter((w) => w && !/^\d{1,4}$/.test(w));

  // Menos de tres palabras suele ser una sección ("blog", "news", "pricing"),
  // no un artículo.
  if (words.length < 3) return null;
  const phrase = words.join(" ").toLowerCase();
  if (BRANDED.test(phrase) || PRESS_RELEASE.test(phrase)) return null;
  return phrase;
}

// Marcas y patrones de nota de prensa. Un competidor anunciando su propio
// premio, su partnership o su cliente no es un tema del sector: es su boletín.
// Como idea de contenido no sirve, y sin este filtro copaba el ranking porque
// los competidores publican mucho sobre sí mismos.
const BRANDED =
  /\b(jasper|hubspot|breeze|copy\.?ai|adcreative|typeface|semrush|ahrefs|surfer ?seo|screaming ?frog|faststrat)\b/i;
const PRESS_RELEASE =
  /\b(recognis|recogniz|award|premio|partner|partnership|names?d|appoints?|announces|anuncia|celebrat|anniversar|aniversario|webinar|selects?|converts?|wins?|gana|nombramiento|nombra|asume|ficha|fichaje|se une|se suma|designa|nuevo director|nueva directora|new (?:ceo|cmo|coo|head|chief)|se incorpora|deja la agencia|renuncia)\b/i;

/** Palabras significativas de una frase, sin ruido ni duplicados. */
const sig = (phrase: string) => [
  ...new Set(phrase.split(" ").filter((w) => w.length > 3 && !STOP.has(w))),
];

/**
 * Claves de comparación: TODOS los pares de palabras significativas.
 *
 * La primera versión usaba el conjunto exacto de palabras como clave, y sobre
 * 13.000 URLs solo encontró UN tema cubierto por dos fuentes. No era que el
 * sector no coincidiera: era que dos competidores nunca escriben el mismo slug.
 * "tenant-screening-guide-2026" y "how-to-screen-tenants-faster" son el mismo
 * tema y no comparten ni una clave exacta.
 *
 * Con pares, ambas comparten {screen, tenant} y coinciden. Se limita a ocho
 * palabras por frase para que un slug largo no genere cientos de pares.
 */
function pairsOf(phrase: string, keep: (w: string) => boolean = () => true): string[] {
  const w = sig(phrase).filter(keep).slice(0, 8).sort();
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    for (let j = i + 1; j < w.length; j++) out.push(w[i] + "|" + w[j]);
  }
  return out;
}

function snapshots(): string[] {
  try {
    return fs
      .readdirSync(DIR())
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

const read = (file: string): Record<string, Entry> | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR(), file), "utf8"));
  } catch {
    return null;
  }
};

/**
 * Temas que el sector publicó en los últimos `days` días, ordenados por cuántas
 * fuentes distintas los tocaron y por lo reciente que sean.
 *
 * Que dos competidores escriban de lo mismo es la señal fuerte: uno puede ser
 * una apuesta suya, dos ya es el sector decidiendo que el tema importa.
 */
export function rivalTopics(days = 120, limit = 60): RivalTopicsResult {
  const files = snapshots();
  const watch = files.length ? read(files[files.length - 1]) : null;
  if (!watch) return { topics: [], sources: [], undatedWithoutDiff: [] };

  // Tres fuentes (EliseAI, Entrata, MultifamilyBiz) publican sitemap SIN fecha,
  // y MultifamilyBiz es la mayor con diferencia. Filtrar por lastmod las habría
  // borrado en silencio y "lo que publica el sector" habría sido en realidad
  // seis de nueve fuentes.
  //
  // Para esas, la señal de novedad es la comparación con la instantánea
  // anterior: una URL que no estaba la semana pasada es nueva, aunque no traiga
  // fecha. Con una sola instantánea todavía no hay con qué comparar, y eso se
  // devuelve dicho en vez de aparentar cobertura completa.
  const prev = files.length > 1 ? read(files[files.length - 2]) : null;

  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const byKey = new Map<string, RivalTopic>();
  const sources: SourceCoverage[] = [];
  const undatedWithoutDiff: string[] = [];

  // Primera pasada: en cuántos slugs aparece cada palabra.
  //
  // Una lista de stopwords escrita a mano no vale aquí. En este corpus
  // "multifamily", "property" y "management" están en casi todo, así que un par
  // como "management + multifamily" salía cubierto por siete fuentes y no es una
  // idea de contenido: es el nombre del sector. Y la lista habría que reescribirla
  // el día que se vigile a otro cliente.
  //
  // Se deduce del propio corpus: una palabra que sale en más del 4% de los
  // slugs no distingue un tema de otro, sea cual sea el sector.
  const phrases: { name: string; kind: string; page: Page; phrase: string }[] = [];
  const df = new Map<string, number>();

  const collect = (name: string, kind: string, page: Page) => {
    const phrase = phraseOf(page.url);
    if (!phrase) return;
    phrases.push({ name, kind, page, phrase });
    for (const w of sig(phrase)) df.set(w, (df.get(w) || 0) + 1);
  };

  for (const [name, d] of Object.entries(watch)) {
    if (d.error) continue;
    const pages = d.pages || [];
    const dated = pages.filter((p) => p.lastmod);
    const isUndated = dated.length === 0 && pages.length > 0;

    let usable: Page[];
    if (!isUndated) {
      usable = pages.filter((p) => p.lastmod && p.lastmod.slice(0, 10) >= cutoff);
    } else if (prev) {
      const before = new Set(((prev[name]?.pages || []) as Page[]).map((p) => p.url));
      usable = pages.filter((p) => !before.has(p.url));
    } else {
      // Sin fecha y sin instantánea anterior: entra todo, marcado, y se avisa.
      usable = pages;
      undatedWithoutDiff.push(name);
    }

    sources.push({
      name,
      kind: d.kind || "competidor",
      total: pages.length,
      used: usable.length,
      basis: !isUndated ? "date" : prev ? "new-since-last-snapshot" : "no-date-signal",
    });

    for (const p of usable) collect(name, d.kind || "competidor", p);
  }

  // Umbral deducido: fuera lo que sale en más del 0,5% de los slugs.
  //
  // Con el 4% seguían saliendo pares como "asset + management" o "case + study",
  // que son etiquetas de categoría, no piezas. Sobre 13.000 slugs el 4% deja
  // pasar palabras presentes en 500 URLs, que por definición no distinguen nada.
  const maxDf = Math.max(3, Math.floor(phrases.length * 0.005));
  const distinctive = (w: string) => (df.get(w) || 0) <= maxDf;

  // Segunda pasada: pares, ya solo con palabras que distinguen.
  for (const { name, kind, page, phrase } of phrases) {
    const keys = pairsOf(phrase, distinctive);
    for (const k of keys) {
      const cur = byKey.get(k);
      if (cur) {
        if (!cur.sources.includes(name)) cur.sources.push(name);
        if (!cur.kinds.includes(kind)) cur.kinds.push(kind);
        if ((page.lastmod || "") > cur.newest) cur.newest = page.lastmod || "";
        cur.hits++;
        // Un ejemplo por fuente: así "lo cubren cinco" se puede comprobar
        // abriendo cinco enlaces, uno de cada una.
        if (!cur.examples.some((e) => e.source === name)) {
          cur.examples.push({ source: name, url: page.url });
        }
      } else {
        byKey.set(k, {
          phrase: k.replace("|", " + "),
          sources: [name],
          kinds: [kind],
          newest: page.lastmod || "",
          examples: [{ source: name, url: page.url }],
          hits: 1,
        });
      }
    }
  }

  // Un par que aparece en cientos de URLs no es un tema, es la categoría del
  // sitio entero ("property|management"). Sirve para describir a un medio, no
  // para decidir una pieza. El techo se fija por volumen, no a mano.
  const CATEGORY_NOISE = 40;

  // Ordenar por número de fuentes premiaba justo lo genérico: cuanto más ancho
  // el par, más gente lo "cubre". Se ordena por especificidad — cuántas fuentes
  // distintas lo tocan DIVIDIDO por en cuántas URLs aparece — que sube el tema
  // que varios trataron pocas veces y hunde la etiqueta que sale en todas.
  const specificity = (t: RivalTopic) => t.sources.length / Math.sqrt(t.hits);

  const candidatos = [...byKey.values()].filter((t) => t.hits <= CATEGORY_NOISE && t.sources.length >= 2);

  // Un titular compartido producía SIETE temas, no uno.
  //
  // Cuando dos medios publican la misma nota ("El 97% de las agencias de
  // publicidad en México prioriza la IA pero solo el 19% ejerce un liderazgo
  // formal"), cada pareja de palabras significativas se registraba como tema
  // propio: ejerce+formal, ejerce+liderazgo, ejerce+prioriza, formal+liderazgo…
  // Con veinte huecos en pantalla, dos historias se comían la lista entera y
  // las demás no llegaban a verse.
  //
  // Los pares que salen del MISMO conjunto de artículos son la misma historia,
  // así que se agrupan por ahí: por las URLs de ejemplo, que es el dato que
  // dice de dónde salió cada par.
  const porHistoria = new Map<string, RivalTopic[]>();
  for (const t of candidatos) {
    const clave = t.examples
      .map((e) => e.url)
      .sort()
      .join("|");
    (porHistoria.get(clave) ?? porHistoria.set(clave, []).get(clave)!).push(t);
  }

  const agrupados: RivalTopic[] = [...porHistoria.values()].map((grupo) => {
    const base = grupo[0];
    if (grupo.length === 1) return base;

    // La etiqueta, en el orden en que las palabras aparecen en el titular.
    // "ejerce + formal" no dice nada; "agencias publicidad prioriza liderazgo"
    // se lee como el tema que es. El orden sale del slug, no del alfabeto.
    const enGrupo = new Set(grupo.flatMap((t) => t.phrase.split(" + ")));
    const frase = phraseOf(base.examples[0].url) ?? "";
    const enOrden = frase.split(" ").filter((w) => enGrupo.has(w));
    const etiqueta = [...new Set(enOrden)].slice(0, 5).join(" + ");

    return {
      ...base,
      phrase: etiqueta || base.phrase,
      // Las fuentes son las mismas en todo el grupo (por eso agrupan), pero se
      // unen igualmente para no depender de esa suposición.
      sources: [...new Set(grupo.flatMap((t) => t.sources))],
      kinds: [...new Set(grupo.flatMap((t) => t.kinds))],
      hits: Math.max(...grupo.map((t) => t.hits)),
    };
  });

  const topics = agrupados
    .sort((a, b) => specificity(b) - specificity(a) || b.newest.localeCompare(a.newest))
    .slice(0, limit);

  return { topics, sources, undatedWithoutDiff };
}
