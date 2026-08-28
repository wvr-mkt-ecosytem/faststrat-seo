// Escribe un artículo desde GitHub Actions, no desde el servidor web.
//
// POR QUÉ AQUÍ. En el plan gratuito de Render, escribir mata la instancia: el
// agente se come la CPU, el health check deja de responder en 5 segundos,
// Render da el servicio por caído y lo reinicia. Medido: 502 a los 3,2 minutos
// y la alerta "health check timed out after 5 seconds". Actions tiene CPU de
// verdad y seis horas de margen.
//
// La lógica NO está aquí: se importa de lib/escribir.ts, la misma que usa la
// ruta web. Reescribirla habría garantizado que las dos se separaran.
//
//   node scripts/escribir.mjs --keyword "..." --title "..." --lang en
import fs from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Cargar .env.local a mano.
//
// Next lo hace solo; un script de Node no. Sin esto el agente corría SIN el
// token y el SDK caía a otra credencial, devolviendo "Credit balance is too
// low": un error que parece del saldo de la cuenta y era de configuración. En
// Actions no hace falta —las variables vienen de los secrets— pero en local sí,
// y un script que solo funciona en un sitio no sirve para probar el otro.
for (const archivo of [".env.local", ".env"]) {
  if (!fs.existsSync(archivo)) continue;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const clave = t.slice(0, i).trim();
    // Lo que ya venga del entorno manda: en Actions son los secrets.
    if (!process.env[clave]) process.env[clave] = t.slice(i + 1).trim();
  }
  break;
}

// El alias "@/" solo lo entiende el bundler de Next. Aquí se resuelve a mano
// para poder importar la misma librería sin duplicar nada.
register(
  "data:text/javascript," +
    encodeURIComponent(`
  const raiz = ${JSON.stringify(pathToFileURL(process.cwd() + "/").href)};
  export async function resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith("@/")) {
      return siguiente(new URL(especificador.slice(2) + ".ts", raiz).href, contexto);
    }
    return siguiente(especificador, contexto);
  }
`),
  import.meta.url,
);

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}

if (!args.keyword && !args.topic) {
  console.error("Falta --keyword o --topic");
  process.exit(1);
}

const { escribirArticulo } = await import("@/lib/escribir");

const t0 = Date.now();
console.log(`Escribiendo: ${args.title ?? args.keyword ?? args.topic}`);
console.log(`idioma: ${args.lang ?? "en"} · categoría: ${args.category ?? "SEO"}`);

const r = await escribirArticulo({
  keyword: args.keyword,
  topic: args.topic,
  title: args.title,
  lang: args.lang ?? "en",
  category: args.category ?? "SEO",
  force: args.force === "true",
  publishAt: args.publishAt || undefined,
  publicar: args.publicar === "true",
  enVivo: args.enVivo !== "false",
});

const min = ((Date.now() - t0) / 60000).toFixed(1);

if (!r.ok) {
  console.error(`\n[${min} min] NO se escribió (${r.estado}): ${r.error}`);
  if (r.explicacion) console.error(`  ${r.explicacion}`);
  if (r.comoSeguir) console.error(`  ${r.comoSeguir}`);
  // Un choque de títulos NO es un fallo del trabajo: es el sistema haciendo su
  // trabajo. Sale con 0 para que el correo de GitHub no diga "run failed"
  // cuando lo que pasó es que se evitó una canibalización.
  process.exit(r.estado === 409 ? 0 : 1);
}

console.log(`\n[${min} min] LISTO: ${r.title}`);
console.log(`  slug:        ${r.slug}`);
console.log(`  palabras:    ${r.wordCount}`);
console.log(`  autor:       ${r.author}`);
if (r.keywordTrend) console.log(`  demanda:     ${r.keywordTrend.direccion} ${r.keywordTrend.cambioAnual}%`);
if (r.diferencial) console.log(`  diferencial: ${r.diferencial.slice(0, 160)}`);
if (r.pendientes?.length) console.log(`  pendientes:  ${r.pendientes.length} bloqueo(s) sin resolver`);

// Lo que se quitó se DICE. Quitar un dato cambia lo que el artículo afirma, y
// quien lo publica tiene derecho a saber qué desapareció.
if (r.quitadas?.length) {
  console.log(`  quitadas:    ${r.quitadas.length} cifra(s) sin fuente pública:`);
  for (const q of r.quitadas) console.log(`     - ${q.slice(0, 90)}`);
}

if (r.publicacion) {
  console.log(
    r.publicacion.ok
      ? `  WordPress:   ${r.publicacion.estado} · ${r.publicacion.link}`
      : `  WordPress:   NO se publicó · ${r.publicacion.motivo}`,
  );
  // No publicar no es un fallo del trabajo: el artículo está escrito y
  // guardado, y publicarlo después es un clic. Marcar esto en rojo entrenaría
  // a ignorar los correos de error.
}
