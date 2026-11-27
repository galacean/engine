/** Memory categories that can be aggregated across resources, runtimes, and cameras. */
import { isWaterOwnedNumericBuffer } from "../../compiler/shared/WaterBufferOwnership";
export interface WaterResourceMemoryMetrics {
  readonly cpuStaticBytes: number;
  readonly cpuDynamicBytes: number;
  readonly gpuBytes: number;
  readonly historyBytes: number;
  readonly reflectionBytes: number;
  readonly totalBytes: number;
}

export interface WaterResourceMemoryMetricsInput {
  readonly cpuStaticBytes?: number;
  readonly cpuDynamicBytes?: number;
  readonly gpuBytes?: number;
  readonly historyBytes?: number;
  readonly reflectionBytes?: number;
}

function sanitizeByteCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

export function createWaterResourceMemoryMetrics(
  input: WaterResourceMemoryMetricsInput = {}
): WaterResourceMemoryMetrics {
  const cpuStaticBytes = sanitizeByteCount(input.cpuStaticBytes);
  const cpuDynamicBytes = sanitizeByteCount(input.cpuDynamicBytes);
  const gpuBytes = sanitizeByteCount(input.gpuBytes);
  const historyBytes = sanitizeByteCount(input.historyBytes);
  const reflectionBytes = sanitizeByteCount(input.reflectionBytes);
  return Object.freeze({
    cpuStaticBytes,
    cpuDynamicBytes,
    gpuBytes,
    historyBytes,
    reflectionBytes,
    totalBytes: cpuStaticBytes + cpuDynamicBytes + gpuBytes + historyBytes + reflectionBytes
  });
}

/**
 * Counts uniquely owned ArrayBuffers reachable from immutable compiled data.
 * Plain JS object/tuple overhead is deliberately excluded and reported
 * separately by profilers rather than guessed here.
 */
export function measureWaterOwnedCpuBytes(value: unknown): number {
  const visitedObjects = new Set<object>();
  const visitedBuffers = new Set<ArrayBufferLike>();

  const visit = (candidate: unknown): number => {
    if (typeof candidate !== "object" || candidate === null) return 0;
    if (Array.isArray(candidate)) {
      const len = candidate.length;
      if (len === 0) return 0;
      // Fast path for vertex/UV/color numeric tuples (no ArrayBuffers, no Set traffic).
      if (
        len <= 4 &&
        typeof candidate[0] === "number" &&
        (len < 2 || typeof candidate[1] === "number") &&
        (len < 3 || typeof candidate[2] === "number") &&
        (len < 4 || typeof candidate[3] === "number")
      ) {
        return 0;
      }
      if (visitedObjects.has(candidate)) return 0;
      visitedObjects.add(candidate);
      let bytes = 0;
      for (let i = 0; i < len; i++) {
        const el = candidate[i];
        if (typeof el === "object" && el !== null) bytes += visit(el);
      }
      return bytes;
    }
    if (visitedObjects.has(candidate)) return 0;
    visitedObjects.add(candidate);

    if (isWaterOwnedNumericBuffer(candidate)) {
      const view = candidate.borrowTypedArray();
      if (visitedBuffers.has(view.buffer)) return 0;
      visitedBuffers.add(view.buffer);
      return view.byteLength;
    }
    if (ArrayBuffer.isView(candidate)) {
      if (visitedBuffers.has(candidate.buffer)) return 0;
      visitedBuffers.add(candidate.buffer);
      return candidate.byteLength;
    }
    if (candidate instanceof ArrayBuffer) {
      if (visitedBuffers.has(candidate)) return 0;
      visitedBuffers.add(candidate);
      return candidate.byteLength;
    }
    let bytes = 0;
    const record = candidate as Record<string, unknown>;
    for (const key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      const nested = record[key];
      if (typeof nested === "object" && nested !== null) bytes += visit(nested);
    }
    return bytes;
  };

  return visit(value);
}
