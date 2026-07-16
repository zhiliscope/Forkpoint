import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAlternativePlan } from "@/lib/analysis";
import { agentTraceSchema } from "@/lib/schema";

const requestSchema = z.object({
  trace: agentTraceSchema,
  correctedAssumption: z.string().min(3).max(1_000),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    return NextResponse.json(
      await generateAlternativePlan(input.trace, input.correctedAssumption),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Branch generation failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
