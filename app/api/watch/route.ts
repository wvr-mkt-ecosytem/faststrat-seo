import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { rivalTopics } from "@/lib/rival-topics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Sirve la vigilancia a la pantalla.
//
// Las instantáneas fechadas son la fuente y el diff se calcula al pedirlo. Si
// se guardara solo el informe, el pasado quedaría congelado en el formato del
// día que se escribió y no se podrían comparar dos semanas no consecutivas.

const DIR = () => path.join(process.cwd(), "data", "competitor-watch");

interface Page {
  url: string;
  lastmod: string;
}
interface Entry {
  kind?: string;
  tier?: string;
  error?: string;
  note?: string;
  host?: string;
  pages?: Page[];
}

const dates = (): string[] => {
  try {
    return fs
      .readdirSync(DIR())
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(".json", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
};

const read = (date: string): Record<string, Entry> | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR(), `${date}.json`), "utf8"));
  } catch {
    return null;
  }
};

export const GET = apiRoute(async (req: Request) => {
  const url = new URL(req.url);
  const available = dates();

  if (!available.length) {
    return NextResponse.json({
      available: [],
      empty: true,
      // Un vacío con causa: puede que nunca se haya corrido.
      reason:
        "Todavía no hay instantáneas. Corre `node scripts/watch-competitors.mjs` para generar la primera.",
    });
  }

  const date = url.searchParams.get("date") || available[0];
  const current = read(date);
  if (!current) return NextResponse.json({ available, error: `No hay instantánea del ${date}` });

  const idx = available.indexOf(date);
  const prevDate = idx >= 0 && idx + 1 < available.length ? available[idx + 1] : null;
  const previous = prevDate ? read(prevDate) : null;

  const rows = Object.entries(current).map(([name, d]) => {
    const before = new Set(((previous?.[name]?.pages || []) as Page[]).map((p) => p.url));
    const pages = d.pages || [];
    const fresh = previous ? pages.filter((p) => !before.has(p.url)) : [];

    return {
      name,
      kind: d.kind || "producto",
      tier: d.tier || "",
      error: d.error || null,
      // La nota explica un cero: "sitemap legible pero nada casó el filtro", o
      // "vía RSS, ventana reciente". Sin ella un cero se lee como silencio.
      note: d.note || null,
      total: pages.length,
      // Sin semana anterior no hay "nuevas", hay "todas". Se devuelve null para
      // que la pantalla lo diga en vez de pintar un cero engañoso.
      newCount: previous ? fresh.length : null,
      newPages: fresh
        .sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || ""))
        .slice(0, 10),
    };
  });

  const order: Record<string, number> = { producto: 0, busqueda: 1, medio: 2 };
  rows.sort(
    (a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || (b.newCount ?? b.total) - (a.newCount ?? a.total),
  );

  const rivals = rivalTopics(120, 40);

  return NextResponse.json({
    available,
    date,
    comparedWith: prevDate,
    isBaseline: !previous,
    rows,
    blocked: rows.filter((r) => r.error).map((r) => ({ name: r.name, error: r.error })),
    totalNew: rows.reduce((s, r) => s + (r.newCount ?? 0), 0),
    // Solo lo que tocan dos fuentes o más: una sola es su apuesta, dos es el sector.
    topics: rivals.topics.filter((t) => t.sources.length >= 2).slice(0, 20),
    undatedWithoutDiff: rivals.undatedWithoutDiff,
  });
});
