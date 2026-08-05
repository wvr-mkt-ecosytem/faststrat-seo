import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { buildPlan, readPlan, writePlan, planWithStatus } from "@/lib/plan";
import { persistChanges } from "@/lib/persist";

export const dynamic = "force-dynamic";

// GET  /api/plan          → el plan actual, con el estado real de cada pieza
// POST /api/plan          → propone fechas para las ideas sin escribir
//        { weeks, dryRun, cadence }
//
// `dryRun` no es adorno: el plan se guarda en disco y en Render se commitea al
// repo, así que una tanda equivocada deja rastro. Ver antes lo que va a entrar
// es más barato que deshacerlo.

export const GET = apiRoute(async () => {
  return NextResponse.json(planWithStatus());
});

export const POST = apiRoute(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));

  const result = buildPlan({
    weeks: body.weeks,
    from: body.from,
    cadence: body.cadence,
  });

  if (body.dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, ...result });
  }

  if (!result.planned.length) {
    return NextResponse.json({
      ok: true,
      added: 0,
      ...result,
      // Un cero necesita causa: puede que no queden ideas, o que ya estén todas
      // programadas o escritas.
      note:
        result.available === 0
          ? "No unwritten, unplanned ideas left. Run the weekly research to get more."
          : "Every free slot in that window is already taken.",
    });
  }

  const current = readPlan();
  const merged = {
    cadence: result.cadence,
    updatedAt: new Date().toISOString().slice(0, 10),
    pieces: [...current.pieces, ...result.planned].sort((a, b) => a.date.localeCompare(b.date)),
  };
  writePlan(merged);

  // En Render el disco es efímero: sin esto el plan se pierde al reiniciar.
  await persistChanges(`plan: +${result.planned.length} piezas programadas`, ["data/plan.json"]).catch(
    () => {},
  );

  return NextResponse.json({ ok: true, added: result.planned.length, ...result });
});
