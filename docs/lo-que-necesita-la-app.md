# Lo que hace falta del lado de la app

Dos cosas que este sistema no puede hacer y que bloquean la única pregunta que
importa: **¿qué contenido trae gente que paga?**

---

## 1. Que `purchase` lleve el valor de la compra

**Qué pasa hoy.** El evento se dispara, pero sin importe:

```
purchase   23 transacciones en 90 días
           ingresos registrados: 0
```

Sin valor, ese evento solo dice "alguien pulsó comprar". No distingue una venta
de una prueba, no dice cuánto vale un cliente, y no permite comparar si el
tráfico del blog vale más o menos que el de LinkedIn.

**Qué hay que enviar.** GA4 espera el evento de comercio electrónico estándar:

```js
gtag('event', 'purchase', {
  transaction_id: 'ID único de la transacción',  // evita contar dos veces
  value: 49.00,                                   // el importe cobrado
  currency: 'USD',                                // ISO 4217
  items: [{
    item_id: 'plan_pro_mensual',
    item_name: 'Plan Pro mensual',
    price: 49.00,
    quantity: 1,
  }],
});
```

`transaction_id` importa más de lo que parece: sin él, un usuario que recarga la
página de confirmación cuenta como dos ventas.

**Cómo comprobar que llegó.** En GA4, informes de monetización, o desde este
sistema: la métrica `totalRevenue` debe dejar de ser cero.

---

## 2. Excluir `localhost` y `dev.faststrat.ai` de la propiedad

**Qué pasa hoy.** La propiedad mide los entornos de desarrollo, y contaminan el
dato más importante:

```
purchase  localhost           17 veces, 3 usuarios
purchase  app.faststrat.ai     5 veces, 2 usuarios
purchase  dev.faststrat.ai     1 vez,   1 usuario
```

**Dieciocho de veintitrés compras son de desarrolladores probando.** Cualquier
informe que las cuente dice que hay ventas donde hay pruebas.

**Por qué no lo hace este sistema.** La API de administración de GA4 no expone
los filtros de datos ni la definición de tráfico interno; se comprobó en
`v1beta` y `v1alpha`. Solo se puede desde su panel.

Como paliativo, todas las consultas de este sistema filtran ya por el dominio de
producción (`lib/ga4.ts`, `soloProduccion()`). Eso arregla lo que ves aquí, pero
no lo que ves en el panel de GA4 ni lo que Google usa para sus modelos.

**Cómo hacerlo, en el panel de GA4:**

1. Administrar → Flujos de datos → el flujo de `faststrat.ai`.
2. Configurar ajustes de la etiqueta → Mostrar todo → **Definir tráfico interno**.
3. Crear regla: nombre `interno`, tipo de coincidencia *contiene*, valor la IP de
   la oficina; y otra para `localhost`.
4. Administrar → Filtros de datos → el filtro *Internal Traffic* que viene creado
   pasa de **Probando** a **Activo**.

El paso 4 es el que suele faltar: el filtro existe por defecto pero nace inactivo,
así que las reglas se definen y no filtran nada.

**Y por separado, cerrar `dev.faststrat.ai`.** Además de contaminar la
analítica, está indexado en Google. El paso a paso está en
`lo-que-hay-que-hacer-a-mano.md`, con la advertencia de que bloquear por
`robots.txt` algo ya indexado lo congela en el índice en vez de sacarlo.

---

## Lo que se desbloquea con las dos

Hoy el sistema puede decir cuánta gente llega de cada artículo y dónde se cae en
el embudo. Con esas dos cosas podría decir **cuánto dinero produce cada
artículo**, que es lo que convierte el SEO de un gasto en una inversión medible.

Sin ellas, la respuesta más honesta que puede dar es la que da ahora: en 90
días, 121 visitas a la app salieron de la home y cero de un artículo.
