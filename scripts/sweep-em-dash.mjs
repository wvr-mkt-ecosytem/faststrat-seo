// Sustituye las rayas largas en todos los artículos, sin agente.
//
// Por qué existe aparte del corrector: de los 306 bloqueos que quedaban, 203
// eran rayas largas. Eso es sustituir un carácter, no una decisión, y estaba
// consumiendo llamadas de agente con búsqueda web, que son lo que se acaba
// cuando se agota el límite de sesión. Quitarlas antes deja al agente solo lo
// que necesita criterio: las cifras sin fuente.
//
// La sustitución es la misma que ya hace el corrector al final, para que las
// dos rutas produzcan el mismo texto.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "content", "blog");

const barrer = (t) =>
  t
    // Al final de una línea, un punto: una coma dejaría la frase colgando.
    .replace(/\s*—\s*$/gm, ".")
    // Entre espacios es un inciso: la coma es el reemplazo que menos cambia el ritmo.
    .replace(/\s+—\s+/g, ", ")
    .replace(/—/g, ", ");

let tocados = 0;
let total = 0;
for (const f of fs.readdirSync(DIR).filter((x) => /\.mdx?$/.test(x))) {
  const full = path.join(DIR, f);
  const antes = fs.readFileSync(full, "utf8");
  const n = (antes.match(/—/g) || []).length;
  if (!n) continue;
  fs.writeFileSync(full, barrer(antes));
  console.log(`  ${String(n).padStart(3)} rayas  ${f}`);
  tocados++;
  total += n;
}
console.log(`\n${total} rayas sustituidas en ${tocados} artículo(s).`);
