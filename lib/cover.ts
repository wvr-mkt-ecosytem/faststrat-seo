import sharp from "sharp";
import { CLIENTE } from "@/lib/cliente";

// Genera la imagen destacada (1600x900) con el estilo del sitio del cliente:
// fondo crema, barras granate arriba/abajo, logo + tagline, pill de categoría,
// eyebrow + guiones, título grande, subtítulo, cuadros decorativos y dominio.

const W = 1600;
const H = 900;
const MAROON = CLIENTE.colorPrincipal;
const INK = "#201B1B";
const GRAY = "#6E6A64";

export interface CoverInput {
  eyebrow: string; // "NO-BS GUIDE 2026"
  title: string; // "SEO for Small Business"
  subtitle: string; // descripción corta
  category: string; // "MARKETING"
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Parte un texto en líneas de máximo `maxChars` caracteres por palabra completa. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
    if (lines.length === maxLines - 1 && (cur + " ").length > maxChars) break;
  }
  if (cur) lines.push(cur.trim());
  return lines.slice(0, maxLines);
}

export async function generateCover(input: CoverInput): Promise<Buffer> {
  // Para títulos largos con ":" o "(", usa la parte limpia del inicio como
  // título de portada (más legible, estilo titular corto).
  let coverTitle = input.title;
  if (coverTitle.length > 42 && /[:(]/.test(coverTitle)) {
    const head = coverTitle.split(/[:(]/)[0].trim();
    if (head.length >= 15) coverTitle = head;
  }

  // Título: tamaño dinámico según longitud. Máx 3 líneas.
  const titleLines = wrap(coverTitle, 20, 3);
  const titleSize = titleLines.length >= 3 ? 84 : titleLines.length === 2 ? 100 : 116;
  const titleLineHeight = titleSize * 1.08;
  const titleStartY = 400 - ((titleLines.length - 1) * titleLineHeight) / 2;

  const subLines = wrap(input.subtitle, 56, 2);

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<text x="120" y="${titleStartY + i * titleLineHeight}" font-family="Arial, 'Segoe UI', sans-serif" font-size="${titleSize}" font-weight="800" fill="${INK}">${escapeXml(line)}</text>`
    )
    .join("");

  const subTspans = subLines
    .map(
      (line, i) =>
        `<text x="122" y="${titleStartY + titleLines.length * titleLineHeight + 30 + i * 46}" font-family="Arial, 'Segoe UI', sans-serif" font-size="36" fill="${GRAY}">${escapeXml(line)}</text>`
    )
    .join("");

  const catWidth = Math.max(140, input.category.length * 17 + 60);

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${CLIENTE.colorFondo}"/>
      <stop offset="100%" stop-color="#ECE3D3"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- barras granate -->
  <rect x="0" y="0" width="${W}" height="9" fill="${MAROON}"/>
  <rect x="0" y="${H - 9}" width="${W}" height="9" fill="${MAROON}"/>

  <!-- logo + tagline -->
  <text x="60" y="68" font-family="Arial, 'Segoe UI', sans-serif" font-size="40" font-weight="800" fill="${MAROON}">${escapeXml(CLIENTE.nombre)}</text>
  <text x="62" y="98" font-family="Arial, 'Segoe UI', sans-serif" font-size="19" font-weight="700" letter-spacing="1.5" fill="${GRAY}">${escapeXml(CLIENTE.tagline)}</text>

  <!-- pill categoría -->
  <rect x="${W - catWidth - 60}" y="40" width="${catWidth}" height="48" rx="24" fill="${MAROON}"/>
  <text x="${W - catWidth / 2 - 60}" y="71" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="22" font-weight="800" letter-spacing="1" fill="${CLIENTE.colorFondo}">${escapeXml(input.category.toUpperCase())}</text>

  <!-- eyebrow + guiones -->
  <text x="120" y="${titleStartY - 150}" font-family="Arial, 'Segoe UI', sans-serif" font-size="34" font-weight="800" letter-spacing="1" fill="${MAROON}">${escapeXml(input.eyebrow.toUpperCase())}</text>
  <rect x="120" y="${titleStartY - 128}" width="48" height="9" fill="${MAROON}"/>
  <rect x="180" y="${titleStartY - 128}" width="36" height="9" fill="${MAROON}"/>
  <rect x="228" y="${titleStartY - 128}" width="60" height="9" fill="${MAROON}"/>

  <!-- título -->
  ${titleTspans}

  <!-- subtítulo -->
  ${subTspans}

  <!-- cuadros decorativos -->
  <rect x="1200" y="595" width="110" height="160" fill="${MAROON}"/>
  <rect x="1340" y="625" width="84" height="110" fill="${MAROON}"/>
  <rect x="1475" y="600" width="95" height="150" fill="${MAROON}"/>

  <!-- dominio -->
  <text x="${W - 60}" y="${H - 45}" text-anchor="end" font-family="Arial, 'Segoe UI', sans-serif" font-size="26" font-weight="800" fill="${MAROON}">${escapeXml(CLIENTE.dominio)}</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
