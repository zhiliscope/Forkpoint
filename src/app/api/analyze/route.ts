import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { analyzeTrace } from "@/lib/analysis";
import { normalizeTrace } from "@/lib/schema";

const MAX_BYTES = 300_000;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
      return NextResponse.json({ error: "Trace exceeds the 300 KB limit." }, { status: 413 });
    }
    const trace = normalizeTrace(JSON.parse(raw));
    return NextResponse.json(await analyzeTrace(trace));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Trace validation failed.", details: error.issues },
        { status: 422 },
      );
    }
    const message = error instanceof Error ? error.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
