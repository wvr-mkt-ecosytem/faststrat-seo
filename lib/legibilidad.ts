// Que el texto se lea como escrito por una persona.
//
// Es un objetivo distinto del de la compuerta de verificabilidad, y conviene no
// mezclarlos: aquella comprueba si lo que dice es cierto y citable; esta, si se
// puede leer sin esfuerzo. Un artículo puede estar impecablemente respaldado y
// seguir siendo indigerible.
//
// Los patrones vienen de "Signs of AI writing" de Wikipedia, la misma lista que
// usa el skill blader/humanizer. Se portan aquí en vez de instalar el skill
// porque aquel es un archivo de instrucciones para una sesión interactiva de
// Claude Code, y este sistema son rutas de API: no hay dónde escribir
// /humanizer. La lista sí viaja.
//
// EL REPARTO IMPORTA. Aquí abajo solo van los patrones que se pueden comprobar
// CONTANDO, sin criterio: una expresión regular no sabe si una tríada está
// forzada ni si una analogía aporta algo. Esos van al prompt, que es donde un
// modelo sí puede juzgarlos. Meterlos aquí produciría falsos positivos sobre
// prosa legítima, y una regla que se equivoca a menudo se acaba desactivando.
//
// Todo esto AVISA, no bloquea. La verificabilidad es binaria (una cifra tiene
// fuente o no la tiene); el estilo es un juicio, y bloquear un artículo cierto
// y útil porque abusa de las negritas sería peor que publicarlo.

import type { Finding } from "@/lib/qa";

/** Verbos que sustituyen a "es" y alargan la frase sin añadir nada. */
const EVITAN_SER =
  /\b(serves? as|stands? as|boasts?|acts? as|functions? as|se erige como|se posiciona como|funge como|constituye un)\b/gi;

/** Importancia inflada: lo ordinario contado como si fuera un hito. */
const IMPORTANCIA_INFLADA =
  /\b(marking a (?:pivotal|significant|key) moment|a testament to|stands? as a testament|pivotal|a game.?changer|un antes y un después|un hito|marca un punto de inflexión|se ha convertido en referente)\b/gi;

/** Fuentes vagas: se atribuye a una autoridad que no se nombra. */
const FUENTE_VAGA =
  /\b(industry reports?|experts? (?:argue|say|believe|agree)|some critics|several sources|studies show|research suggests|los expertos (?:coinciden|afirman|creen)|seg[úu]n (?:los )?(?:expertos|estudios|informes del sector)|diversas fuentes|algunos cr[íi]ticos)\b/gi;

/** Muletillas de asistente que se cuelan en un texto que va solo. */
const RESTO_DE_CHAT =
  /\b(I hope this helps|let me know if|would you like me to|espero que (?:esto )?te (?:sirva|ayude)|av[íi]same si|¿te gustar[íi]a que)\b/gi;

/** Revelación fingida: presenta lo obvio como si fuera un hallazgo. */
const FALSA_PROFUNDIDAD =
  /\b(the real question is|at its core|what really matters|here'?s the thing|la verdadera pregunta es|en el fondo|lo que realmente importa|la clave está en entender)\b/gi;

/** Anuncia lo que va a decir en vez de decirlo. */
const ANUNCIA =
  /\b(let'?s dive in|here'?s what you need to know|in this (?:article|post|guide),? (?:we|I)|vamos a ver|en este art[íi]culo (?:vamos a|veremos|te)|antes de empezar,|dicho esto,)\b/gi;

/** Cierres de optimismo genérico en vez de un último dato útil. */
const CIERRE_VACIO =
  /\b(the future looks bright|exciting times (?:lie )?ahead|el futuro (?:es|se ve) prometedor|el tiempo lo dir[áa]|solo queda esperar|sin duda seguiremos viendo)\b/gi;

/** Coletillas fingidamente sinceras usadas como gancho. */
const FALSA_FRANQUEZA = /(^|\n)\s*(Honestly[,?]|Look,|The thing is,|Sinceramente[,?]|Mira,|La verdad es que,)/gi;

/** Cobertura apilada: tres hedges seguidos no matizan, borran. */
const HEDGE_APILADO =
  /\b((?:could|might|may) (?:potentially|possibly|arguably)|potentially possibly|podr[íi]a (?:potencialmente|posiblemente|quiz[áa]s)|quiz[áa]s podr[íi]a)\b/gi;

/** Rodeos que se dicen en una palabra. */
const RODEOS: [RegExp, string][] = [
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bit is important to note that\b/gi, "(bórralo y di el hecho)"],
  [/\bcon el fin de\b/gi, "para"],
  [/\bdebido al hecho de que\b/gi, "porque"],
  [/\ben este momento del tiempo\b/gi, "ahora"],
  [/\bes importante (?:destacar|mencionar|señalar) que\b/gi, "(bórralo y di el hecho)"],
  [/\bcabe (?:destacar|mencionar|señalar) que\b/gi, "(bórralo y di el hecho)"],
];

