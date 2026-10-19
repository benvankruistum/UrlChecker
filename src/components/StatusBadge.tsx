import type { CheckStatus } from "@/lib/types";

const LABELS: Record<CheckStatus, string> = {
  pass: "Pass",
  warn: "Warn",
  fail: "Fail",
  info: "Info",
  error: "Error",
  skipped: "Skipped",
};

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`badge badge-${status}`} data-status={status}>
      {LABELS[status]}
    </span>
  );
}
