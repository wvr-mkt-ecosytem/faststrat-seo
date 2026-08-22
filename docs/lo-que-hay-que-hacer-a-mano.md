# Lo que el sistema no puede aplicar, y cómo hacerlo

Tres de las recomendaciones del analista viven fuera de WordPress: en el
servidor, en el DNS o en la configuración del hosting. El sistema no tiene
acceso ahí, y **un botón que dijera "aplicar" sin poder hacerlo sería peor que
no tenerlo**, así que aquí está el paso a paso.

Están ordenadas por lo que más daño hace hoy.

---

## 1. Cerrar `dev.faststrat.ai` — primero, y hoy

**Por qué va primero.** El entorno de desarrollo está indexado y sirve el mismo
contenido que producción. Cada mejora de autoridad que consigas se reparte entre
dos dominios que Google considera duplicados. Todo lo demás rinde menos mientras
esto siga abierto.

**La forma buena: autenticación HTTP.** Impide el rastreo de raíz, no solo la
indexación. Si `dev` está en Render, en el panel del servicio:

1. Environment → añade `DASHBOARD_USER` y `DASHBOARD_PASSWORD` (el proyecto ya
   trae el proxy que las usa, es el mismo mecanismo que protege este panel).
2. Manual Deploy → Restart service.

**Si necesitas que siga accesible sin contraseña**, entonces las dos cosas a la
vez, porque una sola no basta:

Un `robots.txt` en la raíz de `dev`:

```
User-agent: *
Disallow: /
```

Y en el `<head>` del layout raíz:

```html
<meta name="robots" content="noindex,nofollow" />
```

**Cuidado con el orden.** Si bloqueas por `robots.txt` una página que ya está
indexada, Google deja de rastrearla y por tanto **nunca lee el `noindex`**: se
queda en el índice indefinidamente. Si ya hay páginas indexadas, primero pon el
`noindex`, espera a que desaparezcan, y solo entonces bloquea por robots.

**Cómo comprobarlo.** En Google, busca `site:dev.faststrat.ai`. Cuando devuelva
cero resultados, está hecho. Tarda entre días y semanas.

---

## 2. Las redirecciones 301 — la de más impacto

**Por qué importa.** Es la recomendación con más tráfico en juego del informe:
dos páginas propias saliendo como resultados 1 y 2 de la misma consulta, con
miles de impresiones y cero clics entre las dos.

**Antes de redirigir, lee esto.** Una 301 es difícil de deshacer: Google tarda
semanas en reevaluar y los enlaces externos que apuntaban a la vieja pasan a la
nueva. Dos precauciones que no me saltaría:

- **Absorbe primero lo que la página que muere hiciera mejor.** Si la que vas a
  redirigir tiene una sección, un dato o un enfoque que la superviviente no
  tiene, cópialo antes. Redirigir es fusionar, no borrar.
- **Comprueba que no sean idiomas distintos.** Dos artículos sobre el mismo tema
  en español y en inglés **no** son duplicados: ahí va `hreflang`, no una 301.
  Redirigir uno al otro te deja sin la versión del idioma que más convierte.

**Cómo hacerlo, la vía segura.** Con el plugin **Redirection** de WordPress
(gratuito), no tocando el `.htaccess`. Registra los accesos, avisa de bucles y
se deshace desde el panel.

1. Plugins → Añadir nuevo → busca "Redirection" → instalar y activar.
2. Herramientas → Redirection → Add new redirection.
3. Source URL: la ruta que muere. Target URL: la que sobrevive.
4. Deja el tipo en 301 (permanente).

**El orden importa.** Haz todas las de un mismo grupo a la vez, no una por
semana: así Google recalcula una sola vez en vez de varias.

**Después de redirigir**, en Search Console → Inspección de URLs, pega la página
que sobrevive y pulsa "Solicitar indexación". Acelera bastante el recálculo.

**Cómo comprobarlo.** En la terminal:

```bash
curl -I https://faststrat.ai/LA-RUTA-VIEJA/
```

Tiene que decir `HTTP/2 301` y traer un `location:` con la ruta nueva. Si dice
`200`, la redirección no está activa.

---

## 3. Los PDFs y los feeds indexados

**El problema de los PDFs.** Los archivos de `/wp-content/uploads/` están
indexados y compiten con la página que los contiene. Google decide cuál mostrar
y no siempre acierta: el informe detectó un PDF absorbiendo la señal de su
propia página.

Un PDF no admite etiqueta `meta robots`, así que se hace por cabecera HTTP. En
el `.htaccess` de la raíz:

```apache
<FilesMatch "\.pdf$">
  Header set X-Robots-Tag "noindex, follow"
</FilesMatch>
```

El `follow` es deliberado: que no se indexe el PDF, pero que Google siga los
enlaces que contenga.

**Los feeds.** WordPress genera un `/feed/` por cada entrada y categoría. Son
inofensivos pero consumen presupuesto de rastreo. En el `robots.txt` de
producción:

```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /feed/
Disallow: /*/feed/
Disallow: /*?s=

Sitemap: https://faststrat.ai/sitemap_index.xml
```

**No bloquees `/wp-content/themes/`.** Es tentador para esconder archivos
sueltos, pero ahí viven tu CSS y tu JavaScript: si los bloqueas, Google no puede
renderizar el sitio y eso sí hace daño de verdad. Los archivos sobrantes se
borran por FTP, no se bloquean.

---

## Lo que sí aplica el sistema

Para que la frontera quede clara:

| Acción | Quién |
|---|---|
| Cambiar un título | El sistema, con vista previa antes |
| Añadir el CTA | El sistema, y ahora bloquea si falta |
| Reescribir un artículo | El sistema, como borrador que apruebas |
| Escribir uno nuevo | El sistema |
| Publicar a WordPress | El sistema |
| Redirecciones 301 | Tú |
| Cerrar el subdominio de dev | Tú |
| `robots.txt` y cabeceras | Tú |

La línea no es técnica, es de reversibilidad: **el sistema hace lo que se puede
deshacer, y te deja a ti lo que no.**
