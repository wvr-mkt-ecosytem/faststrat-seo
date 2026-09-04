// La revisión completa del sistema, eslabón por eslabón.
//
// POR QUÉ EXISTE: hoy se han encontrado seis fallos y CINCO eran credenciales
// caducadas o variables mal puestas, no código: la clave de Resend muerta, la
// contraseña de WordPress muerta, el secret de Google viejo en Render,
// ACCIONES_PUBLICAS sin poner, un token de GitHub de solo lectura. Todos daban
// el mismo síntoma inútil desde la pantalla, y cada uno costó una investigación
// entera.
//
// Esto los encuentra en dos minutos y sin gastar cupo de agente. La regla:
// cada comprobación prueba la CAPACIDAD REAL, no que la variable exista. Una
// clave presente y caducada es exactamente el caso que nos ha costado el día.
//
//   node scripts/revision-completa.mjs           (local, sin gastar agente)
//   node scripts/revision-completa.mjs --prod    (además, contra producción)
import fs from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

for (const archivo of [".env.local", ".env"]) {
  if (!fs.existsSync(archivo)) continue;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  break;
}

register(
  "data:text/javascript," +
    encodeURIComponent(`
  const raiz = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
  export async function resolve(e, c, s) {
    if (e.startsWith("@/")) return s(new URL(e.slice(2) + ".ts", raiz).href, c);
    return s(e, c);
  }`),
  import.meta.url,
);

const PROD = process.argv.includes("--prod");
const BASE = process.env.APP_BASE_URL || "https://faststrat-seo.onrender.com";
const traer = (u, o = {}) => fetch(u, { ...o, signal: AbortSignal.timeout(o.timeout ?? 120000) });

const resultados = [];
let seccion = "";

const titulo = (t) => {
  seccion = t;
  console.log(`\n${t}`);
};

/** Corre una comprobación y la apunta. `fn` devuelve texto, o lanza. */
async function comprobar(nombre, fn, { critico = true } = {}) {
  try {
    const detalle = await fn();
    console.log(`  ok    ${nombre}${detalle ? `  · ${detalle}` : ""}`);
    resultados.push({ seccion, nombre, ok: true });
  } catch (e) {
    const msg = (e?.message ?? String(e)).replace(/\s+/g, " ").slice(0, 150);
    console.log(`  ${critico ? "FALLA" : "aviso"} ${nombre}  · ${msg}`);
    resultados.push({ seccion, nombre, ok: false, critico, msg });
  }
}

const exige = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ─── 1. Lo que hace falta para escribir ────────────────────────────────────
titulo("CREDENCIALES");

await comprobar("Claude (token de la suscripción)", async () => {
  exige(process.env.CLAUDE_CODE_OAUTH_TOKEN, "falta CLAUDE_CODE_OAUTH_TOKEN");
  // No se llama al agente: costaría cupo. Solo se comprueba la forma.
  return "presente (no se prueba: gastaría cupo)";
});

await comprobar("Google · Search Console", async () => {
  const r = await traer("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  exige(j.access_token, j.error_description || j.error || `HTTP ${r.status}`);
  return "el refresh token sigue vivo";
});

await comprobar("Google · GA4", async () => {
  exige(process.env.GOOGLE_MEASUREMENT_REFRESH_TOKEN, "falta GOOGLE_MEASUREMENT_REFRESH_TOKEN");
  const r = await traer("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_MEASUREMENT_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  exige(j.access_token, j.error_description || j.error || `HTTP ${r.status}`);
  return "el refresh token sigue vivo";
});

const wpAuth =
  "Basic " +
  Buffer.from(`${process.env.WP_USER}:${(process.env.WP_APP_PASSWORD || "").replace(/ /g, "")}`).toString("base64");

await comprobar("WordPress · autentica", async () => {
  const r = await traer(`${process.env.WP_URL}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: wpAuth },
  });
  const j = await r.json();
  // Es LA comprobación que faltaba: la clave estaba presente y muerta, y el
  // síntoma era "no se puede publicar" sin decir por qué.
  exige(r.status === 200, `${j.code ?? r.status}: ${j.message ?? ""}`);
  return `${j.name} · ${(j.roles ?? []).join(",")}`;
});

await comprobar("WordPress · puede publicar", async () => {
  const r = await traer(`${process.env.WP_URL}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: wpAuth },
  });
  const j = await r.json();
  exige(j.capabilities?.publish_posts, "al usuario le falta publish_posts");
  return "sí";
});

