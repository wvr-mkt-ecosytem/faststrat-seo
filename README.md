# FastStrat SEO Dashboard

App independiente para analítica de Google Search Console y publicación de contenido a WordPress para faststrat.ai. Next.js 16 + Tailwind v4.

## Qué hace

- **Dashboard (`/`)** — clicks, impresiones, CTR y posición por página desde Search Console, con selector de rango (7/14/28/90 días), tabla filtrable y 3 pie charts (clicks por página, demanda por tema, oportunidad de temas nuevos).
- **Blogs (`/blogs`)** — lista los posts en `content/blog/*.md` y los publica/actualiza en WordPress vía REST API (idempotente por slug).

## Setup

1. `npm install`
2. Copia tus credenciales a `.env.local` (ver variables abajo).
3. `npm run dev` → http://localhost:3100

### Variables de entorno (`.env.local`)

```
GSC_SITE_URL=sc-domain:faststrat.ai
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:9876/oauth2callback
GOOGLE_REFRESH_TOKEN=...        # generar con: node scripts/get-refresh-token.mjs
WP_URL=https://faststrat.ai
WP_USER=...                     # usuario de WordPress
WP_APP_PASSWORD=...             # Application Password (Usuarios → Perfil → Contraseñas de aplicación)
```

## Scripts útiles

- `node scripts/get-refresh-token.mjs` — obtiene el refresh token de Google (one-time).
- `node scripts/list-sites.mjs` — lista las propiedades de GSC y su nivel de permiso.
- `node scripts/topic-opportunities.mjs` — analiza queries y sugiere temas nuevos (clusters striking-distance / sin explotar).

## Notas de la propiedad GSC

La propiedad correcta es **`sc-domain:faststrat.ai`** (tipo Domain), no `https://faststrat.ai/`. Se usa OAuth2, no service account (GSC rechaza service accounts como usuario).
