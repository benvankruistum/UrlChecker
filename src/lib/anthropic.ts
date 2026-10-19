import type { CheckSection } from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

export async function diagnoseWithClaude(opts: {
  apiKey: string;
  url: string;
  sections: CheckSection[];
  userQuestion?: string;
}): Promise<{ analysis: string; model: string }> {
  const { apiKey, url, sections, userQuestion } = opts;
  if (!apiKey?.startsWith("sk-")) {
    throw new Error("A valid Anthropic API key (sk-…) is required.");
  }

  const failures = sections.flatMap((s) =>
    s.items
      .filter((i) => i.status === "fail" || i.status === "warn" || i.status === "error")
      .map((i) => ({ section: s.title, ...i })),
  );

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const system = `You are a senior web operations engineer helping diagnose URL / TLS / DNS problems.
Use only the structured check results provided. Be concise and actionable.
Do not invent HTTP status codes or certificate facts that are not in the data.
Prefer bullet lists: what's wrong, why it matters, how to fix it.
Respond in English.`;

  const userContent = [
    `Target URL: ${url}`,
    userQuestion ? `User question: ${userQuestion}` : "User question: Explain any failures and warnings.",
    "",
    "Deterministic check results (JSON):",
    JSON.stringify({ sections, failureCount: failures.length }, null, 2),
  ].join("\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const analysis =
    data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim() ||
    "No analysis returned.";

  return { analysis, model };
}
