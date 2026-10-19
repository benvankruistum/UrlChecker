export type CheckStatus = "pass" | "warn" | "fail" | "info" | "error" | "skipped";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  evidence?: string | string[];
}

export interface CheckSection {
  id: string;
  title: string;
  status: CheckStatus;
  summary: string;
  items: CheckItem[];
  source?: string;
}

export interface HttpCheckResult {
  section: CheckSection;
  finalUrl?: string;
  statusCode?: number;
  redirectChain: Array<{ url: string; status: number; location?: string }>;
}

export interface SslCheckResult {
  section: CheckSection;
  validTo?: string;
  daysRemaining?: number;
  subject?: string;
  issuer?: string;
}

export interface DnsCheckResult {
  section: CheckSection;
  hostname: string;
  apexDomain: string;
}

export interface FullCheckResponse {
  url: string;
  hostname: string;
  checkedAt: string;
  sections: CheckSection[];
  http: HttpCheckResult;
  ssl: SslCheckResult;
  dns: DnsCheckResult;
  hasFailures: boolean;
}

export interface AnalyzeRequest {
  url: string;
  sections: CheckSection[];
  userQuestion?: string;
}

export interface AnalyzeResponse {
  analysis: string;
  model: string;
}
