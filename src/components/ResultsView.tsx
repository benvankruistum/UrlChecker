"use client";

import type { FullCheckResponse } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function ResultsView({
  result,
  analysis,
  analyzing,
  onAnalyze,
}: {
  result: FullCheckResponse;
  analysis: string | null;
  analyzing: boolean;
  onAnalyze: (question?: string) => void;
}) {
  return (
    <section className="results" aria-live="polite">
      <header className="results-header">
        <div>
          <p className="eyebrow">Checked {new Date(result.checkedAt).toLocaleString()}</p>
          <h2>{result.hostname}</h2>
          <p className="muted mono">{result.url}</p>
        </div>
        <div className="results-actions">
          <button
            type="button"
            className="secondary"
            disabled={analyzing}
            onClick={() => onAnalyze()}
          >
            {analyzing ? "Asking Claude…" : result.hasFailures ? "Diagnose failures" : "Ask Claude"}
          </button>
        </div>
      </header>

      <div className="sections">
        {result.sections.map((section, idx) => (
          <article
            key={section.id}
            className="section-block"
            style={{ animationDelay: `${0.08 + idx * 0.06}s` }}
          >
            <div className="section-title">
              <h3>{section.title}</h3>
              <StatusBadge status={section.status} />
            </div>
            <p className="section-summary">{section.summary}</p>
            {section.source ? <p className="source">Source: {section.source}</p> : null}
            <ul className="check-list">
              {section.items.map((item) => (
                <li key={item.id}>
                  <div className="check-row">
                    <StatusBadge status={item.status} />
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                      {item.evidence ? (
                        <pre className="evidence">
                          {Array.isArray(item.evidence)
                            ? item.evidence.join("\n")
                            : item.evidence}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {analysis ? (
        <article className="analysis-block">
          <h3>Claude diagnosis</h3>
          <pre className="analysis-text">{analysis}</pre>
        </article>
      ) : null}
    </section>
  );
}
