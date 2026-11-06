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

export function addWaterResourceMemoryMetrics(
  values: readonly WaterResourceMemoryMetrics[]
): WaterResourceMemoryMetrics {
  let cpuStaticBytes = 0;
  let cpuDynamicBytes = 0;
  let gpuBytes = 0;
  let historyBytes = 0;
  let reflectionBytes = 0;
  for (const value of values) {
    cpuStaticBytes += value.cpuStaticBytes;
    cpuDynamicBytes += value.cpuDynamicBytes;
    gpuBytes += value.gpuBytes;
    historyBytes += value.historyBytes;
    reflectionBytes += value.reflectionBytes;
  }
  return createWaterResourceMemoryMetrics({
    cpuStaticBytes,
    cpuDynamicBytes,
    gpuBytes,
    historyBytes,
    reflectionBytes
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
    for (const nested of Object.values(candidate)) bytes += visit(nested);
    return bytes;
  };

  return visit(value);
}
