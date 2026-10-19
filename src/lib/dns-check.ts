import dns from "node:dns/promises";
import { guessApexDomain } from "./url";
import type { CheckItem, CheckStatus, DnsCheckResult } from "./types";

const INTODNS_AI_QUICK = "https://intodns.ai/api/scan/quick";
const INTERNET_NL_SITE = "https://internet.nl";

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail") || statuses.includes("error")) return "fail";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("pass")) return "pass";
  if (statuses.includes("skipped")) return "skipped";
  return "info";
}

async function lookupRecords(hostname: string): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const apex = guessApexDomain(hostname);

  const a = await dns.resolve4(hostname).catch(() => [] as string[]);
  const aaaa = await dns.resolve6(hostname).catch(() => [] as string[]);
  items.push({
    id: "a-aaaa",
    label: "Address records (A / AAAA)",
    status: a.length || aaaa.length ? "pass" : "fail",
    detail:
      a.length || aaaa.length
        ? `A: ${a.join(", ") || "none"}; AAAA: ${aaaa.join(", ") || "none"}`
        : "No A or AAAA records found",
    evidence: [...a, ...aaaa],
  });

  const ns = await dns.resolveNs(apex).catch(() => [] as string[]);
  items.push({
    id: "ns",
    label: "Nameservers (NS)",
    status: ns.length ? "pass" : "warn",
    detail: ns.length ? ns.join(", ") : `No NS records for apex ${apex}`,
    evidence: ns,
  });

  type MxRecord = { exchange: string; priority: number };
  const mx = await dns.resolveMx(apex).catch(() => [] as MxRecord[]);
  const nullMx = mx.length === 1 && mx[0].exchange === "." && mx[0].priority === 0;
  items.push({
    id: "mx",
    label: "Mail exchangers (MX)",
    status: mx.length ? "pass" : "info",
    detail: mx.length
      ? nullMx
        ? "Null MX (domain does not accept mail)"
        : mx.map((r) => `${r.priority} ${r.exchange}`).join(", ")
      : `No MX for ${apex}`,
    evidence: mx.map((r) => `${r.priority} ${r.exchange}`),
  });

  const txt = await dns.resolveTxt(apex).catch(() => [] as string[][]);
  const flatTxt = txt.map((chunks) => chunks.join(""));
  const spf = flatTxt.find((t) => t.toLowerCase().startsWith("v=spf1"));
  items.push({
    id: "spf",
    label: "SPF (TXT)",
    status: spf ? "pass" : mx.length && !nullMx ? "warn" : "info",
    detail: spf ?? (mx.length && !nullMx ? "No SPF record — mail may be spoofable" : "No SPF record"),
    evidence: spf,
  });

  const dmarc = await dns
    .resolveTxt(`_dmarc.${apex}`)
    .then((rows) => rows.map((c) => c.join("")))
    .catch(() => [] as string[]);
  const dmarcRecord = dmarc.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
  items.push({
    id: "dmarc",
    label: "DMARC",
    status: dmarcRecord ? "pass" : mx.length && !nullMx ? "warn" : "info",
    detail: dmarcRecord ?? (mx.length && !nullMx ? "No DMARC record" : "No DMARC record"),
    evidence: dmarcRecord,
  });

  return items;
}

interface IntoDnsQuick {
  domain?: string;
  grade?: string;
  percentage?: number;
  score?: number;
  issues?: Array<{ severity?: string; title?: string; description?: string; category?: string }>;
  recommendations?: Array<{ title?: string; description?: string }>;
  categories?: Record<
    string,
    {
      percentage?: number;
      status?: string;
      checks?: Array<{ name?: string; passed?: boolean; details?: string; severity?: string }>;
    }
  >;
}