await comprobar("WordPress · puede crear redirecciones", async () => {
  const r = await traer(`${process.env.WP_URL}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: wpAuth },
  });
  const j = await r.json();
  exige(j.capabilities?.rank_math_redirections, "falta rank_math_redirections (Rank Math → Role Manager)");
  return "sí · el botón del 301 funciona";
});

await comprobar("Resend · puede enviar", async () => {
  exige(process.env.RESEND_API_KEY, "falta RESEND_API_KEY");
  // Se pregunta por los dominios: es la llamada más barata que exige una clave
  // válida. Mandar un correo de prueba llenaría la bandeja en cada revisión.
  const r = await traer("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  exige(r.status === 200, `la clave no vale (HTTP ${r.status})`);
  exige(process.env.REPORT_EMAIL_TO, "la clave vale pero falta REPORT_EMAIL_TO");
  return `válida · avisa a ${process.env.REPORT_EMAIL_TO}`;
});

await comprobar("GitHub · el token puede escribir", async () => {
  const r = await traer(`https://api.github.com/repos/${process.env.GIT_PERSIST_REPO}`, {
    headers: { Authorization: `Bearer ${process.env.GIT_PERSIST_TOKEN}`, "User-Agent": "revision" },
  });
  const j = await r.json();
  exige(r.status === 200, `${r.status}: ${j.message ?? ""}`);
  exige(j.permissions?.push, "el token no tiene permiso de escritura sobre el repositorio");
  return `${j.full_name} · push sí`;
});

// ─── 2. Las fuentes de datos ───────────────────────────────────────────────
titulo("DATOS");

await comprobar("Search Console devuelve filas", async () => {
  const { queryAnalytics } = await import("@/lib/gsc");
  const { rows } = await queryAnalytics("page", 28, 100);
  exige(rows.length > 0, "cero filas: o el sitio no tiene tráfico o la propiedad no es la correcta");
  return `${rows.length} páginas`;
});

await comprobar("El catálogo ve los artículos publicados", async () => {
  const { listarTitulos } = await import("@/lib/wordpress");
  const r = await listarTitulos();
  exige(!r.error, r.error);
  exige(r.posts.length > 0, "cero artículos: la comprobación de canibalización estaría ciega");
  return `${r.posts.length} artículos`;
});

await comprobar("Google Trends responde", async () => {
  const { tendencia } = await import("@/lib/trends");
  const t = await tendencia("whatsapp business", { geo: "CO" });
  exige(t, "sin respuesta (el endpoint no es oficial y limita el ritmo)");
  return `${t.direccion} · ${t.cambioAnual}%`;
}, { critico: false });

await comprobar("Autocomplete responde", async () => {
  const { candidatas } = await import("@/lib/sugerencias");
  const c = await candidatas("whatsapp marketing", { letras: 2 });
  const total = c.directas.length + c.ampliadas.length;
  exige(total > 0, "sin sugerencias");
  return `${total} sugerencias`;
}, { critico: false });

// ─── 3. Las compuertas ─────────────────────────────────────────────────────
titulo("COMPUERTAS");

await comprobar("Detecta un título que se pisa", async () => {
  const { listarTitulos } = await import("@/lib/wordpress");
  const { revisarTitulo } = await import("@/lib/catalogo");
  const uno = (await listarTitulos()).posts[0];
  exige(uno, "no hay artículos con los que probar");
  const v = await revisarTitulo(uno.title);
  exige(!v.ok, `no detectó que "${uno.title.slice(0, 40)}" ya existe`);
  return "sí";
});

