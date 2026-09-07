# Mantener el panel despierto

## El problema

El plan gratuito de Render duerme el servicio tras unos minutos sin visitas. Al
despertar tarda casi un minuto, y durante esa ventana devuelve **503**.

Medido el 7 de septiembre de 2026:

| | |
|---|---|
| `/` en frío | 53,6 s |
| `/` en caliente | 0,3 s |
| Las otras cinco pantallas, ya despierto | 0,2–0,3 s |

No es un fallo del sistema. Y **no afecta al trabajo automático**: desde que la
corrida de los lunes se movió a GitHub Actions, ni las ideas, ni el informe, ni
la escritura de artículos pasan por Render. Un servicio dormido solo se nota en
la primera visita al panel después de un rato.

## La solución

Un vigilante externo que haga ping cada pocos minutos. UptimeRobot lo hace
gratis y de paso avisa por correo si el servicio se cae de verdad.

### Qué vigilar

```
https://faststrat-seo.onrender.com/api/health
```

Esa ruta está en `PUBLICO_SIEMPRE` (ver `proxy.ts`), así que no pide
autenticación, y devuelve `ok` sin tocar GA4, ni WordPress, ni el agente. Es la
más barata que existe: vigilar `/` levantaría el render de la página entera en
cada ping.

**No vigiles** `/api/weekly` ni `/api/ga4/analyst`: cuestan minutos de agente.

### Cómo montarlo

1. Crear cuenta en [uptimerobot.com](https://uptimerobot.com) (el plan gratuito
   basta: 50 monitores, ping cada 5 minutos).
2. **Add New Monitor**
   - Monitor Type: `HTTP(s)`
   - Friendly Name: `Panel SEO`
   - URL: la de arriba
   - Monitoring Interval: `5 minutes`
3. En **Alert Contacts To Notify**, marcar el correo. Así el ping deja de ser
   solo un despertador y pasa a avisar cuando el servicio se cae.

### Qué esperar

Con ping cada 5 minutos el servicio no llega a dormirse, así que el panel abre
siempre en menos de un segundo. El coste para Render es una petición trivial
cada cinco minutos.

## Al replicar el sistema a otro cliente

Cambia el dominio y listo. Si el cliente está en un plan de pago de Render (o en
otra plataforma sin suspensión), esto no hace falta para mantenerlo despierto —
pero sigue valiendo la pena por el aviso de caída.
