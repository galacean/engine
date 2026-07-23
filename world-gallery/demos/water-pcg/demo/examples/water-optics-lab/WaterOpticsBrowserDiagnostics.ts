export type WaterOpticsBrowserDiagnosticKind = "error" | "unhandledrejection" | "console-error" | "console-warning";

export interface WaterOpticsBrowserDiagnostic {
  readonly kind: WaterOpticsBrowserDiagnosticKind;
  readonly message: string;
  readonly timestampMs: number;
}

const MAX_DIAGNOSTIC_COUNT = 100;

function describeDiagnosticValue(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Safari's W3C endpoint does not expose Playwright-style console/page-error events.
 * Keep a small page-owned diagnostic buffer so device acceptance can fail closed.
 */
export function installWaterOpticsBrowserDiagnostics(): void {
  if (window.waterPcgOpticsDiagnostics) return;
  const diagnostics: WaterOpticsBrowserDiagnostic[] = [];
  window.waterPcgOpticsDiagnostics = diagnostics;

  const record = (kind: WaterOpticsBrowserDiagnosticKind, values: readonly unknown[]): void => {
    if (diagnostics.length >= MAX_DIAGNOSTIC_COUNT) return;
    diagnostics.push(
      Object.freeze({
        kind,
        message: values.map(describeDiagnosticValue).join(" "),
        timestampMs: performance.now()
      })
    );
  };

  window.addEventListener("error", (event) => {
    record("error", [event.error ?? event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    record("unhandledrejection", [event.reason]);
  });

  const consoleError = console.error.bind(console);
  console.error = (...values: unknown[]): void => {
    record("console-error", values);
    consoleError(...values);
  };
  const consoleWarning = console.warn.bind(console);
  console.warn = (...values: unknown[]): void => {
    record("console-warning", values);
    consoleWarning(...values);
  };
}

declare global {
  interface Window {
    waterPcgOpticsDiagnostics?: WaterOpticsBrowserDiagnostic[];
  }
}
