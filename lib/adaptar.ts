// La versión en el otro idioma.
//
// ADAPTAR, NO TRADUCIR. Es una decisión, no un matiz. Las reglas de este
// sistema ya pedían "español natural de LATAM, no traducido", y hay una razón
// de posicionamiento detrás: la SERP de "whatsapp business api pricing" en
// Estados Unidos no se parece a la de México. Otros competidores arriba, otras
// fuentes citables, otros precios y otra moneda. Un artículo traducido bien
// puede seguir sin responder a quien busca desde el otro mercado, porque cita
// tarifas en dólares y estudios que a esa persona no le sirven.
//
// Por eso el agente vuelve a mirar la SERP EN EL IDIOMA DESTINO antes de
// escribir. Cuesta el doble de tiempo y produce dos páginas que rankean cada
// una en lo suyo, en vez de una que rankea y otra que la sigue de lejos.
//
// SON DOS ARTÍCULOS, NO UNO. Cada versión tiene su URL, su entrada en el
// sitemap y su posición. Se enlazan entre sí (ver `emparejar` en blog.ts) y ese
// enlace es lo que después alimenta el hreflang.

export const NOMBRE_IDIOMA: Record<string, string> = {
  en: "inglés",
  es: "español",
};

/** El mercado al que apunta cada idioma. Cambia qué fuentes y precios valen. */
export const MERCADO: Record<string, string> = {
  en: "Estados Unidos y mercados de habla inglesa",
  es: "LATAM (México, Colombia, Argentina)",
};

/**
 * Las instrucciones para escribir la versión adaptada.
 *
 * Recibe el artículo original entero. No es contexto decorativo: el agente
 * tiene que conservar la tesis y la estructura, y cambiar todo lo que sea local.
 * Sin el original delante escribiría otro artículo distinto, y entonces no
 * serían dos versiones sino dos piezas sueltas que además compiten entre sí.
 */
export function instruccionesAdaptar(opciones: {
  idiomaDestino: string;
  tituloOriginal: string;
  markdownOriginal: string;
  keywordOriginal: string;
}): string {
  const { idiomaDestino, tituloOriginal, markdownOriginal, keywordOriginal } = opciones;
  const nombre = NOMBRE_IDIOMA[idiomaDestino] ?? idiomaDestino;
  const mercado = MERCADO[idiomaDestino] ?? "el mercado de ese idioma";

  return `Vas a escribir la versión en ${nombre} de un artículo que ya existe. Para ${mercado}.

NO ES UNA TRADUCCIÓN. Si te limitas a traducir, el artículo saldrá citando precios en la moneda equivocada y fuentes que a este lector no le sirven, y no rankeará. Lo que se conserva es la TESIS y la ESTRUCTURA; lo que cambia es todo lo que depende del sitio.

QUÉ CONSERVAS:
- El argumento central y en qué orden se cuenta.
- La estructura de secciones (los mismos H2, adaptados al idioma).
- El tipo de dato que se aporta. Si el original resuelve una contradicción entre fuentes, esta versión también.

QUÉ VUELVES A HACER DESDE CERO:
1. Busca la SERP de este tema EN ${nombre.toUpperCase()}. Abre los tres primeros. Son otros competidores que los del original.
2. Precios y cifras: en la moneda y el mercado de destino. Si el original dice "$0,0436 por conversación", busca la tarifa que aplica en ${mercado} y cítala con su fuente.
3. Fuentes: enlaza las que sirven a ESTE lector. Un estudio estadounidense en un artículo para México es una cita que nadie va a comprobar.
4. Ejemplos: negocios y situaciones reconocibles en ${mercado}.
5. El título: NO lo traduzcas. Escribe el titular que competiría en esa SERP, que puede ser un ángulo distinto.

EL IDIOMA: escribe en ${nombre} nativo, no traducido. Nada de calcos del inglés ni de estructuras que delaten el original.

---
ARTÍCULO ORIGINAL (título: "${tituloOriginal}", keyword: "${keywordOriginal}")
---
${markdownOriginal}
---

Tu respuesta debe empezar EXACTAMENTE con la línea:
TITLE: <el titular en ${nombre}>
KEYWORD: <la keyword principal en ${nombre}, la que de verdad se busca en ese mercado>

Y después los bloques <<<DIFERENCIAL>>>, <<<KEYWORD>>> y <<<ARTICULO>>> como siempre, referidos a la SERP en ${nombre}.`;
}

/** Saca el título y la keyword que eligió el agente para la versión adaptada. */
export function cabecera(raw: string): { title?: string; keyword?: string } {
  const title = raw.match(/^\s*TITLE:\s*(.+?)\s*$/im)?.[1]?.replace(/^["']|["']$/g, "").trim();
  const keyword = raw.match(/^\s*KEYWORD:\s*(.+?)\s*$/im)?.[1]?.replace(/^["']|["']$/g, "").trim();
  return { title, keyword };
}
