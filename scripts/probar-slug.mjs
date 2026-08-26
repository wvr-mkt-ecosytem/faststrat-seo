// El slug no puede cortar una palabra por la mitad: eso sale en la SERP.
//   node scripts/probar-slug.mjs
import { slugify } from "../lib/slug.ts";

// Los títulos que produjeron los slugs truncados que hay hoy en el sitio.
const CASOS = [
  "Best SEO Tools for Small Businesses in 2026: Honest Reviews and Pricing",
  "GA4 Setup for Small Businesses in 2026: Step by Step Guide, No Developer Needed",
  "AI Organic Marketing for SMBs: The 2026 Playbook to Cut CAC Without Ads",
  "Small Business Marketing Budget: What Percentage of Revenue Should You Spend",
  "Meta Ads Agency vs DIY AI Tools: The True Cost Breakdown for Small Business",
  "Cómo calcular el CAC de una PYME sin equipo de datos",
  "SEO 2026",
];

let fallos = 0;
for (const t of CASOS) {
  const s = slugify(t);
  // Toda palabra del slug tiene que existir entera en el título original.
  const enTitulo = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").split(/\s+/);
  const cortada = s.split("-").find((p) => p && !enTitulo.includes(p));
  const largo = s.length <= 60;
  if (cortada || !largo) fallos++;
  console.log(`  ${cortada ? "CORTA ✗" : largo ? "ok     " : "LARGO ✗"}  ${String(s.length).padStart(2)}  ${s}`);
  if (cortada) console.log(`            palabra partida: "${cortada}"`);
}
console.log(fallos === 0 ? "\nNingún slug parte una palabra ni pasa de 60." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