await comprobar("Deja pasar un título nuevo", async () => {
  const { revisarTitulo } = await import("@/lib/catalogo");
  const v = await revisarTitulo("Cómo elegir proveedor de cemento blanco en Groenlandia");
  exige(v.ok, "bloqueó un título que no se parece a nada");
  return "sí";
});

await comprobar("Bloquea una cifra sin fuente", async () => {
  const { runQa } = await import("@/lib/qa");
  const { CASA } = await import("@/lib/publicable");
  const r = runQa({ title: "T", markdown: "El 73% de las PYMEs usa esto.", house: CASA });
  exige(r.blocking.some((f) => f.rule === "figure-without-source"), "dejó pasar una cifra sin fuente");
  return "sí";
});

await comprobar("Bloquea un ancla fuera de categoría", async () => {
  const { runQa } = await import("@/lib/qa");
  const { CASA } = await import("@/lib/publicable");
  const { CLIENTE } = await import("@/lib/cliente");
  const r = runQa({
    title: "T",
    markdown: `Ver [${CLIENTE.categoriaProhibida[0]} tools](https://${CLIENTE.dominio}/x).`,
    house: CASA,
  });
  exige(r.blocking.some((f) => f.rule === "anchor-off-category"), "dejó pasar el ancla equivocada");
  return "sí";
});

await comprobar("Avisa de precios sin fuente primaria", async () => {
  const { runQa } = await import("@/lib/qa");
  const { CASA } = await import("@/lib/publicable");
  const r = runQa({
    title: "T",
    markdown: "Cuesta $0.06 por mensaje, [según un proveedor](https://vendor-cualquiera.com/precios).",
    house: CASA,
  });
  exige(r.warnings.some((f) => f.rule === "pricing-not-from-primary-source"), "no avisó");
  return "sí";
});

await comprobar("Separa los marcadores en cualquier orden", async () => {
  const { partir } = await import("@/lib/diferencial");
  const r = partir("<<<ARTICULO>>>\n# T\ncuerpo\n<<<KEYWORD>>>\nrazonamiento interno");
  exige(!/<<<|razonamiento interno/.test(r.markdown), "el razonamiento se coló en el artículo");
  exige(r.keyword, "perdió el razonamiento de la keyword");
  return "sí";
});

// ─── 4. Producción ─────────────────────────────────────────────────────────
if (PROD) {
  titulo("PRODUCCIÓN (Render)");

  for (const [nombre, ruta] of [
    ["Search Console", "/api/gsc?days=28"],
    ["GA4", "/api/ga4?days=28"],
    ["Informes guardados", "/api/ga4/analyst"],
    ["Caducidad", "/api/caducidad"],
  ]) {
    await comprobar(nombre, async () => {
      const r = await traer(BASE + ruta, { timeout: 180000 });
      const j = await r.json().catch(() => ({}));
      exige(r.status === 200, `HTTP ${r.status}`);
      exige(!j.error, j.error);
      return "responde";
    });
  }

  await comprobar("Las acciones no están bloqueadas por permisos", async () => {
    // Una keyword que choca: contesta 409 sin lanzar trabajo ni gastar cupo.
    const { listarTitulos } = await import("@/lib/wordpress");
    const uno = (await listarTitulos()).posts[0];
    // Va con keyword además del título: sin ella la ruta contesta 400 por
    // parámetros y la comprobación pasaba sin haber probado nada.
    const r = await traer(`${BASE}/api/blog/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: uno.title, title: uno.title, lang: "en" }),
      timeout: 180000,
    });
    exige(r.status !== 401, "401: falta ACCIONES_PUBLICAS=true en Render");
    exige(r.status === 409, `se esperaba un 409 por choque y llegó ${r.status}: la comprobación no probó nada`);
    return "sí · y detectó el choque sin lanzar trabajo";
  });

  await comprobar("Producción autentica en WordPress", async () => {
    const r = await traer(`${BASE}/api/blog/title-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Una comprobación cualquiera" }),
      timeout: 180000,
    });
    const j = await r.json();
    exige(!j.aviso, j.aviso);
    return `compara ${j.comparados} títulos`;
  });
}

