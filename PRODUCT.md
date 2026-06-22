# FastStrat SEO Engine — Product Overview

> Motor de SEO autónomo: convierte los datos reales de búsqueda de tu sitio en
> contenido publicado, sin equipo de SEO ni agencia.

**En vivo:** https://faststrat-seo.onrender.com · **Stack:** Next.js 16 + Tailwind v4 + Agente de IA (Claude) + Google Search Console + WordPress

---

## 1. El problema que resuelve

Las PYMEs saben que necesitan contenido para rankear, pero:
- No saben **sobre qué escribir** (qué busca su audiencia, dónde están cerca de página 1).
- No tienen tiempo ni equipo para **producir** artículos de calidad cada semana.
- No saben si lo que publican **está funcionando** ni qué optimizar.

El SEO Engine cierra ese ciclo completo, solo.

## 2. El ciclo (el corazón del producto)

```
   Google Search Console
   (datos reales: qué busca la gente, dónde apareces)
              │
              ▼
   ANÁLISIS ──► detecta oportunidades:
              │   • temas que ya te dan clicks
              │   • "striking distance" (pos 5-20 → a un empujón de página 1)
              │   • búsquedas sin contenido propio
              ▼
   INVESTIGACIÓN ──► el agente busca en la web:
              │       competidores + tendencias de industria 2026
              ▼
   IDEAS ──► artículos sugeridos, priorizados por impacto
              ▼
   REDACCIÓN ──► el agente escribe artículos de calidad (1.500-2.400 palabras,
              │   optimizados para Google y para citación en IA/GEO)
              ▼
   PUBLICACIÓN ──► a WordPress en vivo, con portada de marca y categoría correcta
              ▼
   MEDICIÓN ──► vuelve a GSC → el ciclo se repite y mejora cada semana
```

## 3. Módulos (lo que ve el usuario)

### 📊 Dashboard
Analítica de Google Search Console: clicks, impresiones, CTR y posición por página,
con selector de rango (7/14/28/90 días), tabla filtrable y 3 gráficos de torta
(clicks por página, demanda por tema, oportunidades nuevas).

### 📈 Reportes
Cómo le va a **cada artículo publicado**, con un **diagnóstico en lenguaje claro**:
"qué le está pasando y qué hacer". Detecta los que están creciendo, los estancados,
y los que están en *striking distance*. Botón **Optimizar con IA**: el agente reescribe
el artículo para capturar mejor las búsquedas donde está cerca del top.

### 💡 Ideas
El centro de generación de contenido:
- **Tanda semanal** investigada por el agente (competidores + tendencias, en inglés).
- **Oportunidades de queries** de Search Console sin contenido propio.
- **Insights accionables**: cada observación de competidor/tendencia tiene botón para
  escribir un blog sobre ese tema.
- **Generar más artículos**: suma contenido alimentado por (1) lo que más clicks da,
  (2) striking-distance, (3) research de competidores/industria, (4) potencial de posicionamiento.
- **Escribir todos los blogs**: redacta toda la tanda de un solo click.

### ✍️ Blogs
Los artículos generados: editar con IA (instrucciones en lenguaje natural),
**publicar en vivo** o como borrador, y **publicar todos** con un click.
Cada uno muestra su **estado real en WordPress** (en vivo / borrador / no publicado),
verificado contra el sitio — no asumido.

## 4. Capacidades de IA (agente)

| Acción | Qué hace |
|---|---|
| **Generar artículo** | Redacta un post completo de calidad publicable desde un keyword o tema |
| **Escribir desde idea/insight** | Convierte una idea o un insight de competidor en un artículo |
| **Optimizar** | Reescribe un artículo existente para capturar sus queries striking-distance |
| **Editar** | Aplica cambios por instrucción ("hazlo más corto", "agrega sección de GEO") |
| **Investigación semanal** | Busca en la web competidores + tendencias y arma 10 ideas |

Estándar de calidad del contenido: 1.500-2.400 palabras, intro con gancho, respuesta
directa extractable (para que ChatGPT/Perplexity lo citen — GEO), tablas, FAQ, voz
experta, optimizado para la keyword sin saturar.

## 5. Automatización

- **Cron semanal** (GitHub Actions, lunes): genera 10 ideas nuevas + investigación
  fresca y envía un **email** de aviso.
- **Portadas automáticas**: cada artículo recibe una imagen destacada con la identidad
  de marca FastStrat (generada por código, 1600×900).
- **Publicación a WordPress**: en las categorías reales del sitio (Marketing / AI /
  Recursos LATAM) para que aparezcan en la página de Resources, con confirmación real.

## 6. Diferenciadores

- **Data-driven, no a ciegas**: cada artículo nace de una señal real de Search Console.
- **Ciclo cerrado**: analiza → investiga → escribe → publica → mide → repite.
- **Calidad GEO-ready**: contenido pensado para rankear en Google *y* ser citado por IA.
- **Cero fricción**: de "no sé qué escribir" a "publicado en vivo" en un puñado de clicks.
- **Marca consistente**: portadas y categorías alineadas al sitio automáticamente.

## 7. Arquitectura técnica (resumen)

- **Frontend/Backend:** Next.js 16 (App Router) + Tailwind v4, desplegado en Render.
- **Datos de búsqueda:** Google Search Console API (OAuth2, propiedad de dominio).
- **IA:** Agente Claude (Agent SDK) con WebSearch para research en tiempo real.
- **Publicación:** WordPress REST API (Application Password) + imagen destacada.
- **Persistencia:** "git-as-storage" — el contenido generado se versiona en GitHub.
- **Email:** Resend. **Programación:** GitHub Actions (cron gratis).
- **Acceso:** dashboard protegido con login.

---

*Un motor que toma lo que tu audiencia ya está buscando en Google y lo convierte,
semana a semana, en contenido publicado que sube tu posicionamiento.*
