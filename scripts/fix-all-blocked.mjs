// Pasa el corrector por todos los artículos que la compuerta bloquea.
//
// En serie y no en paralelo: cada corrección escribe el archivo y hace commit,
// y varias a la vez se pisarían en el mismo repo. Además el agente busca en la
// web, así que lanzarlos todos de golpe solo adelanta el límite de peticiones.
//
// Uso: node scripts/fix-all-blocked.mjs   (el servidor debe estar en :3100)
import fs from "node:fs";
import http from "node:http";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim()]),
);
const AUTH = "Basic " + Buffer.from(`${env.DASHBOARD_USER}:${env.DASHBOARD_PASSWORD}`).toString("base64");

// http nativo y no fetch: undici corta a los 5 minutos y una corrección tarda
// más que eso. El servidor terminaba bien y el cliente reportaba "fetch failed".
const pedir = (ruta, cuerpo) =>
  new Promise((res, rej) => {
    const body = JSON.stringify(cuerpo);
    const req = http.request(
      { host: "localhost", port: 3100, path: ruta, method: "POST",
        headers: { Authorization: AUTH, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch { rej(new Error(d.slice(0, 200))); } }); },
    );
    req.setTimeout(0);
    req.on("error", rej);
    req.end(body);
  });

const lista = await new Promise((res, rej) => {
  http.get({ host: "localhost", port: 3100, path: "/api/blog", headers: { Authorization: AUTH } }, (r) => {
    let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d).posts ?? []));
  }).on("error", rej);
});

console.log(`\n${lista.length} artículos. Corrigiendo los que estén bloqueados…\n`);

let arreglados = 0, parciales = 0, intactos = 0, fallos = 0;
for (const p of lista) {
  const t0 = Date.now();
  try {
    const r = await pedir("/api/blog/fix", { slug: p.slug });
    const min = ((Date.now() - t0) / 60000).toFixed(1);
    // Un error de la ruta llega como {error}, sin `qa`. Antes se leía como
    // "0 -> 0" y se contaba como corrección parcial: dieciséis fallos seguidos
    // se imprimieron como si el corrector hubiera trabajado.
    if (r.error || !r.qa) {
      fallos++;
      console.log(`  ERROR   ${p.slug.slice(0, 50).padEnd(52)} ${String(r.error ?? "respuesta sin qa").slice(0, 70)}`);
      continue;
    }
    const antes = r.qa?.antes?.blocking?.length ?? 0;
    const despues = r.qa?.despues?.blocking?.length ?? 0;
    if (!r.changed && r.publishable) { intactos++; console.log(`  ok      ${p.slug.slice(0, 50).padEnd(52)} ya pasaba`); }
    else if (r.publishable) { arreglados++; console.log(`  ARREGLADO ${p.slug.slice(0, 48).padEnd(50)} ${antes} -> 0   (${min} min)`); }
    else { parciales++; console.log(`  parcial ${p.slug.slice(0, 50).padEnd(52)} ${antes} -> ${despues}  (${min} min)`); }
  } catch (e) {
    fallos++;
    console.log(`  ERROR   ${p.slug.slice(0, 50).padEnd(52)} ${String(e.message).slice(0, 60)}`);
  }
}

console.log(`\n${arreglados} publicables, ${parciales} a medias, ${intactos} ya pasaban, ${fallos} con error.`);
