// Pruebas del lector de la respuesta del analista.
//
// POR QUÉ EXISTE: `analyse` tarda dieciocho minutos y gasta cupo de la
// suscripción, así que hasta hoy la única forma de saber si la respuesta se leía
// bien era esperar al lunes y abrir el correo. Falló dos veces así, el 3 de
// septiembre y el 5 de octubre, y las dos veces el aviso fue un correo raro.
//
// Cada caso de aquí es una forma que el agente ha devuelto DE VERDAD, no una
// que se me haya ocurrido.
//
//   node scripts/probar-informe-semanal.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";

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

const { leerRespuesta } = await import("@/lib/ga4-analyst");

const ACCIONES = `{"recommendations":[{"kind":"add-cta","target":"/blog","priority":"alta"}]}`;
let fallos = 0;

function comprueba(nombre, condicion, detalle) {
  if (condicion) {
    console.log(`  ok   ${nombre}`);
  } else {
    console.error(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ""}`);
    fallos++;
  }
}

// 1. La forma que pide el prompt.
{
  const r = leerRespuesta(`<<<INFORME>>>\n## El panorama\n65 clics.\n\n<<<ACCIONES>>>\n${ACCIONES}`);
  comprueba("con los dos marcadores: lee el informe", r.report === "## El panorama\n65 clics.", JSON.stringify(r.report));
  comprueba("con los dos marcadores: lee una acción", r.recommendations.length === 1);
  comprueba("con los dos marcadores: sin error", !r.error, r.error);
}

// 2. El fallo del 5 de octubre: informe escrito, marcador de apertura ausente.
//    Esto devolvía report:"" y mandó el correo del lunes sin análisis dentro.
{
  const r = leerRespuesta(`## El panorama\n65 clics en 28 días.\n\n<<<ACCIONES>>>\n${ACCIONES}`);
  comprueba("sin <<<INFORME>>>: rescata el informe", r.report.startsWith("## El panorama"), JSON.stringify(r.report));
  comprueba("sin <<<INFORME>>>: conserva la acción", r.recommendations.length === 1);
}

// 3. El informe dentro del JSON, que es lo que el prompt pedía por error.
{
  const r = leerRespuesta(`<<<ACCIONES>>>\n{"report":"## El panorama\\n65 clics.","recommendations":[]}`);
  comprueba("informe dentro del JSON: lo rescata", r.report === "## El panorama\n65 clics.", JSON.stringify(r.report));
}

// 4. El fallo del 3 de septiembre: JSON roto. El informe NO debe perderse.
{
  const r = leerRespuesta(`<<<INFORME>>>\n## El panorama\n65 clics.\n\n<<<ACCIONES>>>\n{"recommendations":[{`);
  comprueba("JSON roto: el informe sobrevive", r.report === "## El panorama\n65 clics.", JSON.stringify(r.report));
  comprueba("JSON roto: cero acciones", r.recommendations.length === 0);
  comprueba("JSON roto: lo dice", !!r.error && r.error.includes("Empezaba así"), r.error);
}

// 5. Nada en absoluto. No puede lanzar.
{
  const r = leerRespuesta("");
  comprueba("respuesta vacía: no lanza", r.report === "" && r.recommendations.length === 0);
  comprueba("respuesta vacía: lo dice", !!r.error, r.error);
}

// 6. Solo informe, sin bloque de acciones. El informe es el producto: se queda.
{
  const r = leerRespuesta(`<<<INFORME>>>\n## El panorama\n65 clics.`);
  comprueba("solo informe: lo conserva", r.report === "## El panorama\n65 clics.", JSON.stringify(r.report));
  comprueba("solo informe: avisa de las acciones", !!r.error, r.error);
}

// 7. Envuelto en una valla de código, que el modelo añade a veces.
{
  const r = leerRespuesta("```markdown\n## El panorama\n65 clics.\n\n<<<ACCIONES>>>\n" + ACCIONES);
  comprueba("con valla de código: la quita", r.report === "## El panorama\n65 clics.", JSON.stringify(r.report));
}

// --- El correo lleva parte de texto -----------------------------------------
//
// El informe semanal caía en spam porque iba solo en HTML. Resend lo daba por
// entregado, y lo estaba: entregado a la carpeta de spam también es entregado.
const { informeComoCorreo } = await import("@/lib/informe-email");
const { soloTexto } = await import("@/lib/email");

{
  const informe = {
    days: 28,
    totals: { clicks: 65, sessions: 868, conversions: 0 },
    counts: {},
    recommendations: [
      { kind: "add-cta", target: "/blog", reason: "No pide nada", suggestion: "Pon un CTA", priority: "alta" },
    ],
    limits: ["Cero conversiones en el periodo."],
    report: "## El panorama\n65 clics en 28 días.",
    generadoEn: "2026-10-05T19:23:37.500Z",
  };
  const c = informeComoCorreo(informe, "https://ejemplo.test");
  comprueba("el correo trae parte de texto", typeof c.text === "string" && c.text.length > 200, String(c.text?.length));
  comprueba("el texto lleva el informe", c.text.includes("65 clics en 28 días"));
  comprueba("el texto lleva la acción", c.text.includes("Pon un CTA"));
  comprueba("el texto lleva los límites", c.text.includes("Cero conversiones"));
  comprueba("el texto no lleva etiquetas HTML", !/<[a-z/][^>]*>/i.test(c.text));
  comprueba("el texto no lleva entidades sueltas", !/&(?:nbsp|amp|lt|gt|quot|rarr);/.test(c.text));
}

// El respaldo, que corre en cada envío que no traiga texto propio.
{
  const t = soloTexto(
    `<div style="color:red"><h1>Hola</h1><p>Uno &amp; dos&nbsp;&middot; tres</p><ul><li>A</li><li>B</li></ul><a href="x">Ver &rarr;</a></div>`,
  );
  comprueba("respaldo: sin etiquetas", !/<[a-z/][^>]*>/i.test(t), t);
  comprueba("respaldo: resuelve &amp;", t.includes("Uno & dos"), t);
  comprueba("respaldo: las listas quedan en líneas", /- A\n- B/.test(t), JSON.stringify(t));
  comprueba("respaldo: no deja líneas en blanco de más", !/\n{3,}/.test(t), JSON.stringify(t));
  comprueba("respaldo: no se come el texto", t.includes("Hola") && t.includes("Ver"), t);
}

console.log(fallos ? `\n${fallos} comprobación(es) fallan.` : "\nTodo pasa.");
process.exit(fallos ? 1 : 0);
