// Vigila qué publican los competidores, semana a semana.
//
// Se apoya en sus sitemaps, no en scrapear HTML. Un sitemap trae la URL y la
// fecha de última modificación, es lo que el propio sitio declara como su
// contenido, y no se rompe cuando cambian el diseño.
//
// La gracia no es la foto de hoy: es el DIFF contra la semana pasada. "Qué hay
// publicado" lo puede mirar cualquiera en cinco minutos; "qué publicaron esta
// semana y sobre qué" solo sale si alguien guardó lo de la semana anterior.
// Por eso cada corrida deja su instantánea en data/competitor-watch/.
//
// Uso:  node scripts/watch-competitors.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = "data/competitor-watch";
// Cabeceras completas de navegador, no solo el User-Agent. Varios sitios
// distinguen a fetch de un navegador por lo que FALTA (Accept, Accept-Language,
// Sec-Fetch-*) y devuelven 403 aunque el UA sea correcto: Multifamily Dive
// respondía 200 a curl y 403 a Node hasta añadir esto.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// A quién se vigila sale de data/watch-sources.json, no de una lista aquí.
// En Leasey vivía en el código, y eso obliga a tocar el script (y a que alguien
// se acuerde de hacerlo) cada vez que cambia un competidor. Para el segundo
// cliente eso ya no escala.
const CONFIG = JSON.parse(fs.readFileSync("data/watch-sources.json", "utf8"));
const SOURCES = CONFIG.sources || [];
if (!CONFIG.confirmed) {
  console.log(
    "Aviso: data/watch-sources.json sigue marcado como propuesta (confirmed: false).\n" +
      "La lista salió de contar menciones en el propio blog, no de una decisión tomada.\n",
  );
}

// Rutas donde suele vivir el sitemap. Se prueban en orden y se para en la
// primera que responda XML.
const SITEMAP_PATHS = [
  "/sitemap_index.xml", "/sitemap.xml", "/sitemap-index.xml",
  "/blog-sitemap.xml", "/post-sitemap.xml", "/wp-sitemap.xml",
];

// Lo que nos interesa es contenido editorial, no páginas de producto ni legales.
const EDITORIAL =
  /\/(blog|resources|insights|articles|learn|guides|news|library|academy|noticias|publicidad|campa|marketing|tecnolog|actualidad|tendencias|opinion)\//i;
const NOT_EDITORIAL = /\/(category|tag|author|page|feed|wp-content)\//i;

const get = async (url) => {
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const text = await r.text();
    return text.includes("<urlset") || text.includes("<sitemapindex") ? text : null;
  } catch {
    return null;
  }
};

// Igual que get, pero devolviendo el estado: hace falta para saber si un fallo
// es un bloqueo o una ausencia.
const getWithStatus = async (url) => {
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { status: r.status, xml: null };
    const text = await r.text();
    const ok = text.includes("<urlset") || text.includes("<sitemapindex");
    return { status: r.status, xml: ok ? text : null };
  } catch {
    return { status: 0, xml: null };
  }
};

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
const entries = (xml) =>
  [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    url: (m[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/) || [])[1] || "",
    lastmod: (m[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/) || [])[1] || "",
  }));


/**
 * Lee un RSS/Atom y lo devuelve con la misma forma que un sitemap.
 *
 * Solo se usa cuando no hay sitemap: un feed trae una ventana reciente, no el
 * archivo, así que sus totales NO son comparables con los de un sitemap.
 */
async function pagesFromRss(url) {
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const xml = await r.text();
    const items = [...xml.matchAll(/<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/g)];
    if (!items.length) return null;
    const pages = items
      .map((m) => {
        const b = m[1];
        const link =
          (b.match(/<link[^>]*>\s*([^<\s]+)\s*<\/link>/) || [])[1] ||
          (b.match(/<link[^>]+href="([^"]+)"/) || [])[1] ||
          "";
        const date =
          (b.match(/<pubDate>\s*([^<]+?)\s*<\/pubDate>/) || [])[1] ||
          (b.match(/<updated>\s*([^<]+?)\s*<\/updated>/) || [])[1] ||
          "";
        let lastmod = "";
        if (date) {
          const t = Date.parse(date);
          if (!Number.isNaN(t)) lastmod = new Date(t).toISOString().slice(0, 10);
        }
        return { url: link.trim(), lastmod };
      })
      .filter((e) => e.url);
    return pages.length ? pages : null;
  } catch {
    return null;
  }
}

