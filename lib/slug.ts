// El slug de una URL.
//
// Vive suelto y sin dependencias a proposito: asi se puede probar sin levantar
// Next, que es lo que hace scripts/probar-slug.mjs.

/** Palabras que no aportan nada a una URL y solo gastan el presupuesto de largo. */
const RELLENO_SLUG = new Set(
  ("the a an and or of for to in on at by with from is are be as it its this that " +
    "el la los las un una unos unas de del y o para por con en su sus lo que es son como")
    .split(" "),
);

const LARGO_SLUG = 60;

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base.length <= LARGO_SLUG) return base;

  // Se corta por PALABRA, no por carácter.
  //
  // Antes era `.slice(0, 60)` a secas, y partía la última palabra por la mitad:
  // así nacieron `...honest-reviews-p` y `...step-by-step-guide-no`, seis en
  // total. Eso sale tal cual en el resultado de Google y le dice al lector,
  // antes de hacer clic, que la página se publicó sin que nadie la mirara. El
  // informe del 24 de agosto lo listaba como arreglo pendiente.
  const palabras = base.split("-");
  const utiles = palabras.filter((p) => !RELLENO_SLUG.has(p));

  // Primero se prueba sin las palabras de relleno: casi siempre basta y el slug
  // queda además más legible.
  const armar = (partes: string[]) => {
    const out: string[] = [];
    let largo = 0;
    for (const p of partes) {
      const suma = out.length ? p.length + 1 : p.length;
      if (largo + suma > LARGO_SLUG) break;
      out.push(p);
      largo += suma;
    }
    return out.join("-");
  };

  const sinRelleno = armar(utiles);
  // Un slug de una sola palabra no describe nada: si quitar el relleno lo deja
  // así, es mejor conservarlo y cortar por palabra sobre el original.
  return sinRelleno.split("-").length >= 3 ? sinRelleno : armar(palabras);
}