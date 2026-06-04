import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.split('=')[0].trim(), l.split('=').slice(1).join('=').trim()])
)

const auth = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
)
auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })

const searchconsole = google.searchconsole({ version: 'v1', auth })
const res = await searchconsole.sites.list()

console.log('\n📋 Propiedades disponibles en GSC:\n')
for (const site of res.data.siteEntry ?? []) {
  console.log(`  ${site.siteUrl}  (${site.permissionLevel})`)
}
console.log()
