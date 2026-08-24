# Qué le falta a GA4, y qué hace falta para arreglarlo

Todo lo de aquí sale de mirar la propiedad, no de buenas prácticas generales.

---

## El hallazgo que lo cambia todo: "cero conversiones" era configuración

```
Marcados como conversión:   purchase · qualify_lead · close_convert_lead
Eventos que el sitio lanza: view_plans · form_start · login · click · scroll
```

No coincide **ninguno**. Los tres marcados son los ejemplos que GA4 propone al
crear una propiedad, los tres creados el mismo día. El sitio no los dispara
nunca.

Mientras tanto, `form_start` (7 veces, 4 usuarios), `view_plans` (8 veces, 3
usuarios) y `login` (1) sí ocurren, y no cuentan.

Así que el "cero conversiones" que aparecía en todos los informes **no
significaba que nadie convirtiera**: significaba que GA4 contaba tres cosas que
no pasan e ignoraba las tres que sí. Se leyó como un problema de negocio durante
semanas.

**Qué hacer:** decidir primero qué es una conversión para este negocio. No es
una pregunta técnica. Candidatos por orden de compromiso: `form_start` (mostró
interés), `view_plans` (evalúa precio), `login` (ya entró). Luego marcarlos.

---

## Permiso de escritura: cómo se consigue

Un refresh token lleva sus permisos grabados y **no se pueden ampliar después**.
Hay que volver a autorizar, igual que cuando se recuperó el acceso.

Ya está preparado en `scripts/get-measurement-token.mjs`, con
`analytics.edit` añadido. Para aplicarlo:

```bash
node scripts/get-measurement-token.mjs
```

Se autoriza en el navegador, se copia el token nuevo a `.env.local` **y a
Render**, y se reinicia el servicio. Recuerda que guardar una variable en Render
no dispara despliegue: hace falta el reinicio manual.

**Tag Manager se queda en solo lectura a propósito.** Un token que puede editar
el contenedor puede tumbar la analítica del sitio entero con un despliegue mal
hecho. Las etiquetas se tocan pocas veces y compensa hacerlo a mano.

---

## Qué podría hacer el sistema con ese permiso

**Marcar los eventos correctos como conversión.** Lo de arriba, sin entrar al
panel cada vez.

**Crear dimensiones personalizadas.** Hoy no hay ninguna. Las que servirían
aquí: el tema del artículo, el idioma, y de qué tanda de contenido salió. Sin
ellas no se puede responder "¿qué tipo de artículo convierte mejor?", solo
"¿qué URL?", que es una pregunta más pobre.

**Filtrar el tráfico de bots en el origen.** Hoy el filtro vive en nuestro
código (`lib/trafico-real.ts`) y solo cambia lo que el sistema cuenta, no lo que
GA4 guarda. Filtrarlo en GA4 arreglaría también lo que ves tú en su panel.

---

## Lo que NO necesita permiso, y sigue pendiente

**Cerrar `dev.faststrat.ai`.** Aparece con 21 sesiones en la propiedad, además
de estar indexado en Google. Es otro servidor; el paso a paso está en
`lo-que-hay-que-hacer-a-mano.md`.

**Un embudo de verdad.** Para saber cuánto tiempo pasa alguien en la home
*antes* de pulsar, hace falta una exploración de embudo, que se construye en el
panel de GA4 y no se expone por la API de datos. Lo que sí se puede medir desde
aquí es la permanencia media por fuente, que ya se mide.

---

## El contexto que hace falta para leer cualquiera de estos números

De 1.825 sesiones en 28 días, **1.655 (91%) llegaban como directo con diez
segundos**. De ellas, 1.015 desde Singapur, y 960 de esas con el mismo
navegador exacto, "Chrome / Macintosh".

La audiencia real son **93 sesiones de Google con 39 segundos**, más 18 de
asistentes de IA. Unas 110 personas al mes.

Eso reencuadra todo lo demás: con esa muestra, cero conversiones no es un
fracaso del CTA ni del contenido. Es una muestra demasiado pequeña para
significar nada, y el problema a atacar es de volumen, no de conversión.

Dicho eso, un dato sí es tajante y no depende del tamaño de la muestra: en 90
días, **121 visitas a la app salieron de la home y CERO de un artículo**. La
home vende y los artículos no.
