import { NextResponse } from "next/server";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { ZodError } from "zod";
import { analyzeTrace } from "@/lib/analysis";
import { normalizeTrace } from "@/lib/schema";

const MAX_BYTES = 300_000;

type SafeErrorMetadata = {
  name: string;
  status: number | null;
  code: string | null;
  type: string | null;
  requestId: string | null;
  message: string;
};

function sanitizeMessage(message: string) {
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (error instanceof APIConnectionTimeoutError) {
    return {
      name: "APIConnectionTimeoutError",
      status: error.status ?? null,
      code: error.code ?? null,
      type: error.type ?? null,
      requestId: error.requestID ?? null,
      message: sanitizeMessage(error.message),
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      name: "APIConnectionError",
      status: error.status ?? null,
      code: error.code ?? null,
      type: error.type ?? null,
      requestId: error.requestID ?? null,
      message: sanitizeMessage(error.message),
    };
  }

  if (error instanceof APIError) {
    return {
      name: error.constructor.name || "APIError",
      status: error.status ?? null,
      code: error.code ?? null,
      type: error.type ?? null,
      requestId: error.requestID ?? null,
      message: sanitizeMessage(error.message),
    };
  }

  if (error instanceof ZodError) {
    return {
      name: "ZodError",
      status: 422,
      code: null,
      type: null,
      requestId: null,
      message: "Trace validation failed.",
    };
  }

  if (error instanceof SyntaxError) {
    return {
      name: "SyntaxError",
      status: 400,
      code: null,
      type: null,
      requestId: null,
      message: "Request body must be valid JSON.",
    };
  }

  return {
    name: error instanceof Error ? error.name : "UnknownError",
    status: null,
    code: null,
    type: null,
    requestId: null,
    message: sanitizeMessage(error instanceof Error ? error.message : "Analysis failed."),
  };
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) {
      return NextResponse.json({ error: "Trace exceeds the 300 KB limit." }, { status: 413 });
    }
    const trace = normalizeTrace(JSON.parse(raw));
    return NextResponse.json(await analyzeTrace(trace));
  } catch (error) {
    console.error("[Forkpoint /api/analyze]", JSON.stringify(safeErrorMetadata(error)));

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Trace validation failed.", details: error.issues },
        { status: 422 },
      );
    }
    const message = sanitizeMessage(error instanceof Error ? error.message : "Analysis failed.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
