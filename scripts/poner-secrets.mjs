// Pone en GitHub Actions los secrets y variables que necesita escribir.
//
// Lee los valores de .env.local, que es la fuente que ya funciona, y los sube
// cifrados con la clave pública del repositorio (que es como exige la API: el
// valor nunca viaja en claro).
//
// Sin esto, el botón "Escribir" encarga trabajos que fallan: el de Actions no
// tiene acceso ni al agente, ni a WordPress, ni a Search Console.
//
//   node scripts/poner-secrets.mjs            (enseña qué haría)
//   node scripts/poner-secrets.mjs --aplicar
import fs from "node:fs";
import sodium from "libsodium-wrappers";

const APLICAR = process.argv.includes("--aplicar");

const env = {};
for (const linea of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = linea.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const REPO = env.GIT_PERSIST_REPO;
const TOKEN = env.GIT_PERSIST_TOKEN;
if (!REPO || !TOKEN) {
  console.error("Faltan GIT_PERSIST_REPO o GIT_PERSIST_TOKEN en .env.local");
  process.exit(1);
}

// Secretos: valores que no deben poder leerse una vez guardados.
const SECRETS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "WP_URL",
  "WP_USER",
  "WP_APP_PASSWORD",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GSC_SITE_URL",
  // Los añadidos al mover la corrida semanal fuera de Render: el analista
  // necesita GA4, y el aviso necesita Resend. Sin estos, el lunes corre y no
  // avisa a nadie, que es como estuvo semanas.
  "GOOGLE_MEASUREMENT_REFRESH_TOKEN",
  "GA4_PROPERTY_ID",
  "RESEND_API_KEY",
  "REPORT_EMAIL_TO",
  "APP_BASE_URL",
];

// Variables: configuración, no secretos. Van aparte para poder leerlas y
// corregirlas sin tener que volver a escribirlas enteras.
const VARIABLES = {
  CLIENTE_NOMBRE: env.CLIENTE_NOMBRE ?? "FastStrat",
  CLIENTE_DOMINIO: env.CLIENTE_DOMINIO ?? "faststrat.ai",
  CLIENTE_DOMINIO_APP: env.CLIENTE_DOMINIO_APP ?? "app.faststrat.ai",
  CLIENTE_AUTOR: env.CLIENTE_AUTOR ?? "Walter Von Roestel",
  CLIENTE_QUE_HACE:
    env.CLIENTE_QUE_HACE ?? "plataforma de agentes de IA de marketing para PYMEs y agencias pequeñas",
};

const api = (ruta, init = {}) =>
  fetch(`https://api.github.com/repos/${REPO}/${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "seo-dashboard",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60000),
  });

console.log(`Repositorio: ${REPO}\n`);

const faltan = SECRETS.filter((k) => !env[k]);
console.log("SECRETS (valores ocultos una vez guardados):");
for (const k of SECRETS) {
  console.log(`  ${env[k] ? "✓" : "✗ FALTA en .env.local"}  ${k}`);
}
console.log("\nVARIABLES (configuración, legible):");
for (const [k, v] of Object.entries(VARIABLES)) console.log(`  ✓  ${k} = ${v.slice(0, 48)}`);

if (faltan.length) {
  console.log(`\nOJO: faltan ${faltan.length} en .env.local. Sin ellos el trabajo de Actions falla.`);
}
if (!APLICAR) {
  console.log("\nMODO PLAN. Nada se ha subido. Añade --aplicar.");
  process.exit(0);
}

// La API exige el valor cifrado con la clave pública del repositorio. Es lo que
// hace que el secreto no viaje en claro ni siquiera hacia GitHub.
const clave = await (await api("actions/secrets/public-key")).json();
if (!clave.key) {
  console.error("No se pudo leer la clave pública del repositorio:", JSON.stringify(clave).slice(0, 200));
  console.error("Suele ser que el token no tiene permiso sobre Actions (scope 'repo' o 'workflow').");
  process.exit(1);
}

await sodium.ready;
const cifrar = (valor) =>
  sodium.to_base64(
    sodium.crypto_box_seal(sodium.from_string(valor), sodium.from_base64(clave.key, sodium.base64_variants.ORIGINAL)),
    sodium.base64_variants.ORIGINAL,
  );

console.log("\nSubiendo…");
let ok = 0;
for (const k of SECRETS) {
  if (!env[k]) continue;
  const r = await api(`actions/secrets/${k}`, {
    method: "PUT",
    body: JSON.stringify({ encrypted_value: cifrar(env[k]), key_id: clave.key_id }),
  });
  const bien = r.status === 201 || r.status === 204;
  if (bien) ok++;
  console.log(`  ${bien ? "✓" : "✗ " + r.status}  ${k}`);
}

for (const [k, v] of Object.entries(VARIABLES)) {
  // Las variables no se cifran, y crear una que ya existe da 409: en ese caso
  // se actualiza. Es lo normal al volver a correr esto.
  let r = await api("actions/variables", { method: "POST", body: JSON.stringify({ name: k, value: v }) });
  if (r.status === 409) {
    r = await api(`actions/variables/${k}`, { method: "PATCH", body: JSON.stringify({ name: k, value: v }) });
  }
  const bien = r.status === 201 || r.status === 204;
  if (bien) ok++;
  console.log(`  ${bien ? "✓" : "✗ " + r.status}  ${k} (variable)`);
}

console.log(`\n${ok} de ${SECRETS.filter((k) => env[k]).length + Object.keys(VARIABLES).length} configurados.`);
