# Montar el sistema para otro cliente

No hay que tocar código. Se rellena `.env.local` (o el panel de variables de
Render) y se despliega. Este documento es el orden en que conviene hacerlo y las
trampas que ya nos costaron tiempo una vez.

Calcula media jornada. Casi todo el reloj se va esperando permisos de Google y
verificaciones de dominio, no configurando.

---

## 1. Quién es el cliente

Es el único bloque que cambia lo que el sistema *escribe*. El resto son
credenciales.

```
CLIENTE_NOMBRE=
CLIENTE_DOMINIO=
CLIENTE_DOMINIO_APP=
CLIENTE_SUFIJO_TITULO=
CLIENTE_QUE_HACE=
CLIENTE_MERCADOS=
CLIENTE_COMPETIDORES=
CLIENTE_MARCA_ALIAS=
```

Dos avisos que valen más que el resto de la sección:

**`CLIENTE_QUE_HACE` va literal dentro de cada prompt.** Si dice "software para
empresas", el contenido sale genérico y no hay ajuste posterior que lo salve. Si
dice "plataforma de agentes de IA de marketing para PYMEs y agencias pequeñas",
el agente sabe a quién le habla. Es la variable con más efecto sobre la calidad
de todo lo que produzca el sistema.

**`CLIENTE_SUFIJO_TITULO` es lo que el tema de WordPress añade al `<title>`.**
Google corta en 60 caracteres y ese sufijo se cobra siempre. Escríbelo con el
espacio y el guion incluidos, tal cual salen en el navegador: `` - cliente.com``.
Si te lo saltas, el sistema deja escribir títulos que en la SERP salen cortados
a media palabra.

**`CLIENTE_MARCA_ALIAS` solo hace falta cuando el nombre no basta.** El sistema
ya deduce solo el nombre pegado, el nombre con espacios y la raíz del dominio.
Los alias son para lo que no se deduce: "Grupo Triple-S" se busca como
"triple s", sin el "grupo". Sirve para que el sistema no te proponga como "idea
de contenido" una búsqueda del propio nombre del cliente, que es tráfico que ya
se tiene.

---

## 2. Google: Search Console y Analytics

Un solo proyecto de OAuth cubre los dos. Hay dos trampas aquí, y las dos nos
costaron semanas de sistema muerto sin que nada lo dijera.

**La app de OAuth tiene que estar publicada.** En la pantalla de consentimiento,
si el estado es *Testing*, los refresh tokens **caducan a los siete días**. El
sistema funciona una semana, deja de funcionar, y el error que devuelve Google
(`invalid_grant`) no menciona en ningún momento que la causa sea el modo de
publicación. Ponla *In production* antes de generar ningún token.

**Los permisos de un refresh token están congelados.** Añadir un scope después no
cambia un token ya emitido: hay que generarlo otra vez. Si más adelante quieres
que el sistema escriba en GA4, no basta con marcar la casilla; hay que rehacer el
token.

Con eso claro:

```bash
node scripts/get-refresh-token.mjs
```

Rellena `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`GSC_SITE_URL` y `GA4_PROPERTY_ID`.

`GSC_SITE_URL` lleva el prefijo tal cual lo tenga la propiedad en Search Console:
`sc-domain:cliente.com` si está verificada por dominio, o la URL completa con
`https://` si está por prefijo. Mezclarlos devuelve cero filas sin error.

El token de escritura es aparte y **opcional**. Solo hace falta para marcar
conversiones y crear dimensiones desde el panel; sin él, el sistema lee GA4
igual:

```bash
node scripts/get-measurement-token.mjs
```

---

## 3. El agente

```bash
claude setup-token
```

Va en `CLAUDE_CODE_OAUTH_TOKEN`.

**Comparte cupo con el uso normal de Claude de quien lo genere.** Si esa persona
está trabajando, el sistema compite por el mismo límite y las corridas largas se
cortan a media faena con "session limit". Para un cliente en serio, una cuenta
propia.

---

## 4. WordPress

```
WP_URL=
WP_USER=
WP_APP_PASSWORD=
```

`WP_APP_PASSWORD` es una *Application Password* (Usuarios → Perfil → al final),
no la contraseña de acceso.

`WP_URL` es donde vive el WordPress, que **no tiene por qué ser
`CLIENTE_DOMINIO`**. En una instalación headless o con el blog en un subdominio
son distintos, y confundirlos hace que el sistema publique en el sitio
equivocado.

Si el cliente no usa WordPress, todo lo demás funciona igual: se pierden publicar
y aplicar títulos, y se conservan el análisis, las ideas y la redacción.

---

## 5. Guardado y despliegue

```
GIT_PERSIST_TOKEN=
GIT_PERSIST_REPO=organizacion/repositorio
WEEKLY_SECRET=
APP_BASE_URL=
DASHBOARD_USER=
DASHBOARD_PASSWORD=
```

**`GIT_PERSIST_TOKEN` no es opcional en producción.** El sistema guarda ideas,
informes y borradores como archivos y los commitea al repositorio. En Render el
disco se borra cada vez que la instancia se reinicia, cosa que en el plan gratis
pasa sola. Sin este token, todo lo que genere el sistema se pierde y no avisa.

En el repositorio del cliente hay que añadir como *secrets* de GitHub Actions
`APP_BASE_URL` y `WEEKLY_SECRET`, o el trabajo del lunes no se dispara.

---

## 6. Comprobar antes de dar por bueno

```bash
node scripts/check-google-setup.mjs
```

Y después, en el panel, mira que estas cuatro respondan con datos y no con ceros:
Search Console, Analytics, Ideas y Reportes. Un cero limpio casi siempre es una
propiedad mal escrita, no un cliente sin tráfico.

Por último, genera **un** artículo de prueba y léelo entero antes de publicar
nada. Es la única forma de ver si `CLIENTE_QUE_HACE` está bien puesto: si el
texto podría ser de cualquier empresa del sector, la descripción es demasiado
vaga y conviene concretarla antes de generar en volumen.

---

## Lo que NO cambia entre clientes

Las reglas de SEO y de GEO (`lib/house-rules.ts`) y la compuerta que las
comprueba (`lib/qa.ts`) son universales: no nombran a ningún cliente y reciben el
dominio por parámetro.

Merece la pena saber por qué están separadas. La primera versión de la compuerta
traía "prohibido el em dash" del manual de estilo de otro cliente y bloqueó los
dieciséis artículos de este, que los usaba con normalidad. Las reglas de
posicionamiento viajan de un cliente a otro; las de estilo de marca, no. Si
mezclas las dos cosas, el sistema le impone a un cliente el manual de otro.

Por eso lo tipográfico vive en la configuración del cliente
(`CLIENTE_SIN_RAYA_LARGA`) y no en las reglas.
