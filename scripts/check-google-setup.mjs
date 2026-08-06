// Dice exactamente en qué punto está la reconexión con Google.
//
// Existe porque el 6 de agosto de 2026 se borró el proyecto de Google Cloud, y
// con él los clientes OAuth y todos los tokens emitidos. Reconstruir eso son
// siete pasos en dos consolas distintas, y sin comprobar es fácil creer que
// falta uno cuando falta otro: el error de Google es el mismo ("no autorizado")
// tanto si falta habilitar la API como si el token es de otro cliente.
//
// Cada línea dice qué falta Y qué hacer. Un diagnóstico que no dice el paso
// siguiente obliga a adivinar, que es lo que se quiere evitar.
//
// Uso:  node scripts/check-google-setup.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

if (!fs.existsSync(envPath)) {
  console.log("No hay .env.local en el repo. Nada que comprobar.");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim()]),
);

const ok = (s) => "  [ok]    " + s;
const no = (s) => "  [FALTA] " + s;

console.log("\nEstado de la conexión con Google\n");

// 1. El cliente OAuth.
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  console.log(no("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no están en .env.local"));
  console.log(
    "          Crea un proyecto en console.cloud.google.com, y dentro un cliente OAuth\n" +
      "          de tipo 'Aplicación web' con esta URI de redirección EXACTA:\n" +
      "            http://localhost:9876/oauth2callback\n",
  );
  process.exit(1);
}
console.log(ok(`cliente OAuth configurado (${env.GOOGLE_CLIENT_ID.slice(0, 22)}…)`));

// 2. Cada token contra su API. Se prueba de verdad: que la variable exista no
//    significa que sirva, y esa distinción es justo la que costó la tarde.
const { google } = await import("googleapis");

async function probe(label, tokenVar, test) {
  const token = env[tokenVar];
  if (!token) {
    console.log(no(`${label}: falta ${tokenVar}`));
    return false;
  }
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: token });
  try {
    await auth.getAccessToken();
  } catch (e) {
    const d = (e.response && e.response.data) || {};
    const err = d.error || e.message;
    if (/deleted_client/i.test(err)) {
      console.log(no(`${label}: el CLIENTE OAuth fue borrado`));
      console.log(
        "          Reautorizar no sirve: la aplicación que pediría permiso ya no existe.\n" +
          "          Hay que crear un cliente nuevo y volver a emitir TODOS los tokens.\n",
      );
    } else {
      console.log(no(`${label}: ${err} — ${d.error_description || ""}`));
    }
    return false;
  }
  try {
    await test(auth);
    console.log(ok(`${label}: responde`));
    return true;
  } catch (e) {
    const msg = String(e.message || e);
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
      console.log(no(`${label}: el token vale, pero la API no está habilitada en el proyecto`));
      console.log("          Habilítala en console.cloud.google.com > APIs y servicios > Biblioteca\n");
    } else if (/permission|403/i.test(msg)) {
      console.log(no(`${label}: autorizado, pero esa cuenta no tiene acceso al recurso`));
      console.log("          Suele ser haber autorizado con la cuenta de Google equivocada\n");
    } else {
      console.log(no(`${label}: ${msg.slice(0, 120)}`));
    }
    return false;
  }
}

const results = [];

results.push(
  await probe("Search Console", "GOOGLE_REFRESH_TOKEN", async (auth) => {
    await google.searchconsole({ version: "v1", auth }).sites.list();
  }),
);

results.push(
  await probe("Tag Manager", "GOOGLE_MEASUREMENT_REFRESH_TOKEN", async (auth) => {
    await google.tagmanager({ version: "v2", auth }).accounts.list();
  }),
);

results.push(
  await probe("GA4 (Analytics Data)", "GOOGLE_MEASUREMENT_REFRESH_TOKEN", async (auth) => {
    const prop = env.GA4_PROPERTY_ID || "503953510";
    await google.analyticsdata({ version: "v1beta", auth }).properties.runReport({
      property: `properties/${prop}`,
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [{ name: "sessions" }],
      },
    });
  }),
);

const faltan = results.filter((r) => !r).length;
console.log(
  faltan === 0
    ? "\nTodo conectado.\n"
    : `\n${faltan} de ${results.length} sin conectar. Los pasos están arriba, en orden.\n` +
        "Cuando queden en [ok], copia las mismas variables a Render o producción seguirá rota.\n",
);
