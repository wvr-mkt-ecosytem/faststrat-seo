// Endpoint de salud para el health check de Render — sin auth.
export function GET() {
  return new Response("ok", { status: 200 });
}
