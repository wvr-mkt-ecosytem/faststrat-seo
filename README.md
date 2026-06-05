# FastStrat SEO Dashboard

Dashboard interno de SEO + publicación de contenido para faststrat.ai. Next.js 16 + Tailwind v4.

## Páginas

- **`/` Dashboard** — clicks/impresiones/CTR/posición desde Search Console, 3 pie charts, tabla por página.
- **`/reports` Reportes** — striking-distance y queries sin explotar; cada fila tiene botones "Idea" y "Generar" que llaman al agente y muestran el resultado.
- **`/ideas` Ideas** — tanda semanal de 10 artículos sugeridos + research de competidores y tendencias.
- **`/blogs` Blogs** — los posts en `content/blog/*.md`, con edición por el agente y publicación a WordPress (con portada como featured_media).

## Setup local

1. `npm install`
2. Llena `.env.local` (ver variables abajo).
3. `npm run dev` → http://localhost:3100

### Variables de entorno

```
# Google Search Console (OAuth2)
GSC_SITE_URL=sc-domain:faststrat.ai
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:9876/oauth2callback
GOOGLE_REFRESH_TOKEN=...        # node scripts/get-refresh-token.mjs

# Agente SEO (Anthropic vía suscripción)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...   # claude setup-token

# WordPress
WP_URL=https://faststrat.ai
WP_USER=walter.vonroestel@faststrat.ai
WP_APP_PASSWORD=...             # Application Password, NO la de login

# Email semanal
RESEND_API_KEY=re_...
REPORT_EMAIL_TO=walter.vonroestel@faststrat.ai

# Persistencia (solo producción — Render free tier)
GIT_PERSIST_TOKEN=ghp_...       # PAT con scope repo
GIT_PERSIST_REPO=MSTG-FastStrat-LLC/faststrat-seo
GIT_PERSIST_BRANCH=main

# Schedule semanal
WEEKLY_SECRET=...               # cualquier string aleatorio
APP_BASE_URL=https://faststrat-seo.onrender.com

# Login del dashboard en producción
DASHBOARD_USER=walter
DASHBOARD_PASSWORD=...
```

## Deploy en Render (tier gratis)

El proyecto incluye `render.yaml` con un servicio web + cron job semanal, todo en tier gratis.

1. En Render: **New → Blueprint** → conecta este repo. Render detecta `render.yaml` y crea los 2 servicios.
2. En el dashboard del servicio web, **Environment**, agrega todas las variables de arriba (las de `.env.local` excepto `GOOGLE_REDIRECT_URI`).
3. En el cron job, agrega `APP_BASE_URL` y `WEEKLY_SECRET`.
4. Cuando el web service esté arriba, copia su URL y úsala como `APP_BASE_URL` en el cron.

### Cómo persiste el contenido en free tier

El tier gratis de Render no tiene disco persistente — los archivos se borran al reiniciar. La app hace **commit + push automático** al repo en cada cambio (`GIT_PERSIST_TOKEN`) para que las ideas, blogs y la tanda semanal sobrevivan reinicios. Al arrancar de nuevo, Render hace `git clone` del repo (con los datos ya dentro).

## Scripts

- `node scripts/get-refresh-token.mjs` — refresh token de Google (one-time).
- `node scripts/list-sites.mjs` — propiedades de GSC y permisos.
- `node scripts/generate-covers.ts` — regenera las portadas PNG de `public/covers/`.
