import { sha256Portable } from "@galacean/engine-building/building/runtime/Sha256.js";

/**
 * Polyfills `crypto.randomUUID` and `crypto.subtle.digest("SHA-256", ...)` only when
 * missing (e.g. mobile Safari opened via non-HTTPS LAN IP during local testing).
 * Complete no-op in HTTPS and localhost secure contexts.
 */
function installInsecureContextCryptoFallback(): void {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj) return;

  if (typeof cryptoObj.randomUUID !== "function" && typeof cryptoObj.getRandomValues === "function") {
    try {
      cryptoObj.randomUUID = () => {
        const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6]! & 0x0f) | 0x40;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
      };
    } catch {
      // Ignore strict/non-writable Crypto objects on embedded runtimes.
    }
  }

  if (!cryptoObj.subtle) {
    try {
      Object.defineProperty(cryptoObj, "subtle", {
        configurable: true,
        value: {
          digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> {
            const name = typeof algorithm === "string" ? algorithm : algorithm?.name;
            if (!name || name.toUpperCase() !== "SHA-256") {
              return Promise.reject(
                new Error(`Insecure-context fallback only implements SHA-256, got '${String(name ?? "")}'.`)
              );
            }
            return Promise.resolve(sha256Portable(data));
          }
        }
      });
    } catch {
      // Ignore strict/non-configurable Crypto objects on embedded runtimes.
    }
  }
}

installInsecureContextCryptoFallback();
