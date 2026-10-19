"use client";

import { useEffect, useState } from "react";
import { loadApiKey, saveApiKey } from "@/lib/storage";

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setKey(loadApiKey());
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-panel">
        <header>
          <h2>Settings</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </header>
        <label className="field">
          <span>Anthropic API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p className="hint">
          Stored only in this browser&apos;s <code>localStorage</code> under{" "}
          <code>urlchecker.anthropicApiKey</code>. Never committed to the repo. Used only when you
          ask Claude to diagnose failures.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setKey("");
              saveApiKey("");
              setSaved(true);
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveApiKey(key.trim());
              setSaved(true);
            }}
          >
            {saved ? "Saved" : "Save key"}
          </button>
        </div>
      </div>
    </div>
  );
}
