# hreflang: el fragmento que hay que pegar una vez

## Qué problema resuelve

Cuando el sistema escribe un artículo en dos idiomas, salen **dos páginas
distintas** con dos URLs. Google no tiene forma de saber que son la misma cosa
en otro idioma: puede tratarlas como contenido duplicado, o enseñarle la
inglesa a alguien que buscó en español.

`hreflang` es la etiqueta que se lo dice. Sin ella, escribir en dos idiomas
puede restar en vez de sumar.

## Por qué hace falta pegar algo a mano

Lo investigué antes de pedírtelo. En tu WordPress:

- **No hay plugin multilingüe** (ni WPML ni Polylang), que es lo que
  normalmente emite estas etiquetas.
- **Rank Math no las emite** sin uno de esos plugins.
- **La meta personalizada se ignora**: mandé el campo por API, WordPress
  respondió `200` y no guardó nada. WordPress solo acepta campos que alguien
  haya registrado antes, y registrarlos requiere código.

Lo que sí tienes es **WPCode Lite**, ya activo. Con él se pega el código una
vez desde el panel, sin tocar archivos ni instalar nada más.

Después de pegarlo, el sistema hace el resto solo: cada vez que escriba una
versión en otro idioma, guardará la pareja y las etiquetas aparecerán.

## Cómo se pega

1. En WordPress: **Code Snippets → + Add Snippet → Add Your Custom Code**
2. Nombre: `hreflang de versiones por idioma`
3. Tipo de código: **PHP Snippet**
4. Pega el bloque de abajo
5. Ubicación: **Run Everywhere**
6. Activa el interruptor y **Save Snippet**

```php
<?php
/**
 * hreflang para las versiones en otro idioma.
 *
 * Registra el campo que guarda la pareja y emite las etiquetas en el <head>.
 * El sistema de contenido escribe el campo por la API REST; aquí solo se lee.
 */

// 1. El campo, visible para la API REST. Sin registrarlo, WordPress acepta la
//    petición y descarta el valor en silencio.
add_action( 'init', function () {
	register_post_meta( 'post', 'faststrat_alternate', [
		'show_in_rest'  => [
			'schema' => [
				'type'       => 'object',
				'properties' => [
					'lang' => [ 'type' => 'string' ],
					'url'  => [ 'type' => 'string' ],
				],
			],
		],
		'single'        => true,
		'type'          => 'object',
		'auth_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
	] );
} );

// 2. Las etiquetas en el <head> de cada artículo que tenga pareja.
add_action( 'wp_head', function () {
	if ( ! is_singular( 'post' ) ) {
		return;
	}

	$post_id = get_the_ID();
	$alt     = get_post_meta( $post_id, 'faststrat_alternate', true );

	if ( empty( $alt['lang'] ) || empty( $alt['url'] ) ) {
		return;
	}

	// El idioma de ESTA página. Se guarda junto a la pareja para no tener que
	// deducirlo: adivinarlo por el contenido falla justo en los artículos
	// mezclados, que son los que más importan aquí.
	$propio = ! empty( $alt['self_lang'] ) ? $alt['self_lang'] : ( $alt['lang'] === 'es' ? 'en' : 'es' );

	$pares = [
		$propio      => get_permalink( $post_id ),
		$alt['lang'] => $alt['url'],
	];

	// Google exige que cada versión se anuncie a sí misma Y a las otras. Si
	// una no se incluye, ignora el grupo entero.
	foreach ( $pares as $lang => $url ) {
		printf(
			'<link rel="alternate" hreflang="%s" href="%s" />' . "\n",
			esc_attr( $lang ),
			esc_url( $url )
		);
	}

	// x-default: a dónde va quien no encaja en ninguno de los dos idiomas.
	printf(
		'<link rel="alternate" hreflang="x-default" href="%s" />' . "\n",
		esc_url( $pares['en'] ?? reset( $pares ) )
	);
}, 5 );
```

## Cómo comprobar que funcionó

Cuando haya un artículo con su pareja publicada, abre la página, mira el código
fuente (`Ctrl+U`) y busca `hreflang`. Tienen que salir **tres líneas**: una por
idioma más la `x-default`.

Si no salen, casi siempre es una de dos cosas: el fragmento está guardado pero
no activo, o la caché de LiteSpeed está sirviendo la versión vieja de la página
(*LiteSpeed Cache → Toolbox → Purge All*).

## Lo que NO resuelve esto

`GTranslate`, que también tienes activo, traduce en el navegador con un widget.
Esas traducciones **no tienen URL propia y Google no las indexa**: no son
páginas en español a efectos de posicionamiento, y no se llevan con hreflang.
Las páginas que sí cuentan son las que escribe el sistema.
