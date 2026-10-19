import { NextResponse } from "next/server";
import { diagnoseWithClaude } from "@/lib/anthropic";
import type { CheckSection } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const apiKeyHeader = request.headers.get("x-anthropic-api-key")?.trim();
    const body = (await request.json()) as {
      url?: string;
      sections?: CheckSection[];
      userQuestion?: string;
      apiKey?: string;
    };

    // Prefer header so the key is less likely to land in access logs with the body.
    const apiKey = apiKeyHeader || body.apiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key required. Enter it in Settings (stored in localStorage only)." },
        { status: 401 },
      );
    }
    if (!body.url || !body.sections?.length) {
      return NextResponse.json({ error: "url and sections are required" }, { status: 400 });
    }

    const result = await diagnoseWithClaude({
      apiKey,
      url: body.url,
      sections: body.sections,
      userQuestion: body.userQuestion,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("API key") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
