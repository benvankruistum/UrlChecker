# UrlChecker

English progressive web app that checks a URL beyond “is it 200?”, then optionally explains failures with Claude (Anthropic Messages API).

Deterministic checks always run first on the server. Claude is used only for failure diagnosis or when you explicitly ask.

## Features

1. **HTTP** — status code, redirect chain, reachability (SSRF-hardened)
2. **SSL/TLS** — certificate presence, expiry, hostname match, chain trust (Node `tls.connect`)
3. **Domain / DNS / mail** — local DNS lookups plus public domain hygiene APIs (see below)
4. **Claude diagnosis** — optional; API key entered in the app and stored in `localStorage` only

## Integrations

| Source | Status in this app |
| --- | --- |
| **IntoDNS.ai** (`GET /api/scan/quick`) | **Shipped** — free public JSON API, no key. Used for DNS / email / DNSSEC / security grade. Note: [IntoDNS.ai](https://intodns.ai) is **not** affiliated with classic [intoDNS.com](https://intodns.com). |
| **intoDNS.com** | **No public JSON API** (HTML report only). We link to their web report and rely on local DNS + IntoDNS.ai. |
| **internet.nl** | Batch API exists but requires **HTTP Basic** credentials ([docs](https://internet.nl/faqs/batch-and-dashboard/)). Without credentials we deep-link to site/mail tests. Optional: set `INTERNET_NL_BATCH_USER` / `INTERNET_NL_BATCH_PASSWORD` on the server to register a batch request. |
| **Local DNS** | Always runs (`dns.promises`: A/AAAA, NS, MX, SPF, DMARC) as a deterministic fallback. |

## SSRF hardening

Server-side fetches and TLS connects:

- Reject `localhost`, `.local`, `.internal`, and similar
- Resolve the hostname and **refuse private / reserved / link-local / CGNAT / test-net** addresses (IPv4 and IPv6, including IPv4-mapped)
- Re-check every hop in the redirect chain

## Anthropic API key storage

- Entered under **Settings** in the UI
- Persisted in the browser as `localStorage['urlchecker.anthropicApiKey']`
- Sent to `/api/analyze` only via the `x-anthropic-api-key` header when you click diagnose
- **Never** committed to the repository; do not put production keys in `.env` unless you intentionally want a server default (not required)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build && npm start   # production
```

### Optional environment

| Variable | Purpose |
| --- | --- |
| `INTERNET_NL_BATCH_USER` | internet.nl Batch API username |
| `INTERNET_NL_BATCH_PASSWORD` | internet.nl Batch API password |
| `ANTHROPIC_MODEL` | Override Claude model id (default `claude-sonnet-4-5-20250929`) |

Copy `.env.example` if you need these. Never commit real secrets.

## Deploy

Any Node host that can run Next.js (Vercel, Fly, Railway, Docker, etc.). The app is a PWA (`manifest.webmanifest` + `sw.js`).

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS v4
- Node `tls` / `dns` / `fetch` for checks
