const KEY = "urlchecker.anthropicApiKey";

export function loadApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!value) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, value);
  } catch {
    // ignore quota / private mode
  }
}
