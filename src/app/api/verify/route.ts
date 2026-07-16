import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_TRACE_ID } from "@/lib/demo";
import { replayDemo } from "@/lib/replay";

const schema = z.object({
  traceId: z.literal(DEMO_TRACE_ID),
  correctedAssumption: z.string().min(3).max(1_000),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(await replayDemo(input.correctedAssumption));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
