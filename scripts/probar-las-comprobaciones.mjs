// Las pruebas de las pruebas.
//
// POR QUÉ EXISTE: en un solo día, DOS de mis comprobaciones estaban rotas y las
// dos daban un diagnóstico falso con toda seguridad.
//
//   · La de Google Trends llamaba tendencia(termino, {geo:"CO"}) cuando el
//     segundo parámetro es un string. Devolvía null, que es el mismo síntoma
//     que si Google no respondiera, y el informe dijo "Trends no responde"
//     durante una investigación entera. Trends funcionaba perfectamente.
//   · La del cron miraba las 5 corridas más recientes del repositorio; un par
//     de artículos desplazaban a la semanal y decía "no hay corridas" como si
//     el cron nunca hubiera funcionado.
//
// Una comprobación que no se comprueba es una opinión con formato de dato. Aquí
// cada una se somete a lo que debería detectar: si le das el caso malo tiene
// que fallar, y si le das el bueno tiene que pasar. Una que nunca falla no está
// midiendo nada.
//
//   node scripts/probar-las-comprobaciones.mjs
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

let fallos = 0;
const comprobar = (nombre, condicion, detalle = "") => {
  console.log(`  ${condicion ? "ok  " : "MAL "} ${nombre}${detalle ? "  · " + detalle : ""}`);
  if (!condicion) fallos++;
};

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nLAS FIRMAS QUE SE LLAMAN DESDE .mjs");
// Los scripts no pasan por TypeScript, así que una llamada mal escrita no la
// caza nadie. Las funciones que se usan desde scripts tienen que quejarse.
{
  const { tendencia } = await import("@/lib/trends");
  let aviso = false;
  try {
    await tendencia("x", { geo: "CO" });
  } catch {
    aviso = true;
  }
  comprobar("tendencia() rechaza un geo que no es texto", aviso, "el fallo que costó una investigación");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nLA REVISIÓN COMPLETA, LEÍDA");
{
  const src = fs.readFileSync("scripts/revision-completa.mjs", "utf8");

  // La del cron: tiene que preguntar por SU workflow, no por las últimas
  // corridas del repositorio.
  comprobar(
    "el cron se consulta por su propio workflow",
    /actions\/workflows\/weekly\.yml\/runs/.test(src),
    "mirar las últimas del repo daba falsos negativos",
  );

  // La de curl: tiene que ignorar los comentarios, o falla leyendo la línea
  // que explica que ANTES se usaba curl.
  comprobar(
    "la de curl ignora los comentarios",
    /trimStart\(\)\.startsWith\("#"\)/.test(src),
    "si no, falla leyendo su propia documentación",
  );

  // Trends: con string, no con objeto.
  comprobar(
    "trends se llama con el país como texto",
    /tendencia\("whatsapp business", "CO"\)/.test(src) && !/tendencia\([^)]*\{\s*geo/.test(src),
  );

  // Toda comprobación tiene que poder fallar. Una que solo devuelve texto sin
  // llamar nunca a `exige` pasa siempre, mida lo que mida.
  const bloques = src.split("await comprobar(").slice(1);
  const sinExigir = bloques.filter((b) => {
    const cuerpo = b.slice(0, b.indexOf("\n});"));
    return !cuerpo.includes("exige(");
  }).length;
  comprobar(
    "toda comprobación puede fallar",
    sinExigir <= 1,
    `${bloques.length} comprobaciones, ${sinExigir} sin exigir nada (se tolera la de Claude, que no se puede probar sin gastar cupo)`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nLAS REGLAS DE LA COMPUERTA, CONTRA SU PROPIO CASO MALO");
{
  const { runQa } = await import("@/lib/qa");
  const { CASA } = await import("@/lib/publicable");
  const { CLIENTE } = await import("@/lib/cliente");

  // Cada regla con el texto que debe cazar. Si alguna deja de saltar, es que se
  // rompió al tocar otra cosa: es la prueba de regresión de la compuerta.
  const ES = "La mejor forma de auditar tu sitio es con un scorecard que muestre qué arreglar y por qué importa. ".repeat(9);
  const casos = [
    ["figure-without-source", { markdown: "El 73% de las PYMEs ya usa esto." }],
    ["placeholder-left-in", { markdown: "El coste medio es [VERIFICAR] al mes." }],
    ["banned-phrase", { markdown: "We streamline and leverage seamless workflows." }],
    ["wrong-language", { markdown: ES, lang: "en" }],
    [
      "anchor-off-category",
      { markdown: `Ver [${CLIENTE.categoriaProhibida[0]} tools](https://${CLIENTE.dominio}/x).` },
    ],
    [
      "pricing-not-from-primary-source",
      { markdown: "Cuesta $0.06 por mensaje, [según Blueticks](https://blueticks.co/p)." },
    ],
    ["circular-self-citation", { markdown: `El 40% mejora, [según nosotros](https://${CLIENTE.dominio}/a).` }],
  ];

  for (const [regla, entrada] of casos) {
    const r = runQa({ title: "T", house: CASA, ...entrada });
    const salta = [...r.blocking, ...r.warnings].some((f) => f.rule === regla);
    comprobar(`${regla} salta con su caso malo`, salta);
  }

  // Y el contrario: un texto limpio no debe disparar NINGUNA de ellas. Una
  // regla que salta siempre es ruido, y el ruido se aprende a ignorar.
  const limpio =
    "The audit scorecard grades your site across four areas. " +
    "Screaming Frog costs $279 per year ([pricing](https://www.screamingfrog.co.uk/pricing/)). " +
    "Start with the crawl, then fix what blocks indexing. ".repeat(6) +
    `\n\n[See how we plan content](https://${CLIENTE.dominio}/ai-team/) and start at https://${CLIENTE.dominioApp}`;
  const r = runQa({ title: "A Practical Audit Scorecard for Small Business Sites", markdown: limpio, house: CASA, lang: "en" });
  const disparadas = [...r.blocking, ...r.warnings].map((f) => f.rule).filter((x) => casos.some(([c]) => c === x));
  comprobar("un texto limpio no dispara ninguna", disparadas.length === 0, disparadas.join(", ") || "ninguna");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("");
console.log("TODA RUTA QUE TOCA UN ARTÍCULO PASA EL IDIOMA");
{
  // La regla wrong-language solo actúa si quien llama le da el idioma. Se
  // añadió al escritor y se quedó muerta en las otras CUATRO rutas que
  // modifican artículos: editar, corregir, optimizar y —la peor— traducir,
  // cuyo trabajo es justamente producir otro idioma.
  //
  // Se comprueba leyendo el código, porque el fallo no era que la regla
  // estuviera mal: era que nadie la llamaba. Una regla apagada pasa todas
  // sus propias pruebas.
  const rutas = [
    "app/api/blog/edit/route.ts",
    "app/api/blog/fix/route.ts",
    "app/api/blog/optimize/route.ts",
    "app/api/blog/translate/route.ts",
  ];
  for (const r of rutas) {
    const src = fs.readFileSync(r, "utf8");
    const llama = /dejarPublicable\(|runQa\(/.test(src);
    const pasa = /\blang:/.test(src);
    comprobar(`${r.split("/").slice(-2)[0]} pasa el idioma a la compuerta`, !llama || pasa);
  }
}

console.log("\nEL REINTENTO");
{
  const { defectoDeRaiz, conUnReintento } = await import("@/lib/reintento");
  const EN = "The best way to audit your site is with a scorecard that shows what to fix and why it matters. ".repeat(9);
  const ES = "La mejor forma de auditar tu sitio es con un scorecard que muestre qué arreglar y por qué importa. ".repeat(9);

  let veces = 0;
  const r = await conUnReintento(
    async (i) => {
      veces++;
      return i === 1 ? ES : EN;
    },
    (t) => defectoDeRaiz(t, { lang: "en", minimoPalabras: 100 }),
  );
  comprobar("reintenta una vez y se queda con la buena", veces === 2 && r.descartado?.regla === "wrong-language");

  veces = 0;
  await conUnReintento(
    async () => {
      veces++;
      return EN;
    },
    (t) => defectoDeRaiz(t, { lang: "en", minimoPalabras: 100 }),
  );
  comprobar("no reintenta si la primera vale", veces === 1);

  veces = 0;
  await conUnReintento(
    async () => {
      veces++;
      return ES;
    },
    (t) => defectoDeRaiz(t, { lang: "en", minimoPalabras: 100 }),
  );
  comprobar("nunca pasa de dos intentos", veces === 2, "un reintento infinito quema el cupo entero");
}

console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobación(es) mal.\n`);
process.exit(fallos === 0 ? 0 : 1);
