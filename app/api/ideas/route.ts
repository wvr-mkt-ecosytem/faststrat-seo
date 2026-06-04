import { NextResponse } from "next/server";
import { getIdeaBatches } from "@/lib/ideas";

export async function GET() {
  const batches = getIdeaBatches();
  return NextResponse.json({ batches });
}
