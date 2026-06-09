# FastStrat SEO Dashboard

Dashboard interno de SEO + publicación de contenido para faststrat.ai. Next.js 16 + Tailwind v4.

- **En vivo:** https://faststrat-seo.onrender.com (login: usuario/contraseña en las env vars `DASHBOARD_*`)
- **Repo:** https://github.com/MSTG-FastStrat-LLC/faststrat-seo

---

## Qué hace cada página

- **`/` Dashboard** — clicks/impresiones/CTR/posición desde Google Search Console, 3 pie charts, tabla por página.
- **`/reports` Reportes** — solo tus artículos YA publicados. Cada uno trae un diagnóstico ("qué le pasa y qué hacer"), su tendencia vs el período anterior, las búsquedas que lo traen, y un botón **Optimizar con IA** para los que están en "striking distance".
- **`/ideas` Ideas** — qué escribir NUEVO: la tanda semanal del agente (con research de competidores y tendencias, cada insight con botón **Blog**), más oportunidades de queries de Search Console. Botones **Idea** / **Escribir** / **Refrescar investigación**.
- **`/blogs` Blogs** — los posts en `content/blog/*.md`. Cada uno: badge de estado real en WP (En vivo / Borrador / No publicado), **Publicar en vivo**, **Guardar como borrador**, y **Editar con IA**.

## Cómo trabajar con esto

### El flujo en una imagen
```
   Editás código en local
        │  git push
        ▼
   GitHub (MSTG-FastStrat-LLC/faststrat-seo)  ◄── el bot también commitea acá
        │  auto-deploy                            (ideas/blogs generados = [auto] ...)
        ▼
   Render  ──►  https://faststrat-seo.onrender.com
        ▲
   GitHub Actions (cron lunes) ──► POST /api/weekly
```

### Para cambiar el código
```bash
git clone https://github.com/MSTG-FastStrat-LLC/faststrat-seo.git
cd faststrat-seo
npm install
cp .env.local.example .env.local   # y llená las credenciales (ver abajo)
npm run dev                         # → http://localhost:3100
```
Hacés cambios, `npm run build` para verificar que compila, y:
```bash
git add -A && git commit -m "tu cambio" && git push
```
Render **despliega solo** al hacer push (tarda 3-5 min). Para forzar/ver el deploy: dashboard de Render → servicio `faststrat-seo`.

### Para gestionar Render por API (deploys, env vars)
```bash
KEY="<RENDER_API_KEY>"; SVC="srv-d8hd0p28pkls73cadrog"
# Disparar deploy del último commit:
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{}' \
  "https://api.render.com/v1/services/$SVC/deploys"
# Cambiar una variable:
curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"value":"NUEVO"}' \
  "https://api.render.com/v1/services/$SVC/env-vars/REPORT_EMAIL_TO"
```

### El día a día (sin tocar código)
1. Entrás a la app, revisás **Reportes** (cómo va lo publicado) e **Ideas** (qué escribir).
2. Apretás **Escribir** / **Generar** / **Blog** → el agente redacta → el borrador aparece en **Blogs**.
3. En **Blogs** lo revisás, lo ajustás con **Editar con IA** si querés, y **Publicar en vivo**.
4. Cada lunes te llega un email con 10 ideas nuevas (cron de GitHub Actions).

---

## Setup local

1. `npm install`
2. Creá `.env.local` con las variables de abajo.
3. `npm run dev` → http://localhost:3100  *(sin `DASHBOARD_*` no pide login en local)*

### Variables de entorno

```
# Google Search Console (OAuth2)
GSC_SITE_URL=sc-domain:faststrat.ai
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:9876/oauth2callback
GOOGLE_REFRESH_TOKEN=...        # generar una vez: node scripts/get-refresh-token.mjs

# Agente SEO (Anthropic vía suscripción Claude)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...   # generar con: claude setup-token

# WordPress (Application Password, NO la contraseña de login)
WP_URL=https://faststrat.ai
WP_USER=walter.vonroestel@faststrat.ai
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Email semanal (Resend; tier gratis solo envía al dueño de la cuenta)
RESEND_API_KEY=re_...
REPORT_EMAIL_TO=marx2096@gmail.com

# Persistencia git-as-storage (solo producción)
GIT_PERSIST_TOKEN=ghp_...        # PAT con scope repo
GIT_PERSIST_REPO=MSTG-FastStrat-LLC/faststrat-seo
GIT_PERSIST_BRANCH=main

# Cron semanal
WEEKLY_SECRET=...                # string aleatorio (debe coincidir con el secret de GitHub Actions)
APP_BASE_URL=https://faststrat-seo.onrender.com

# Login del dashboard (solo producción)
DASHBOARD_USER=walter
DASHBOARD_PASSWORD=...
```

> `.env.local` está en `.gitignore` — los secretos NUNCA se suben al repo; viven solo como env vars en Render.

## Deploy en Render (tier gratis)

`render.yaml` define el servicio web. El cron NO va en Render (su plan free no permite cron) — corre en GitHub Actions.

1. Render → **New → Blueprint** → este repo. Detecta `render.yaml` y crea el web service.
2. En **Environment** del web service, pegá todas las variables (menos `GOOGLE_REDIRECT_URI`).
3. En GitHub → repo **Settings → Secrets → Actions**, agregá `APP_BASE_URL` y `WEEKLY_SECRET` (para el cron).

### Persistencia en free tier
El free tier de Render borra archivos al reiniciar. La app hace **commit + push automático** al repo en cada cambio (`GIT_PERSIST_TOKEN`), así ideas/blogs/tandas semanales sobreviven. Al reiniciar, Render hace `git clone` con los datos ya dentro.

### Cron semanal (GitHub Actions)
`.github/workflows/weekly.yml` corre los lunes 10:00 UTC y hace `POST /api/weekly`. Se puede disparar a mano desde la pestaña **Actions → Weekly content batch → Run workflow**.

## Categorías de WordPress

La página de **Resources** de faststrat.ai solo lista las categorías establecidas del sitio. Los posts se mapean automáticamente (`app/api/wordpress/publish/route.ts → siteCategory`):
- Español/LATAM → **Recursos LATAM**
- Temas de IA → **AI (Artificial Intelligence)**
- El resto → **Marketing**

## Scripts

- `node scripts/get-refresh-token.mjs` — refresh token de Google (one-time, server local en :9876).
- `node scripts/list-sites.mjs` — propiedades de GSC y nivel de permiso.
- `node scripts/topic-opportunities.mjs` — analiza queries y sugiere temas (clusters).
- `node scripts/generate-covers.ts` — regenera las portadas PNG de `public/covers/`.

## Notas / gotchas

- **GSC**: propiedad `sc-domain:faststrat.ai` (tipo Domain), OAuth2 (no service account).
- **Agente IA**: usa la suscripción de Claude; tiene **límite semanal** — si se agota, las funciones de IA fallan hasta el reset (las demás siguen).
- **Recharts 3**: el `Tooltip` necesita `formatter={(v)=>typeof v==='number'?...}`.
- `scripts/` está excluido del tsconfig (usa imports `.ts`).
- La marca es siempre clara (crema/granate); el dark mode automático está desactivado en `globals.css`.
