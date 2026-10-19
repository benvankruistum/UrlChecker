import { NextResponse } from "next/server";
import { runDnsCheck } from "@/lib/dns-check";
import { runHttpCheck } from "@/lib/http-check";
import { runSslCheck } from "@/lib/ssl-check";
import type { FullCheckResponse } from "@/lib/types";
import { normalizeInputUrl } from "@/lib/url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const parsed = normalizeInputUrl(body.url);
    const [http, ssl, dns] = await Promise.all([
      runHttpCheck(parsed),
      runSslCheck(parsed),
      runDnsCheck(parsed.hostname),
    ]);

    const sections = [http.section, ssl.section, dns.section];
    const hasFailures = sections.some(
      (s) =>
        s.status === "fail" ||
        s.status === "error" ||
        s.items.some((i) => i.status === "fail" || i.status === "error"),
    );

    const payload: FullCheckResponse = {
      url: parsed.toString(),
      hostname: parsed.hostname,
      checkedAt: new Date().toISOString(),
      sections,
      http,
      ssl,
      dns,
      hasFailures,
    };

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
