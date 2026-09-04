// La caché de Trends, probada sola.
//
// Se prueba el módulo de caché y no la integración porque lib/trends.ts usa el
// alias "@/" que solo entiende el bundler. La integración se comprueba en la
// app: dos llamadas seguidas a la misma keyword deben hacer UNA sola petición.
//
//   node scripts/probar-cache-trends.mjs
import { guardar, guardado, estado, clave, PLAZO_MS } from "../lib/trends-cache.ts";

// La clave es distinta en cada corrida.
//
// Era fija, y la prueba escribe en el caché sin limpiar: a partir de la SEGUNDA
// vez que se ejecutaba, 'una keyword nunca vista no está en caché' fallaba
// porque la había dejado ahí la corrida anterior. Una prueba que depende del
// estado que ella misma deja no mide lo que dice medir.
const T = `__prueba_cache_${Date.now()}__`;
const falsa = { termino: T, direccion: "baja", cambioAnual: -42, nivelActual: 13, meses: 60 };

let fallos = 0;
const comprobar = (ok, que) => { if (!ok) fallos++; console.log(`  ${ok ? "ok  " : "MAL "} ${que}`); };

console.log("estado antes:", JSON.stringify(estado()));

comprobar(guardado(T) === null, "una keyword nunca vista no está en caché");

guardar(T, "", falsa);
const g = guardado(T);
comprobar(!!g, "tras guardar, se encuentra");
comprobar(g?.t.cambioAnual === -42, "devuelve el mismo valor");
comprobar(g?.caducado === false, "recién guardada no está caducada");
comprobar(g?.dias === 0, "tiene 0 días");

// Con plazo cero, todo está caducado: es como se comporta al pasar la semana.
const viejo = guardado(T, "", 0);
comprobar(viejo?.caducado === true, "con el plazo vencido, se marca caducada");
comprobar(!!viejo?.t, "pero SIGUE devolviendo el valor, que es lo que salva un 429");

// El país forma parte de la clave: la misma palabra no vale igual en dos sitios.
comprobar(clave("x", "MX") !== clave("x", ""), "el geo entra en la clave");
comprobar(guardado(T, "MX") === null, "la entrada global no responde por México");

console.log("estado después:", JSON.stringify(estado()));
console.log(`plazo configurado: ${PLAZO_MS / 86400000} días`);
console.log(fallos === 0 ? "\nLa caché se comporta como debe." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
