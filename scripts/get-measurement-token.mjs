// Autoriza Tag Manager y GA4 en una sola pasada, y guarda su refresh token.
//
// Va aparte del de Search Console a propósito: un refresh token lleva grabados
// los scopes con los que se concedió, y NO se pueden ampliar después. Pedirle
// más permisos al de GSC significaría rehacerlo, y si algo sale mal se pierde
// también la lectura de Search Console, que hoy funciona.
//
// Se piden los dos scopes juntos aunque GA4 llegue mañana: cada autorización
// nueva es abrir el navegador, elegir cuenta y aceptar. Hacerlo una vez es
// mejor que dos, y el scope de GA4 sin usar no cuesta nada.
//
// Uso:  node scripts/get-measurement-token.mjs
import http from "http";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim()]),
);

const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:9876/oauth2callback";

// Los permisos van por SCOPE, y un refresh token los lleva grabados: no se
// pueden ampliar después. Cambiar esta lista obliga a volver a autorizar, y por
// eso conviene pedir de una vez lo que hará falta.
//
// Por qué se añadió analytics.edit, después de haber defendido lo contrario:
// la propiedad tenía marcados como conversión `purchase`, `qualify_lead` y
// `close_convert_lead`, que son los ejemplos que GA4 sugiere por defecto y que
// este sitio NO dispara nunca. Los que sí ocurren (`form_start`, `view_plans`,
// `login`) no contaban. El resultado era "cero conversiones" en todos los
// informes, leído durante semanas como un problema de negocio cuando era un
// desajuste de configuración.
//
// Arreglar eso desde fuera obliga a entrar al panel cada vez. Con permiso de
// edición, el sistema puede marcar los eventos correctos, crear las dimensiones
// que necesita y filtrar el tráfico de bots en el origen, en vez de solo
// avisar de que están mal.
//
// Tag Manager se queda en SOLO LECTURA a propósito. Un token que puede editar
// el contenedor puede tumbar la analítica del sitio entero con un despliegue
// mal hecho, y eso no compensa: las etiquetas se tocan pocas veces y a mano.
const SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
];

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth" +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  "&response_type=code" +
  `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
  "&access_type=offline" +
  "&prompt=consent";

console.log("\nAutorizando Tag Manager + GA4 (solo lectura).");
console.log("IMPORTANTE: elige la cuenta que TIENE acceso al contenedor de GTM.");
console.log("Si el navegador abre con otra sesión, copia esta URL en una ventana de incógnito:\n");
console.log(authUrl + "\n");
exec(`start "" "${authUrl}"`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:9876");
  if (url.pathname !== "/oauth2callback") return;

  const code = url.searchParams.get("code");
  if (!code) {
    res.end("Error: no se recibió código");
    return;
  }
  res.end("<html><body><h2>Autorizado. Puedes cerrar esta ventana.</h2></body></html>");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const data = await r.json();

  if (!data.refresh_token) {
    console.error("\nNo llegó refresh_token. Respuesta:", JSON.stringify(data, null, 2));
    console.error(
      "\nSuele pasar cuando la app ya estaba autorizada: revoca el acceso en" +
        " https://myaccount.google.com/permissions y repite.",
    );
    server.close();
    process.exit(1);
  }

  const line = `GOOGLE_MEASUREMENT_REFRESH_TOKEN=${data.refresh_token}`;
  const current = fs.readFileSync(envPath, "utf8");
  const next = current.includes("GOOGLE_MEASUREMENT_REFRESH_TOKEN=")
    ? current.replace(/GOOGLE_MEASUREMENT_REFRESH_TOKEN=.*/, line)
    : current.trimEnd() + "\n" + line + "\n";
  fs.writeFileSync(envPath, next);

  console.log("\nListo: GOOGLE_MEASUREMENT_REFRESH_TOKEN guardado en .env.local.");
  console.log("Falta copiarlo también a Render, o en producción no habrá acceso.\n");
  server.close();
  process.exit(0);
});

server.listen(9876);