async function pagesOf(comp) {
  let xml = null;
  let bloqueado = false;
  for (const p of SITEMAP_PATHS) {
    const res = await getWithStatus(comp.host + p);
    if (res.status === 403) bloqueado = true;
    if (res.xml) { xml = res.xml; break; }
  }
  if (!xml) {
    // Antes de darlo por perdido: puede publicar por RSS y no por sitemap.
    if (comp.rss) {
      const viaRss = await pagesFromRss(comp.rss);
      if (viaRss) {
        return {
          pages: viaRss,
          note: "vía RSS: es una ventana reciente, no el archivo. Su total no se compara con el de un sitemap",
        };
      }
    }
    return {
      error: bloqueado
        ? "bloquea el acceso automatizado (403)"
        : "sin sitemap en las rutas habituales" + (comp.rss ? " y su RSS tampoco se pudo leer" : ""),
    };
  }

  // Un índice apunta a otros sitemaps: se siguen los que parezcan editoriales.
  //
  // `trusted` marca los que YA son de contenido por su nombre (post-sitemap,
  // blog-sitemap). Ahí no se filtra por ruta: Funnel Leasing publica en la raíz
  // del dominio, sin /blog/, y el filtro de ruta descartaba sus 300 artículos.
  // Cuando el sitio ya dice "esto son mis posts", discutirlo por la forma de la
  // URL es añadir una suposición sobre un hecho.
  let found = [];
  if (xml.includes("<sitemapindex")) {
    const children = locs(xml).filter((u) => /post|blog|resource|article|news|insight|academy|learn|guide|library/i.test(u)).slice(0, 6);
    for (const c of children) {
      const sub = await get(c);
      if (sub) found.push(...entries(sub).map((e) => ({ ...e, trusted: true })));
      await new Promise((s) => setTimeout(s, 400));
    }
    // Si el índice no traía nada obviamente editorial, se prueban los primeros.
    if (!found.length) {
      for (const c of locs(xml).slice(0, 4)) {
        const sub = await get(c);
        if (sub) found.push(...entries(sub));
        await new Promise((s) => setTimeout(s, 400));
      }
    }
  } else {
    found = entries(xml);
  }

  const pages = found
    .filter(
      (e) =>
        e.url &&
        !NOT_EDITORIAL.test(e.url) &&
        (comp.wholeSiteEditorial || e.trusted || EDITORIAL.test(e.url)),
    )
    .map((e) => ({ url: e.url, lastmod: (e.lastmod || "").slice(0, 10) }));

  // Deduplicar conservando la fecha más reciente.
  const byUrl = new Map();
  for (const p of pages) {
    const prev = byUrl.get(p.url);
    if (!prev || p.lastmod > prev.lastmod) byUrl.set(p.url, p);
  }
  const kept = [...byUrl.values()];
  if (kept.length === 0) {
    return {
      pages: [],
      note: `sitemap legible (${found.length} URLs) pero ninguna casó el filtro editorial`,
    };
  }
  return { pages: kept };
}

// ---------------------------------------------------------------------------