// ─── 5. Lo automático ──────────────────────────────────────────────────────
titulo("AUTOMATIZACIÓN");

const gh = (ruta) =>
  traer(`https://api.github.com/repos/${process.env.GIT_PERSIST_REPO}/${ruta}`, {
    headers: { Authorization: `Bearer ${process.env.GIT_PERSIST_TOKEN}`, "User-Agent": "revision" },
  });

await comprobar("Los dos workflows están activos", async () => {
  const j = await (await gh("actions/workflows")).json();
  const nuestros = (j.workflows ?? []).filter((w) => /escribir\.yml|weekly\.yml/.test(w.path));
  exige(nuestros.length === 2, `se encontraron ${nuestros.length} de 2`);
  const apagado = nuestros.find((w) => w.state !== "active");
  exige(!apagado, `${apagado?.name} está ${apagado?.state}`);
  return "escribir + semanal";
});

await comprobar("Actions tiene todos los secrets", async () => {
  const j = await (await gh("actions/secrets?per_page=100")).json();
  const hay = new Set((j.secrets ?? []).map((s) => s.name));
  const faltan = [
    "CLAUDE_CODE_OAUTH_TOKEN",
    "WP_URL",
    "WP_USER",
    "WP_APP_PASSWORD",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_MEASUREMENT_REFRESH_TOKEN",
    "GSC_SITE_URL",
    "GA4_PROPERTY_ID",
    "RESEND_API_KEY",
    "REPORT_EMAIL_TO",
  ].filter((k) => !hay.has(k));
  exige(faltan.length === 0, `faltan: ${faltan.join(", ")}`);
  return `${hay.size} configurados`;
});

await comprobar("El cron semanal sigue programado", async () => {
  const yml = fs.readFileSync(".github/workflows/weekly.yml", "utf8");
  const m = yml.match(/cron:\s*"([^"]+)"/);
  exige(m, "el workflow ya no tiene horario");
  // Los comentarios NO cuentan. La primera versión de esto buscaba "curl" en
  // todo el fichero y saltaba por el comentario que explica que ANTES se usaba:
  // una comprobación que falla por leer su propia documentación.
  const sinComentarios = yml
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");
  exige(!/curl/.test(sinComentarios), "el cron sigue llamando a Render por curl");
  return `${m[1]} · sin pasar por Render`;
});

await comprobar("La última corrida semanal salió bien", async () => {
  const j = await (await gh("actions/runs?per_page=5")).json();
  const ultima = (j.workflow_runs ?? []).find((r) => /weekly/.test(r.path ?? ""));
  exige(ultima, "no hay corridas");
  exige(ultima.conclusion === "success", `la última salió "${ultima.conclusion}" (${ultima.created_at?.slice(0, 10)})`);
  return ultima.created_at?.slice(0, 10);
}, { critico: false });

// ─── Resumen ───────────────────────────────────────────────────────────────
const fallan = resultados.filter((r) => !r.ok && r.critico);
const avisos = resultados.filter((r) => !r.ok && !r.critico);
console.log(`\n${"─".repeat(64)}`);
console.log(`${resultados.filter((r) => r.ok).length} de ${resultados.length} comprobaciones bien.`);
if (avisos.length) {
  console.log(`\n${avisos.length} aviso(s) — no impiden funcionar:`);
  for (const r of avisos) console.log(`  · ${r.nombre}: ${r.msg}`);
}
if (fallan.length) {
  console.log(`\n${fallan.length} FALLO(S) que sí impiden funcionar:`);
  for (const r of fallan) console.log(`  · [${r.seccion}] ${r.nombre}: ${r.msg}`);
  process.exit(1);
}
console.log("\nEl circuito está entero.");
if (!PROD) console.log("(--prod añade las comprobaciones contra el servidor de producción)");
