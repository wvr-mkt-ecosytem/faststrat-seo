// Arregla los slugs cortados a media palabra: renombra el post y deja un 301.
//
// El orden importa y no es intercambiable:
//   1. Se crea la redirección ANTES de renombrar. Si se hace al revés, entre
//      los dos pasos la URL vieja devuelve 404 a quien llegue desde Google.
//   2. Se renombra el post.
//   3. Se comprueba que la vieja redirige y que la nueva responde 200.
//
// Por defecto NO toca nada: hay que pasar --aplicar. Cambiar el slug de una
// página indexada tarda semanas en reevaluarse y no tiene deshacer.
//
//   node scripts/arreglar-slugs.mjs            (solo enseña el plan)
//   node scripts/arreglar-slugs.mjs --aplicar
import fs from "fs";

const APLICAR = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const BASE = env.WP_URL.replace(/\/$/, "");
const AUTH = "Basic " + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASSWORD.replace(/\s/g, "")}`).toString("base64");

const api = async (ruta, init = {}) => {
  const r = await fetch(`${BASE}/wp-json/${ruta}`, {
    ...init,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${ruta} -> ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};

/** Sin seguir redirecciones, para poder VER si hay 301 y a dónde. */
const cabeza = (url) =>
  fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) })
    .then((r) => ({ status: r.status, location: r.headers.get("location") }))
    .catch((e) => ({ status: 0, error: e.message }));

// Los que el informe manda CONSOLIDAR: esos desaparecen redirigidos a otra
// página, así que renombrarlos sería trabajo tirado y además dejaría dos
// redirecciones encadenadas sobre la misma URL.
const NO_TOCAR = new Set([
  "hubspot-breeze-vs-jasper-ai-vs-copy-ai-in-2026-which-ai-tool",
  "best-seo-tools-for-small-businesses-in-2026-honest-reviews-p",
]);

const todos = JSON.parse(fs.readFileSync("data/slugs-truncados.json", "utf8"));
const objetivos = todos.filter((x) => !NO_TOCAR.has(x.actual));

console.log(`${todos.length} slugs cortados; ${NO_TOCAR.size} se consolidan aparte; ${objetivos.length} a renombrar.\n`);
if (!APLICAR) console.log("MODO PLAN. Nada se toca. Añade --aplicar para ejecutar.\n");

for (const t of objetivos) {
  console.log(`#${t.id}  ${t.titulo.slice(0, 60)}`);
  console.log(`   /${t.actual}/  ->  /${t.propuesto}/`);

  if (!APLICAR) { console.log(""); continue; }

  try {
    // 1) La redirección primero, para que no haya ni un segundo de 404.
    await api("redirection/v1/redirect", {
      method: "POST",
      body: JSON.stringify({
        url: `/${t.actual}/`,
        action_data: { url: `/${t.propuesto}/` },
        match_type: "url",
        action_type: "url",
        action_code: 301,
        group_id: 1,
        title: `Slug truncado: ${t.actual}`,
      }),
    });
    console.log("   301 creada");

    // 2) Renombrar.
    const guardado = await api(`wp/v2/posts/${t.id}`, {
      method: "POST",
      body: JSON.stringify({ slug: t.propuesto }),
    });
    console.log(`   renombrado: ${guardado.slug}`);

    // 3) Comprobar el resultado, no la intención.
    const vieja = await cabeza(`${BASE}/${t.actual}/`);
    const nueva = await cabeza(`${BASE}/${t.propuesto}/`);
    const okVieja = [301, 308].includes(vieja.status);
    console.log(`   ${okVieja ? "✓" : "✗"} vieja -> ${vieja.status}${vieja.location ? " -> " + vieja.location : ""}`);
    console.log(`   ${nueva.status === 200 ? "✓" : "✗"} nueva -> ${nueva.status}`);
    if (!okVieja) {
      console.log("     (si sale 200, es la caché de LiteSpeed: purga en Toolbox -> Purge All)");
    }
  } catch (e) {
    console.log(`   ✗ ${e.message}`);
  }
  console.log("");
}

console.log(
  APLICAR
    ? "Hecho. Si alguna vieja devolvió 200, purga la caché de LiteSpeed y vuelve a comprobar."
    : "Plan mostrado. Nada cambiado.",
);
