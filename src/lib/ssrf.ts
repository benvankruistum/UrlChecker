import dns from "node:dns/promises";
import net from "node:net";
import { isIP } from "node:net";

/** Block private, loopback, link-local, CGNAT, and other reserved ranges (SSRF). */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
    if (normalized.startsWith("fe80")) return true; // link-local
    if (normalized.startsWith("ff")) return true; // multicast
    // IPv4-mapped IPv6
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.slice("::ffff:".length);
      if (isIP(v4) === 4) return isBlockedIp(v4);
    }
    return false;
  }
  return true;
}

export function assertSafeHostnameLiteral(hostname: string): void {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Refusing to fetch localhost or local names (SSRF protection).");
  }
  if (host.endsWith(".internal") || host.endsWith(".intranet") || host.endsWith(".corp")) {
    throw new Error("Refusing to fetch internal hostnames (SSRF protection).");
  }
  if (isIP(host) && isBlockedIp(host)) {
    throw new Error(`Refusing to fetch blocked IP address ${host} (SSRF protection).`);
  }
}

export async function resolveAndAssertPublic(hostname: string): Promise<string[]> {
  assertSafeHostnameLiteral(hostname);
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedIp(host)) {
      throw new Error(`Refusing to fetch blocked IP address ${host} (SSRF protection).`);
    }
    return [host];
  }

  let addresses: string[] = [];
  try {
    const results = await dns.lookup(host, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new Error(`Could not resolve hostname: ${host}`);
  }

  if (addresses.length === 0) {
    throw new Error(`No addresses resolved for ${host}`);
  }

  const blocked = addresses.filter(isBlockedIp);
  if (blocked.length > 0) {
    throw new Error(
      `Refusing to fetch ${host}: resolves to blocked address(es) ${blocked.join(", ")} (SSRF protection).`,
    );
  }
  return addresses;
}

export function isPrivateOrReservedFamily(family: net.Socket["remoteFamily"] | string | undefined, address?: string): boolean {
  if (!address) return false;
  return isBlockedIp(address);
}
