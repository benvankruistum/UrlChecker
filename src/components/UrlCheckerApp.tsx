"use client";

import { FormEvent, useEffect, useState } from "react";
import type { FullCheckResponse } from "@/lib/types";
import { loadApiKey } from "@/lib/storage";
import { ResultsView } from "./ResultsView";
import { SettingsPanel } from "./SettingsPanel";

export function UrlCheckerApp() {
  const [url, setUrl] = useState("https://example.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FullCheckResponse | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    setHasKey(Boolean(loadApiKey()));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline SW optional */
      });
    }
  }, [settingsOpen]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      setResult(data as FullCheckResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onAnalyze(userQuestion?: string) {
    if (!result) return;
    const apiKey = loadApiKey();
    if (!apiKey) {
      setSettingsOpen(true);
      setError("Add your Anthropic API key in Settings to run Claude diagnosis.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anthropic-api-key": apiKey,
        },
        body: JSON.stringify({
          url: result.url,
          sections: result.sections,
          userQuestion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden />
      <header className="topbar">
        <p className="brand">UrlChecker</p>
        <button
          type="button"
          className="ghost"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
        >
          {hasKey ? "API key saved" : "Add API key"}
        </button>
      </header>

      <main>
        <section className="hero">
          <h1 className="brand-hero">UrlChecker</h1>
          <p className="lede">
            Paste a URL. See HTTP, TLS, and DNS/mail hygiene — then ask Claude only when something
            fails.
          </p>
          <form className="check-form" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="url">
              URL to check
            </label>
            <input
              id="url"
              name="url"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Checking…" : "Run checks"}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </section>

        {result ? (
          <ResultsView
            result={result}
            analysis={analysis}
            analyzing={analyzing}
            onAnalyze={onAnalyze}
          />
        ) : (
          <section className="idle-note" aria-hidden={loading}>
            <p>
              Deterministic checks run first on the server (SSRF-hardened). Claude is optional and
              never decides “is it 200?”.
            </p>
          </section>
        )}
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setHasKey(Boolean(loadApiKey()));
        }}
      />
    </div>
  );
}
