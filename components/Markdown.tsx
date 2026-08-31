// El markdown del informe, pintado.
//
// POR QUÉ EXISTE: la pantalla de reportes mostraba el informe con
// `whitespace-pre-wrap`, así que salía "## El panorama" literal, con las
// almohadillas y los asteriscos a la vista. Nueve minutos de análisis
// presentados como un volcado de texto.
//
// Se pinta en React y no con `marked` + dangerouslySetInnerHTML a propósito:
// el texto lo escribe un agente que busca en la web y cita lo que encuentra,
// así que puede arrastrar lo que sea. Construyendo los nodos, una etiqueta que
// venga en el texto se muestra como texto, no se ejecuta. No hace falta
// sanear lo que nunca llega a ser HTML.

import { Fragment, type ReactNode } from "react";

/** Negritas, cursivas y código dentro de una línea. */
function enLinea(texto: string, clave: string): ReactNode[] {
  // Un solo recorrido con las tres marcas: partir tres veces seguidas obliga a
  // reensamblar lo ya partido y es donde se cuelan los solapes (`**a _b_ c**`).
  const partes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*]+\*(?!\w))/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let n = 0;

  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const t = m[0];
    const k = `${clave}-${n++}`;
    if (t.startsWith("**")) {
      partes.push(<strong key={k} className="font-semibold">{t.slice(2, -2)}</strong>);
    } else if (t.startsWith("`")) {
      partes.push(
        <code key={k} className="font-mono text-[12px] bg-maroon/10 px-1 py-0.5 rounded">
          {t.slice(1, -1)}
        </code>,
      );
    } else {
      partes.push(<em key={k}>{t.slice(1, -1)}</em>);
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

/**
 * El subconjunto de Markdown que produce el analista: ##, ###, ---, listas,
 * párrafos. No pretende ser un conversor completo; pretende que el informe se
 * lea.
 */
export function Markdown({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let parrafo: string[] = [];
  let lista: string[] = [];
  let n = 0;

  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    const t = parrafo.join(" ").trim();
    bloques.push(
      <p key={`p${n++}`} className="text-[13px] text-ink leading-relaxed">
        {enLinea(t, `p${n}`)}
      </p>,
    );
    parrafo = [];
  };

  const cerrarLista = () => {
    if (!lista.length) return;
    const items = lista;
    bloques.push(
      <ul key={`u${n++}`} className="flex flex-col gap-1 pl-4 list-disc marker:text-maroon/40">
        {items.map((it, i) => (
          <li key={i} className="text-[13px] text-ink leading-relaxed">
            {enLinea(it, `u${n}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    lista = [];
  };

  const cerrarTodo = () => {
    cerrarParrafo();
    cerrarLista();
  };

  for (const linea of texto.split("\n")) {
    const s = linea.trim();

    if (!s) {
      cerrarTodo();
    } else if (s === "---" || s === "***") {
      cerrarTodo();
      bloques.push(<hr key={`h${n++}`} className="border-maroon/15" />);
    } else if (s.startsWith("### ")) {
      cerrarTodo();
      bloques.push(
        <h4 key={`h${n++}`} className="text-[13px] font-semibold text-maroon mt-1">
          {enLinea(s.slice(4), `h${n}`)}
        </h4>,
      );
    } else if (s.startsWith("## ")) {
      cerrarTodo();
      bloques.push(
        <h3 key={`h${n++}`} className="text-[15px] font-semibold text-ink mt-2">
          {enLinea(s.slice(3), `h${n}`)}
        </h3>,
      );
    } else if (s.startsWith("# ")) {
      cerrarTodo();
      bloques.push(
        <h2 key={`h${n++}`} className="text-[17px] font-semibold text-ink mt-2">
          {enLinea(s.slice(2), `h${n}`)}
        </h2>,
      );
    } else if (/^[-*+]\s+/.test(s)) {
      // Una lista corta el párrafo de arriba, pero no al revés: las líneas
      // sueltas entre viñetas son continuación del último punto.
      cerrarParrafo();
      lista.push(s.replace(/^[-*+]\s+/, ""));
    } else if (/^\d+[.)]\s+/.test(s)) {
      cerrarParrafo();
      lista.push(s.replace(/^\d+[.)]\s+/, ""));
    } else if (lista.length) {
      lista[lista.length - 1] += ` ${s}`;
    } else {
      parrafo.push(s);
    }
  }
  cerrarTodo();

  return <div className="flex flex-col gap-2">{bloques.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
