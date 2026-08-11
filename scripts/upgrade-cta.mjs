// Reemplaza el CTA por uno que cierra, no que describe.
//
// La primera versión explicaba qué es FastStrat y ponía un enlace. Eso informa;
// no pide nada. StoryBrand (en la biblioteca del sistema) es explícito sobre
// por qué falla:
//
//   "Uno de los mayores obstáculos para el éxito de un negocio es que creemos
//    que el cliente nos lee la mente. Para nosotros es obvio que queremos que
//    haga un pedido, así que asumimos que para él también. No lo es."
//
// Y sobre el momento exacto en que este CTA aparece:
//
//   "Después de leernos, todos se preguntan lo mismo: ¿qué quieres que haga
//    ahora? Si no los guiamos, se confunden."  ("Si confundes, pierdes")
//
// Lo que cambia, entonces:
//
// 1. Nombra el hueco entre leer y hacer. El lector acaba de terminar un
//    artículo largo y está en el punto de máxima intención; el CTA tiene que
//    recogerla ahí, no unas líneas antes ni después.
//
// 2. Pide de forma directa e imperativa. StoryBrand llama a esto "direct call
//    to action" y señala que están "ridículamente infrautilizados".
//
// 3. Quita el riesgo. El libro: un plan sirve para aclarar cómo hacer negocios
//    con nosotros o para eliminar la sensación de riesgo.
//
// Lo que NO hace: prometer condiciones que no puedo verificar. "Gratis" se
// sostiene porque faststrat.ai ofrece prueba gratuita; nada de "sin tarjeta" ni
// plazos concretos, que serían inventados.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "content", "blog");
const URL = "https://app.faststrat.ai";

const NUEVO = {
  en: `---

You now know what to do. The hard part is doing it every week, without a marketing team, while you run the business.

That is the job FastStrat does: it plans the content, writes it, publishes it, and tells you what actually moved. One place, no stack to assemble.

**[Start free at app.faststrat.ai →](${URL})**

Set it up in minutes. Keep what works.
`,
  es: `---

Ya sabes qué hacer. Lo difícil es hacerlo cada semana, sin equipo de marketing y mientras sacas adelante el negocio.

De eso se encarga FastStrat: planea el contenido, lo escribe, lo publica y te dice qué funcionó de verdad. En un solo sitio, sin herramientas que ensamblar.

**[Empieza gratis en app.faststrat.ai →](${URL})**

Se configura en minutos. Te quedas con lo que funcione.
`,
};

// El CTA anterior, para reemplazarlo en vez de acumular dos.
const ANTERIOR = /\n*---\n+(?:FastStrat (?:runs|corre) this|FastStrat corre esto)[\s\S]*$/;

let cambiados = 0;
for (const f of fs.readdirSync(DIR).filter((x) => /\.mdx?$/.test(x))) {
  const full = path.join(DIR, f);
  const raw = fs.readFileSync(full, "utf8");
  const { data } = matter(raw);
  const lang = data.lang === "es" ? "es" : "en";

  let base = raw;
  if (ANTERIOR.test(raw)) {
    base = raw.replace(ANTERIOR, "");
  } else if (raw.includes(URL)) {
    console.log("  tiene un CTA distinto, se salta: " + f);
    continue;
  }

  fs.writeFileSync(full, base.trimEnd() + "\n\n" + NUEVO[lang]);
  console.log("  [" + lang + "] " + f);
  cambiados++;
}
console.log(`\n${cambiados} artículo(s) con el CTA nuevo.`);