const trozo = (t: string, i: number, span = 60) =>
  t.slice(Math.max(0, i - span), i + span).replace(/\s+/g, " ").trim();

/** Solo la prosa: dentro de un bloque de código no hay estilo que juzgar. */
const sinCodigo = (markdown: string) => markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

/** Cómo escribe los encabezados este sitio. Es estilo de casa, no regla de SEO. */
export type EstiloEncabezados = "libre" | "minusculas" | "titulo";

/**
 * Recibe el estilo por parámetro en vez de leer la configuración.
 *
 * Así el módulo no depende de nada y se puede probar suelto, igual que
 * house-rules.ts recibe el dominio. Quien llama decide.
 */
export function revisarLegibilidad(
  markdown: string,
  opciones: { encabezados?: EstiloEncabezados } = {},
): Finding[] {
  const estiloEncabezados = opciones.encabezados ?? "libre";
  const texto = sinCodigo(markdown);
  const out: Finding[] = [];
  const avisar = (rule: string, detail: string, i?: number) =>
    out.push({ severity: "warn", rule, detail, excerpt: i === undefined ? undefined : trozo(texto, i) });

  const patrones: [RegExp, string, string][] = [
    [EVITAN_SER, "avoids-is", 'Rodeo para no decir "es". Dilo directo.'],
    [IMPORTANCIA_INFLADA, "inflated-importance", "Importancia inflada: cuenta lo que pasó, sin adjetivarlo como hito."],
    [FUENTE_VAGA, "vague-source", "Fuente sin nombre. Nómbrala o quita la afirmación."],
    [RESTO_DE_CHAT, "chatbot-leftover", "Muletilla de asistente en un texto que va solo."],
    [FALSA_PROFUNDIDAD, "fake-depth", "Presenta lo normal como un hallazgo. Di el punto sin ceremonia."],
    [ANUNCIA, "announces-the-point", "Anuncia lo que va a decir en vez de decirlo."],
    [CIERRE_VACIO, "empty-ending", "Cierre de optimismo genérico. Acaba con el último dato útil."],
    [FALSA_FRANQUEZA, "fake-candor", "Franqueza escenificada antes de un punto normal."],
    [HEDGE_APILADO, "stacked-hedging", "Cobertura apilada: tres matices seguidos no matizan, borran."],
  ];

  for (const [re, rule, detail] of patrones) {
    for (const m of texto.matchAll(re)) {
      avisar(rule, `"${m[0].trim()}" — ${detail}`, m.index);
    }
  }

  for (const [re, corto] of RODEOS) {
    for (const m of texto.matchAll(re)) {
      avisar("wordy-phrase", `"${m[0].trim()}" son varias palabras para decir "${corto}".`, m.index);
    }
  }

  // --- Los que se miden contando, no buscando.

  // Negritas de más. El umbral es por densidad y no por número absoluto: un
  // artículo largo puede llevar más sin que estorben.
  const negritas = (texto.match(/\*\*[^*\n]+\*\*/g) ?? []).length;
  const palabras = texto.split(/\s+/).filter(Boolean).length;
  if (negritas > 8 && negritas / Math.max(palabras, 1) > 0.006) {
    avisar(
      "too-much-bold",
      `${negritas} tramos en negrita en ${palabras} palabras. Cuando casi todo destaca, no destaca nada.`,
    );
  }

  // Listas de "**Etiqueta:** descripción": estructura de ficha, no de prosa.
  //
  // Los dos puntos pueden ir dentro o fuera de las negritas, y en Markdown lo
  // habitual es dentro (`**Etiqueta:**`). La primera versión solo miraba fuera,
  // así que no reconocía la forma más común y el patrón no saltaba nunca.
  const fichas = (texto.match(/^\s*[-*]\s+\*\*[^*\n]+?:?\*\*\s*[:—-]?\s+\S/gm) ?? []).length;
  if (fichas >= 4) {
    avisar("bold-label-list", `${fichas} puntos con la forma "**Etiqueta:** texto". Pásalo a prosa o simplifica la lista.`);
  }

  // Encabezados: por defecto se mira la COHERENCIA, no el estilo.
  //
  // La lista de Wikipedia pide minúsculas, y aplicarlo tal cual producía 88 de
  // los 112 avisos sobre los 21 artículos del repositorio: ahogaba las cuatro
  // señales que sí decían algo. Title Case no es rastro de IA, es el estilo de
  // medio internet en inglés. Lo que sí delata es MEZCLAR los dos dentro del
  // mismo artículo, porque eso no lo hace nadie a propósito.
  //
  // Quien quiera imponer un estilo lo declara en CLIENTE_ENCABEZADOS.
  const encabezados: { texto: string; titleCase: boolean }[] = [];
  for (const m of texto.matchAll(/^#{2,4}\s+(.+)$/gm)) {
    const h = m[1].trim();
    const palabrasH = h.split(/\s+/).filter((p) => /^[A-Za-z]/.test(p));
    if (palabrasH.length < 4) continue;
    const mayus = palabrasH.filter((p) => /^[A-Z]/.test(p)).length;
    encabezados.push({ texto: h, titleCase: mayus / palabrasH.length > 0.8 });
  }

  if (estiloEncabezados === "minusculas") {
    for (const h of encabezados.filter((x) => x.titleCase)) {
      avisar("title-case-heading", `"${h.texto}" va en Title Case y este sitio los escribe en minúsculas.`);
    }
  } else if (estiloEncabezados === "titulo") {
    for (const h of encabezados.filter((x) => !x.titleCase)) {
      avisar("heading-case", `"${h.texto}" va en minúsculas y este sitio los escribe en Title Case.`);
    }
  } else if (encabezados.length >= 3) {
    const enTitulo = encabezados.filter((x) => x.titleCase).length;
    const minoria = Math.min(enTitulo, encabezados.length - enTitulo);
    // Solo si de verdad están mezclados. Uno suelto entre diez puede ser un
    // nombre propio al principio, no una incoherencia.
    if (minoria > 0 && minoria / encabezados.length > 0.2) {
      avisar(
        "heading-case-mixed",
        `Los encabezados mezclan estilos: ${enTitulo} en Title Case y ${encabezados.length - enTitulo} en minúsculas. Elige uno.`,
      );
    }
  }

  // Emojis decorativos.
  const emojis = texto.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? [];
  if (emojis.length > 0) {
    avisar("emoji", `${emojis.length} emoji(s) decorativos: ${[...new Set(emojis)].slice(0, 6).join(" ")}`);
  }

  // Aperturas repetidas: tres párrafos seguidos que empiezan igual se leen como
  // una plantilla rellenada.
  const parrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !/^[#>\-*|]/.test(p));
  const primeras = parrafos.map((p) => p.split(/\s+/).slice(0, 2).join(" ").toLowerCase());
  for (let i = 0; i + 2 < primeras.length; i++) {
    if (primeras[i] && primeras[i] === primeras[i + 1] && primeras[i] === primeras[i + 2]) {
      avisar("repeated-openings", `Tres párrafos seguidos empiezan por "${primeras[i]}".`);
      break;
    }
  }

  // Un encabezado y su primera frase diciendo lo mismo.
  for (const m of texto.matchAll(/^#{2,4}\s+(.+)\n+([^\n#]+)/gm)) {
    const clave = (s: string) =>
      new Set(
        s.toLowerCase().replace(/[^a-záéíóúñ0-9\s]/gi, " ").split(/\s+/).filter((w) => w.length > 3),
      );
    const a = clave(m[1]);
    const b = clave(m[2].slice(0, 120));
    if (a.size >= 3) {
      const comunes = [...a].filter((w) => b.has(w)).length;
      if (comunes / a.size >= 0.8) {
        avisar("heading-restated", `La primera frase repite el encabezado "${m[1].trim()}".`);
      }
    }
  }

  return out;
}

/** Lo que va en el prompt: lo que NO se puede comprobar contando. */
export const INSTRUCCION_LEGIBILIDAD = `CÓMO SE LEE (no es cosmética: decide si alguien termina el artículo).

- Di "es" cuando quieras decir "es". Nada de "sirve como", "se erige en", "constituye un".
- Nada de tríadas de adorno ("innovación, inspiración e ideas"). Tres cosas van juntas si de verdad van juntas.
- Nada de "no solo X, sino Y" ni de negaciones cortadas ("sin adivinar"). Escribe la frase entera.
- Nada de "de X a Y" si entre X e Y no hay un recorrido real.
- Voz activa y con sujeto: quién hace qué. "El sistema guarda el resultado", no "se guarda el resultado".
- No anuncies lo que vas a decir: dilo. Fuera "vamos a ver", "en este artículo", "dicho esto".
- No abras con franqueza fingida ("sinceramente", "mira", "la verdad es que").
- No respondas objeciones que nadie hizo ("no estoy diciendo que...", "para que quede claro").
- No plantees una alternativa que nadie se plantea para descartarla acto seguido.
- Nada de sentencias con forma de aforismo ("X es el Y de Z", "no es una herramienta, es un espejo"). Suenan a algo y no dicen nada.
- Encabezados en minúscula (salvo nombres propios), y que la primera frase NO repita el encabezado.
- Negritas solo donde de verdad haga falta. Si casi todo destaca, no destaca nada.
- Cierra con el último dato útil, no con un deseo de futuro.
- Sin emojis.`;
