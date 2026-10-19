export function normalizeInputUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL is required.");
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http: and https: URLs are supported.");
  }
  if (!url.hostname) throw new Error("URL must include a hostname.");
  return url;
}

/** Rough eTLD+1 / apex guess (good enough for DNS grouping; not a full PSL). */
export function guessApexDomain(hostname: string): string {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const multi = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.nz", "co.jp"]);
  const lastTwo = parts.slice(-2).join(".");
  if (multi.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}
