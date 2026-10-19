import { resolveAndAssertPublic } from "./ssrf";
import type { CheckItem, CheckStatus, HttpCheckResult } from "./types";

const MAX_REDIRECTS = 10;
const FETCH_TIMEOUT_MS = 12_000;

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail") || statuses.includes("error")) return "fail";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("pass")) return "pass";
  return "info";
}

export async function runHttpCheck(target: URL): Promise<HttpCheckResult> {
  const items: CheckItem[] = [];
  const redirectChain: HttpCheckResult["redirectChain"] = [];

  try {
    const addresses = await resolveAndAssertPublic(target.hostname);
    items.push({
      id: "dns-resolve",
      label: "Hostname resolves to public address",
      status: "pass",
      detail: `Resolved to ${addresses.join(", ")}`,
      evidence: addresses,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    items.push({
      id: "dns-resolve",
      label: "Hostname resolves to public address",
      status: "fail",
      detail: message,
    });
    return {
      redirectChain: [],
      section: {
        id: "http",
        title: "HTTP status & reachability",
        status: "fail",
        summary: message,
        items,
      },
    };
  }

  let current = target.toString();
  let finalUrl: string | undefined;
  let statusCode: number | undefined;
  let hop = 0;

  try {
    while (hop < MAX_REDIRECTS) {
      hop += 1;
      const currentUrl = new URL(current);
      await resolveAndAssertPublic(currentUrl.hostname);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "UrlChecker/1.0 (+https://github.com/benvankruistum/url-checker)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
      } finally {
        clearTimeout(timer);
      }

      const location = response.headers.get("location") ?? undefined;
      redirectChain.push({
        url: current,
        status: response.status,
        location,
      });
      statusCode = response.status;

      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, current);
        if (next.protocol !== "http:" && next.protocol !== "https:") {
          items.push({
            id: "redirect-scheme",
            label: "Redirect stays on http(s)",
            status: "fail",
            detail: `Redirect to unsupported scheme: ${next.protocol}`,
          });
          break;
        }
        current = next.toString();
        continue;
      }

      finalUrl = current;
      break;
    }

    if (hop >= MAX_REDIRECTS && !finalUrl) {
      items.push({
        id: "redirect-loop",
        label: "Redirect chain",
        status: "fail",
        detail: `Stopped after ${MAX_REDIRECTS} redirects (possible loop).`,
        evidence: redirectChain.map((h) => `${h.status} ${h.url}`),
      });
    } else {
      items.push({
        id: "redirect-chain",
        label: "Redirect chain",
        status: redirectChain.length > 1 ? "info" : "pass",
        detail:
          redirectChain.length <= 1
            ? "No redirects"
            : `${redirectChain.length - 1} redirect(s) to ${finalUrl}`,
        evidence: redirectChain.map((h) =>
          h.location ? `${h.status} ${h.url} → ${h.location}` : `${h.status} ${h.url}`,
        ),
      });
    }

    if (statusCode !== undefined) {
      const ok = statusCode >= 200 && statusCode < 400;
      const warn = statusCode >= 400 && statusCode < 500;
      items.push({
        id: "http-status",
        label: "HTTP status",
        status: ok ? "pass" : warn ? "warn" : "fail",
        detail: `Final status ${statusCode}${finalUrl ? ` at ${finalUrl}` : ""}`,
      });
    }

    const httpsUpgrade =
      target.protocol === "http:" &&
      redirectChain.some((h) => h.location?.startsWith("https://"));
    if (target.protocol === "http:") {
      items.push({
        id: "https-upgrade",
        label: "HTTP upgrades to HTTPS",
        status: httpsUpgrade ? "pass" : "warn",
        detail: httpsUpgrade
          ? "Redirect chain reaches HTTPS"
          : "No HTTPS upgrade observed in redirect chain",
      });
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
          : err.message
        : String(err);
    items.push({
      id: "reachability",
      label: "Reachability",
      status: "fail",
      detail: message,
    });
  }

  const statuses = items.map((i) => i.status);
  const sectionStatus = worstStatus(statuses);
  const summary =
    statusCode !== undefined
      ? `HTTP ${statusCode}${finalUrl ? ` → ${finalUrl}` : ""}`
      : items.find((i) => i.status === "fail")?.detail ?? "HTTP check incomplete";

  return {
    finalUrl,
    statusCode,
    redirectChain,
    section: {
      id: "http",
      title: "HTTP status & reachability",
      status: sectionStatus,
      summary,
      items,
      source: "server-side fetch (SSRF-hardened)",
    },
  };
}