async function fetchIntoDnsAi(apex: string): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${INTODNS_AI_QUICK}?domain=${encodeURIComponent(apex)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "UrlChecker/1.0" },
    });
    if (!res.ok) {
      items.push({
        id: "intodns-ai",
        label: "IntoDNS.ai quick scan",
        status: "warn",
        detail: `IntoDNS.ai returned HTTP ${res.status}. Local DNS fallbacks above still apply.`,
      });
      return items;
    }
    const data = (await res.json()) as IntoDnsQuick;
    items.push({
      id: "intodns-ai-grade",
      label: "IntoDNS.ai overall grade",
      status:
        data.grade === "A" || data.grade === "A+"
          ? "pass"
          : data.grade === "B" || data.grade === "C"
            ? "warn"
            : "fail",
      detail: `Grade ${data.grade ?? "?"} (${data.percentage ?? data.score ?? "?"}%) for ${data.domain ?? apex}`,
      evidence: `https://intodns.ai/?domain=${encodeURIComponent(apex)}`,
    });

    const cats = data.categories ?? {};
    for (const [key, cat] of Object.entries(cats)) {
      const failed = (cat.checks ?? []).filter((c) => c.passed === false).slice(0, 4);
      // Map IntoDNS.ai category status into our UI; treat their "fail" as warn so
      // core HTTP/TLS reachability failures stay the primary hasFailures signal.
      const mapped: CheckStatus =
        cat.status === "pass"
          ? "pass"
          : cat.status === "warning" || cat.status === "warn" || cat.status === "fail"
            ? "warn"
            : "info";
      items.push({
        id: `intodns-ai-${key}`,
        label: `IntoDNS.ai · ${key}`,
        status: mapped,
        detail:
          failed.length > 0
            ? failed.map((c) => `${c.name}: ${c.details}`).join(" · ")
            : `${cat.percentage ?? "?"}% — no failed checks in summary`,
      });
    }

    const topIssues = (data.issues ?? []).slice(0, 5);
    if (topIssues.length) {
      items.push({
        id: "intodns-ai-issues",
        label: "IntoDNS.ai top issues",
        status: "warn",
        detail: topIssues.map((i) => `[${i.severity ?? "info"}] ${i.title}`).join("; "),
        evidence: topIssues.map((i) => i.description ?? i.title ?? ""),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    items.push({
      id: "intodns-ai",
      label: "IntoDNS.ai quick scan",
      status: "warn",
      detail: `Could not reach IntoDNS.ai (${message}). Local DNS lookups above are the fallback.`,
    });
  } finally {
    clearTimeout(timer);
  }
  return items;
}

export async function runDnsCheck(hostname: string): Promise<DnsCheckResult> {
  const apex = guessApexDomain(hostname);
  const items: CheckItem[] = [];

  // Local deterministic DNS (fallback always available)
  try {
    items.push(...(await lookupRecords(hostname)));
  } catch (err) {
    items.push({
      id: "dns-local",
      label: "Local DNS lookups",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Classic intodns.com has no documented public JSON API (HTML only).
  items.push({
    id: "intodns-com",
    label: "intoDNS.com",
    status: "info",
    detail:
      "Classic intoDNS.com does not expose a documented public JSON API. Open their web report for a manual cross-check.",
    evidence: `https://intodns.com/${encodeURIComponent(apex)}`,
  });

  // IntoDNS.ai — free public API (not affiliated with intodns.com; documented in README)
  items.push(...(await fetchIntoDnsAi(apex)));

  // internet.nl — Batch API requires HTTP Basic credentials (not public anonymous).
  // Provide deep link + optional credentialed poll via env INTERNET_NL_BATCH_USER/PASS.
  const batchUser = process.env.INTERNET_NL_BATCH_USER;
  const batchPass = process.env.INTERNET_NL_BATCH_PASSWORD;
  if (batchUser && batchPass) {
    items.push(...(await tryInternetNlBatch(apex, batchUser, batchPass)));
  } else {
    items.push({
      id: "internet-nl",
      label: "internet.nl",
      status: "info",
      detail:
        "internet.nl Batch API requires registered credentials (HTTP Basic). No anonymous public API. Open their site test, or set INTERNET_NL_BATCH_USER / INTERNET_NL_BATCH_PASSWORD for server-side batch results.",
      evidence: [
        `${INTERNET_NL_SITE}/site/${encodeURIComponent(apex)}/`,
        `${INTERNET_NL_SITE}/mail/${encodeURIComponent(apex)}/`,
        "https://internet.nl/faqs/batch-and-dashboard/",
      ],
    });
  }

  const status = worstStatus(items.map((i) => i.status));
  return {
    hostname,
    apexDomain: apex,
    section: {
      id: "dns",
      title: "Domain / DNS / mail hygiene",
      status,
      summary: `Apex ${apex} — local DNS + IntoDNS.ai${batchUser ? " + internet.nl batch" : ""}`,
      items,
      source: "dns.promises + IntoDNS.ai public API (+ optional internet.nl batch)",
    },
  };
}

async function tryInternetNlBatch(
  apex: string,
  user: string,
  pass: string,
): Promise<CheckItem[]> {
  const items: CheckItem[] = [];
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  try {
    const create = await fetch("https://internet.nl/api/batch/v2/requests", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: `UrlChecker ${apex}`,
        request_type: "web",
        domains: [apex],
      }),
    });
    if (!create.ok) {
      items.push({
        id: "internet-nl-batch",
        label: "internet.nl batch API",
        status: "warn",
        detail: `Batch register failed with HTTP ${create.status}. Check credentials. Site test link still available.`,
        evidence: `https://internet.nl/site/${encodeURIComponent(apex)}/`,
      });
      return items;
    }
    const body = (await create.json()) as { request?: { request_id?: string }; data?: { request_id?: string } };
    const requestId = body.request?.request_id ?? body.data?.request_id;
    if (!requestId) {
      items.push({
        id: "internet-nl-batch",
        label: "internet.nl batch API",
        status: "info",
        detail: "Batch request accepted but no request_id parsed. Poll via internet.nl dashboard.",
        evidence: JSON.stringify(body).slice(0, 500),
      });
      return items;
    }
    items.push({
      id: "internet-nl-batch",
      label: "internet.nl batch API",
      status: "pass",
      detail: `Registered batch request ${requestId}. Results may take minutes; poll internet.nl or GET /api/batch/v2/requests/${requestId}/results`,
      evidence: requestId,
    });
  } catch (err) {
    items.push({
      id: "internet-nl-batch",
      label: "internet.nl batch API",
      status: "warn",
      detail: err instanceof Error ? err.message : String(err),
      evidence: `https://internet.nl/site/${encodeURIComponent(apex)}/`,
    });
  }
  return items;
}
