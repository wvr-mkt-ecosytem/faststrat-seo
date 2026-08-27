// Comprueba Autocomplete contra los temas reales del blog.
//   node scripts/probar-sugerencias.mjs
import { candidatas, porIntencion } from "../lib/sugerencias.ts";

let fallos = 0;
for (const t of ["whatsapp business api", "seo for small business", "customer acquisition cost"]) {
  const c = await candidatas(t, { letras: 4 });
  const todas = [...c.directas, ...c.ampliadas];
  const { conIntencion, resto } = porIntencion(todas, t);
  console.log(`\n=== ${t}`);
  console.log(`   ${todas.length} candidatas (${c.directas.length} directas + ${c.ampliadas.length} ampliadas)`);
  console.log(`   con intención (${conIntencion.length}): ${conIntencion.slice(0, 6).join(" · ")}`);
  console.log(`   resto (${resto.length}):          ${resto.slice(0, 4).join(" · ")}`);
  if (todas.length < 10) { fallos++; console.log("   ✗ muy pocas: ¿está respondiendo el endpoint?"); }
  // Que no haya ninguna con intención es un resultado válido, no un fallo: hay
  // temas cuya cola es geográfica o informativa. Lo que SÍ sería un fallo es
  // que el filtro marque todo, que es lo que hacía al encontrarse la semilla.
  if (conIntencion.length === todas.length && todas.length > 3) {
    fallos++;
    console.log("   ✗ marcó TODAS como intención: el filtro se está encontrando a sí mismo");
  }
}
console.log(fallos === 0 ? "\nAutocomplete responde y el filtro separa." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