fs.mkdirSync(DIR, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

// La instantánea anterior, para poder decir qué es NUEVO.
const previousFile = fs
  .readdirSync(DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && !f.startsWith(today))
  .sort()
  .pop();
const previous = previousFile ? JSON.parse(fs.readFileSync(path.join(DIR, previousFile), "utf8")) : null;

const snapshot = {};
console.log("VIGILANCIA DE COMPETIDORES\n");

// El `kind` viene declarado en la configuración, no de en qué lista estabas.
// Se ordena para que competidores y medios salgan agrupados en el informe.
const TODOS = [...SOURCES]
  .map((s) => ({ ...s, kind: s.kind || "competidor" }))
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

let kindActual = "";
for (const c of TODOS) {
  if (c.kind !== kindActual) {
    kindActual = c.kind;
    console.log(`\n  --- ${({ producto: "COMPETIDORES DE PRODUCTO", busqueda: "COMPETIDORES DE BÚSQUEDA", medio: "MEDIOS" })[kindActual] || kindActual.toUpperCase()} ---`);
  }
  const res = await pagesOf(c);
  if (res.error) {
    snapshot[c.name] = { kind: c.kind, tier: c.tier, error: res.error, pages: [] };
    console.log(`  ${c.name.padEnd(20)} ${res.error}`);
    continue;
  }
  snapshot[c.name] = { kind: c.kind, tier: c.tier, host: c.host, pages: res.pages, note: res.note || null };
  console.log(
    `  ${c.name.padEnd(28)} ${String(res.pages.length).padStart(4)} URLs editoriales` +
      (res.note ? `  <- ${res.note}` : ""),
  );
  await new Promise((s) => setTimeout(s, 800));
}

fs.writeFileSync(path.join(DIR, `${today}.json`), JSON.stringify(snapshot, null, 1));

// --- El informe ---
let md = `# Qué publican competidores y medios\n\nInstantánea del ${today}.`;

if (!previous) {
  md += `

**Primera corrida: no hay con qué comparar.** Esto registra la línea base. A partir de la próxima semana, este informe dirá qué es nuevo.

Ese es el punto entero: "qué hay publicado" lo ve cualquiera; "qué publicaron esta semana" solo sale si alguien guardó lo de antes.
`;
} else {
  md += ` Comparado con ${previousFile.replace(".json", "")}.\n\n`;
  let totalNuevas = 0;

  for (const [name, data] of Object.entries(snapshot)) {
    const before = new Set((previous[name]?.pages || []).map((p) => p.url));
    const nuevas = (data.pages || []).filter((p) => !before.has(p.url));
    const actualizadas = (data.pages || []).filter((p) => {
      const old = (previous[name]?.pages || []).find((q) => q.url === p.url);
      return old && p.lastmod && old.lastmod && p.lastmod > old.lastmod;
    });
    totalNuevas += nuevas.length;

    md += `## ${name}  ·  ${data.tier}\n\n`;
    if (data.error) {
      md += `No se pudo leer el sitemap: ${data.error}. No significa que no hayan publicado.\n\n`;
      continue;
    }
    if (!nuevas.length && !actualizadas.length) {
      md += `Sin publicaciones ni actualizaciones nuevas.\n\n`;
      continue;
    }
    if (nuevas.length) {
      md += `**${nuevas.length} pieza(s) nueva(s):**\n\n`;
      nuevas.slice(0, 15).forEach((p) => (md += `- ${p.lastmod || "sin fecha"} · ${p.url}\n`));
      if (nuevas.length > 15) md += `- ... y ${nuevas.length - 15} más\n`;
      md += `\n`;
    }
    if (actualizadas.length) {
      md += `**${actualizadas.length} actualizada(s)**, que suele ser reoptimización de algo que ya les rankea:\n\n`;
      actualizadas.slice(0, 8).forEach((p) => (md += `- ${p.lastmod} · ${p.url}\n`));
      md += `\n`;
    }
  }

  md += `\n---\n\n**Total de piezas nuevas esta semana: ${totalNuevas}.**\n`;
}

md += `
## Cómo leer esto

Una URL nueva dice de qué han decidido hablar, no si les funciona. Para saber lo segundo hace falta que pase tiempo y mirar si empieza a aparecer en nuestras mismas búsquedas.

Una URL **actualizada** suele ser más interesante que una nueva: significa que están reoptimizando algo que ya les rankea, y eso señala dónde ven valor.

**Competidor y medio no se leen igual.** Que un competidor publique sobre un tema dice dónde invierte un rival. Que un MEDIO publique sobre él dice de qué se habla en el sector, y además es una pista de qué acepta ese medio: si Multifamily Dive lleva tres semanas con historias de datos, un pitch de producto no va a entrar.

**Competidor y medio no se leen igual.** Que un competidor publique sobre un tema dice dónde invierte un rival. Que un MEDIO publique sobre él dice de qué se habla en el sector, y además es una pista de qué acepta ese medio: si Multifamily Dive lleva tres semanas con historias de datos, un pitch de producto no va a entrar.

**Lo que este archivo NO prueba:** que hayan publicado algo que su sitemap no declare, ni lo que publican fuera de su sitio (LinkedIn, newsletter, podcast). Un sitemap vacío o inaccesible significa que no se pudo leer, nunca que no publicaron.
`;

fs.writeFileSync("data/competitor-watch.md", md);
console.log(`\nescrito data/competitor-watch.md y ${DIR}/${today}.json`);
