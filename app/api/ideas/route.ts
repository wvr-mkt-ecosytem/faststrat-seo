import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/google-auth-state";
import { getIdeaBatches } from "@/lib/ideas";

export const GET = apiRoute(async () => {
  const batches = getIdeaBatches();
  return NextResponse.json({ batches });
});
