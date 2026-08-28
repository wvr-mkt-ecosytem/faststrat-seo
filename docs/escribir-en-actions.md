# Escribir artículos: por qué en GitHub Actions y no en el servidor

## El problema, medido

En el plan gratuito de Render el servicio tiene una fracción de procesador.
Cuando el agente escribe un artículo se lo come entero, el servidor deja de
responder a la comprobación de salud que Render le hace cada 5 segundos, Render
da el servicio por caído y lo reinicia. El artículo muere con el reinicio.

Las tres pruebas que lo demuestran:

```
502 a los 3,2 minutos          · con la instancia despierta (respondía en 0,5 s justo después)
health check failed            · "timed out after 5 seconds", alerta de Render
28 minutos sin resultado       · ni artículo ni commit
```

Lo confirma por contraste que las cosas ligeras sí funcionan: la tanda de ideas
de los lunes se completa sin problema. Escribir 2.000 palabras es otra cosa.

## Qué se hizo

El trabajo pesado corre en GitHub Actions: gratis, con procesador dedicado y
hasta seis horas por trabajo. Ya se usaba para el trabajo de los lunes.

**La lógica no está duplicada.** Vive en `lib/escribir.ts` y la llaman las dos
vías: la ruta web (`/api/blog/generate`) y el trabajo de Actions
(`scripts/escribir.mjs`). Copiarla habría garantizado que se separaran a la
primera corrección, y entonces el artículo saldría distinto según por dónde se
pidiera.

## Cómo se lanza a mano

En GitHub: **Actions → Escribir un artículo → Run workflow**. Los campos:

| Campo | Para qué |
|---|---|
| `keyword` | La consulta a posicionar. Es lo normal. |
| `topic` | Un ángulo suelto, si no hay keyword clara. El agente elige el título. |
| `title` | El título exacto. Vacío = lo elige el agente. |
| `lang` | `en` o `es`. |
| `publishAt` | Fecha ISO para programarlo. Vacío = sin programar. |
| `force` | Escribir aunque el título se pise con algo publicado. |

El artículo llega como un commit y aparece solo en la pestaña Blogs.

## Los secrets que necesita

En **Settings → Secrets and variables → Actions**, como *secrets*:

```
CLAUDE_CODE_OAUTH_TOKEN    el agente
WP_URL, WP_USER, WP_APP_PASSWORD    el catálogo de títulos, para no repetir
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GSC_SITE_URL
```

Y como *variables* (no son secretos):

```
CLIENTE_NOMBRE, CLIENTE_DOMINIO, CLIENTE_DOMINIO_APP, CLIENTE_AUTOR, CLIENTE_QUE_HACE
```

**Sin las de WordPress, el sistema no puede comprobar si el artículo nuevo se
pisa con alguno de los ya publicados**, y ahí es donde nacen las
canibalizaciones que después hay que deshacer con redirecciones.

Sin las de `CLIENTE_`, el artículo sale firmado y escrito para FastStrat, que
es el valor por defecto.

## Un detalle sobre los correos de error

Si el sistema frena un artículo porque el título se pisa con algo que ya existe,
el trabajo **termina bien** y no llega correo de fallo. Frenar es su trabajo, no
un accidente: un correo de "run failed" ahí entrenaría a ignorarlos.

## Lo que la ruta web sigue sirviendo

`/api/blog/generate` no se borró. Vale para desarrollo local, donde no hay
límite de CPU, y sigue siendo la misma lógica. Lo que no aguanta es la
producción en el plan gratuito.
