import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { rivalTopics } from "@/lib/rival-topics";
import { runClaude } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 800;

// Qué significa lo que publicó el sector, y qué nos toca hacer.
//
// La pantalla ya decía QUÉ salió: una lista de piezas nuevas con su titular y
// su enlace. Eso es el dato, no la lectura. Con doscientas piezas por semana,
// saber que Semrush publicó algo sobre "competitor analysis" no dice si nos
// conviene responder, ignorarlo o adelantarnos.
//
// Se analiza por HISTORIA y no por pieza, y esa es la decisión que hace esto
// viable: las piezas nuevas son cientos, pero las historias que tocan dos
// fuentes o más son unas pocas. Una historia que solo cuenta un medio es su
// apuesta; dos ya es el sector moviéndose, y solo eso merece una reacción.
//
// El agente LEE los artículos, no adivina por el slug. Un titular en la URL da
// para etiquetar un tema, no para decir de qué va: "ejerce + formal" salía de
// una nota sobre adopción de IA en agencias mexicanas, y eso no se deduce de
// las palabras sueltas.

const SYSTEM = `Eres analista de contenido competitivo para FastStrat, plataforma de agentes de IA de marketing para PYMEs (LATAM y EE.UU.).

Recibes historias que el sector publicó esta semana: cada una con las fuentes que la cubrieron y los enlaces. Tienes WebFetch y WebSearch: ABRE los artículos antes de opinar. Un slug da para etiquetar, no para saber de qué va.

Para cada historia devuelves tres cosas y ninguna más:

1. "about": de qué va, en una o dos frases, en concreto. Nada de "hablan de IA": qué afirman, con qué cifra si la traen, y quién lo dice. Si el artículo no se pudo abrir, dilo en este campo y no inventes el contenido.

2. "impact": cómo nos afecta a NOSOTROS. FastStrat vende a PYMEs sin equipo de marketing, en LATAM y EE.UU., y compite con Jasper, Copy.ai, HubSpot y las herramientas SEO. Di si esto es una amenaza (nos quitan un terreno que queríamos), una oportunidad (hay un hueco que podemos ocupar), o ruido (no nos toca). Empieza por esa palabra: "Amenaza:", "Oportunidad:" o "Ruido:". Si es ruido, dilo sin adornos y pasa a la siguiente; inflar la relevancia de todo hace que no se distinga lo que importa.

3. "move": qué hacemos, concreto y ejecutable, o la cadena vacía si la respuesta honesta es "nada". Un tema de artículo, un ángulo que ellos no cubren, una página nuestra que conviene actualizar. Nada de "monitorear la tendencia".

Reglas:
- No inventes cifras ni atribuciones. Solo lo que hayas leído en los artículos.
- Ordena de más relevante para nosotros a menos.
- Si una historia es ruido, va igual en la lista, marcada como ruido. Ocultarla haría creer que todo lo que sale es relevante.

Devuelve SOLO un JSON válido, sin texto alrededor:
{"stories":[{"phrase":"la etiqueta tal cual te la di","about":"...","impact":"Amenaza|Oportunidad|Ruido: ...","move":"..."}]}`;

export const POST = apiRoute(async () => {
  const { topics } = rivalTopics(30, 40);
  const historias = topics.filter((t) => t.sources.length >= 2).slice(0, 12);

  if (!historias.length) {
    return NextResponse.json({
      ok: true,
      stories: [],
      // Un vacío con causa. Sin esto se lee como "el agente no encontró nada
      // interesante", cuando lo que pasa es que no hay dos instantáneas que
      // comparar todavía.
      reason:
        "No hay ninguna historia cubierta por dos fuentes o más en la ventana. " +
        "Con una sola instantánea no hay con qué comparar: pulsa 'Buscar ahora' otro día para tener un antes y un después.",
    });
  }

  const prompt = `Historias del sector (etiqueta | fuentes | enlaces):

${historias
  .map(
    (t) =>
      `${t.phrase} | ${t.sources.join(", ")}\n${t.examples.map((e) => `  ${e.url}`).join("\n")}`,
  )
  .join("\n\n")}

Abre los enlaces y devuelve el JSON.`;

  const raw = await runClaude({
    model: "sonnet",
    system: SYSTEM,
    prompt,
    allowedTools: ["WebFetch", "WebSearch"],
  });

  let stories: { phrase: string; about: string; impact: string; move: string }[] = [];
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    stories = m ? (JSON.parse(m[0]).stories ?? []) : [];
  } catch {
    return NextResponse.json(
      { ok: false, error: "El agente no devolvió un JSON válido. Vuelve a intentarlo." },
      { status: 502 },
    );
  }

  // Se devuelven las historias con sus enlaces pegados, para que la pantalla
  // pueda enseñar de dónde salió cada lectura. Un análisis sin la fuente al
  // lado no se puede comprobar, y aquí todo tiene que poder comprobarse.
  const porFrase = new Map(historias.map((t) => [t.phrase, t]));
  const salida = stories.map((s) => {
    const t = porFrase.get(s.phrase);
    return { ...s, sources: t?.sources ?? [], examples: t?.examples ?? [] };
  });

  return NextResponse.json({ ok: true, stories: salida });
});
