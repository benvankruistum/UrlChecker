import tls from "node:tls";
import { resolveAndAssertPublic } from "./ssrf";
import type { CheckItem, CheckStatus, SslCheckResult } from "./types";

function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail") || statuses.includes("error")) return "fail";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("pass")) return "pass";
  return "info";
}

function formatCertName(input: string | string[] | tls.PeerCertificate["subject"]): string {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) return input.join(", ");
  const cn = input.CN;
  const org = input.O;
  const cnStr = Array.isArray(cn) ? cn.join(", ") : cn;
  const orgStr = Array.isArray(org) ? org.join(", ") : org;
  return cnStr || orgStr || JSON.stringify(input);
}

export async function runSslCheck(target: URL): Promise<SslCheckResult> {
  const items: CheckItem[] = [];

  if (target.protocol !== "https:") {
    items.push({
      id: "ssl-skipped",
      label: "TLS certificate",
      status: "skipped",
      detail: "Skipped — target is not HTTPS. Re-check with https:// to inspect the certificate.",
    });
    return {
      section: {
        id: "ssl",
        title: "SSL / TLS certificate",
        status: "skipped",
        summary: "Not applicable for non-HTTPS URLs",
        items,
        source: "Node.js tls.connect",
      },
    };
  }

  const port = target.port ? Number(target.port) : 443;
  const hostname = target.hostname;

  try {
    await resolveAndAssertPublic(hostname);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    items.push({
      id: "ssl-ssrf",
      label: "SSRF gate before TLS connect",
      status: "fail",
      detail: message,
    });
    return {
      section: {
        id: "ssl",
        title: "SSL / TLS certificate",
        status: "fail",
        summary: message,
        items,
        source: "Node.js tls.connect",
      },
    };
  }

  try {
    const result = await new Promise<{
      authorized: boolean;
      authorizationError: Error | null;
      cert: tls.PeerCertificate;
      protocol: string | null;
      cipher: tls.CipherNameAndProtocol | null;
    }>((resolve, reject) => {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
          timeout: 12_000,
        },
        () => {
          const cert = socket.getPeerCertificate(true);
          resolve({
            authorized: socket.authorized,
            authorizationError: socket.authorizationError
              ? new Error(String(socket.authorizationError))
              : null,
            cert,
            protocol: socket.getProtocol(),
            cipher: socket.getCipher(),
          });
          socket.end();
        },
      );
      socket.on("error", reject);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("TLS handshake timed out"));
      });
    });

    const { authorized, authorizationError, cert, protocol, cipher } = result;
    if (!cert || Object.keys(cert).length === 0) {
      items.push({
        id: "cert-present",
        label: "Certificate presented",
        status: "fail",
        detail: "Server did not present a certificate",
      });
    } else {
      const subject = formatCertName(cert.subject);
      const issuer = formatCertName(cert.issuer);
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = Date.now();
      const daysRemaining = Math.floor((validTo.getTime() - now) / (1000 * 60 * 60 * 24));

      items.push({
        id: "cert-present",
        label: "Certificate presented",
        status: "pass",
        detail: `Subject: ${subject}`,
        evidence: [`Issuer: ${issuer}`, `Protocol: ${protocol ?? "unknown"}`, `Cipher: ${cipher?.name ?? "unknown"}`],
      });

      if (now < validFrom.getTime()) {
        items.push({
          id: "cert-not-before",
          label: "Not yet valid",
          status: "fail",
          detail: `Certificate valid from ${validFrom.toISOString()}`,
        });
      } else if (daysRemaining < 0) {
        items.push({
          id: "cert-expired",
          label: "Certificate expiry",
          status: "fail",
          detail: `Expired ${Math.abs(daysRemaining)} day(s) ago (${validTo.toUTCString()})`,
        });
      } else if (daysRemaining <= 14) {
        items.push({
          id: "cert-expiry",
          label: "Certificate expiry",
          status: "warn",
          detail: `Expires in ${daysRemaining} day(s) (${validTo.toUTCString()})`,
        });
      } else {
        items.push({
          id: "cert-expiry",
          label: "Certificate expiry",
          status: "pass",
          detail: `Valid for ${daysRemaining} more day(s) (until ${validTo.toUTCString()})`,
        });
      }

      const san = cert.subjectaltname ?? "";
      const hostOk =
        (cert.subject && typeof cert.subject !== "string" && cert.subject.CN === hostname) ||
        san
          .split(",")
          .map((p) => p.trim())
          .some((entry) => {
            if (entry.startsWith("DNS:")) {
              const name = entry.slice(4).toLowerCase();
              if (name.startsWith("*.")) {
                const suffix = name.slice(1);
                return hostname.toLowerCase().endsWith(suffix) && hostname.split(".").length === name.split(".").length;
              }
              return name === hostname.toLowerCase();
            }
            return false;
          });

      items.push({
        id: "hostname-match",
        label: "Hostname matches certificate",
        status: hostOk ? "pass" : "fail",
        detail: hostOk
          ? `Certificate covers ${hostname}`
          : `Hostname ${hostname} not found in CN/SAN (${san || "no SAN"})`,
        evidence: san || undefined,
      });

      items.push({
        id: "chain-trust",
        label: "Trusted certificate chain",
        status: authorized ? "pass" : "fail",
        detail: authorized
          ? "Chain validates against system trust store"
          : `Chain/authorization issue: ${authorizationError?.message ?? "unauthorized"}`,
      });

      const sectionStatus = worstStatus(items.map((i) => i.status));
      return {
        validTo: validTo.toISOString(),
        daysRemaining,
        subject,
        issuer,
        section: {
          id: "ssl",
          title: "SSL / TLS certificate",
          status: sectionStatus,
          summary: authorized
            ? `Valid cert for ${hostname}, ${daysRemaining} day(s) left`
            : authorizationError?.message ?? "Certificate problem",
          items,
          source: "Node.js tls.connect (system trust store)",
        },
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    items.push({
      id: "tls-handshake",
      label: "TLS handshake",
      status: "fail",
      detail: message,
    });
  }

  return {
    section: {
      id: "ssl",
      title: "SSL / TLS certificate",
      status: worstStatus(items.map((i) => i.status)),
      summary: items.find((i) => i.status === "fail")?.detail ?? "SSL check incomplete",
      items,
      source: "Node.js tls.connect (system trust store)",
    },
  };
}
