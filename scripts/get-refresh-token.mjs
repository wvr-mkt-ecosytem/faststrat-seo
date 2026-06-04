import http from 'http'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

// Lee .env.local
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
)

const CLIENT_ID = env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:9876/oauth2callback'

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent('https://www.googleapis.com/auth/webmasters.readonly')}` +
  `&access_type=offline` +
  `&prompt=consent`

console.log('\n🔑 Abriendo browser para autorizar GSC...\n')
exec(`start "" "${authUrl}"`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000')
  if (url.pathname !== '/oauth2callback') return

  const code = url.searchParams.get('code')
  if (!code) {
    res.end('Error: no se recibió código')
    return
  }

  res.end('<html><body><h2>✅ Autorizado. Puedes cerrar esta ventana.</h2></body></html>')

  // Intercambia el código por tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.refresh_token) {
    console.error('❌ No se recibió refresh_token. Respuesta:', tokens)
    server.close()
    return
  }

  // Agrega GOOGLE_REFRESH_TOKEN al .env.local
  let envContent = fs.readFileSync(envPath, 'utf8')
  if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
    envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
  } else {
    envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
  }
  fs.writeFileSync(envPath, envContent)

  console.log('✅ Refresh token guardado en .env.local')
  console.log('   Ya puedes reiniciar el dev server y abrir /seo\n')
  server.close()
})

server.listen(9876, () => {
  console.log('Esperando callback en http://localhost:9876/oauth2callback...')
  console.log('Si el browser no se abre solo, ve a:\n')
  console.log(authUrl)
  console.log()
})
