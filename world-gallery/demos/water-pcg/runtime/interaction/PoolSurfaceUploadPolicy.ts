export enum PoolSurfaceUploadStrategy {
  CpuVertex = "cpu-vertex",
  CpuInterpolated = "cpu-interpolated",
  TextureDisplacement = "texture-displacement"
}

export interface PoolSurfaceUploadCapabilities {
  readonly vertexTextureFetch: boolean;
  readonly r8TextureUpload: boolean;
}

export interface PoolSurfaceUploadBenchmark {
  readonly strategy: PoolSurfaceUploadStrategy;
  readonly p95UploadMs: number;
}

export interface PoolSurfaceUploadPolicyOptions {
  readonly simulationSampleCount: number;
  readonly renderVertexCount: number;
  readonly capabilities: PoolSurfaceUploadCapabilities;
  readonly fallbackStrategy: PoolSurfaceUploadStrategy.CpuVertex | PoolSurfaceUploadStrategy.CpuInterpolated;
  readonly benchmarks?: readonly PoolSurfaceUploadBenchmark[];
}

export interface PoolSurfaceUploadPolicy {
  readonly strategy: PoolSurfaceUploadStrategy;
  readonly selection: "measured" | "caller-fallback";
  readonly estimatedUploadBytesPerFrame: number;
  readonly maxUploadsPerRenderFrame: 1;
  readonly querySource: "cpu-height-field";
  readonly requiresGpuReadback: false;
}

const CPU_VERTEX_BYTES = 10 * Float32Array.BYTES_PER_ELEMENT;
const TEXTURE_BYTES_PER_SAMPLE = 2;

function supportsStrategy(strategy: PoolSurfaceUploadStrategy, capabilities: PoolSurfaceUploadCapabilities): boolean {
  return (
    strategy !== PoolSurfaceUploadStrategy.TextureDisplacement ||
    (capabilities.vertexTextureFetch && capabilities.r8TextureUpload)
  );
}

function estimateBytes(
  strategy: PoolSurfaceUploadStrategy,
  simulationSampleCount: number,
  renderVertexCount: number
): number {
  switch (strategy) {
    case PoolSurfaceUploadStrategy.CpuVertex:
      return simulationSampleCount * CPU_VERTEX_BYTES;
    case PoolSurfaceUploadStrategy.CpuInterpolated:
      return renderVertexCount * CPU_VERTEX_BYTES;
    case PoolSurfaceUploadStrategy.TextureDisplacement:
      return simulationSampleCount * TEXTURE_BYTES_PER_SAMPLE;
  }
}

/** Selects only from measured, supported strategies; otherwise the caller owns the provisional CPU fallback. */
export function resolvePoolSurfaceUploadPolicy(options: PoolSurfaceUploadPolicyOptions): PoolSurfaceUploadPolicy {
  if (
    !Number.isInteger(options.simulationSampleCount) ||
    options.simulationSampleCount < 1 ||
    !Number.isInteger(options.renderVertexCount) ||
    options.renderVertexCount < 1
  ) {
    throw new Error("Pool surface upload sample counts must be positive integers.");
  }

  let strategy: PoolSurfaceUploadStrategy = options.fallbackStrategy;
  let selection: PoolSurfaceUploadPolicy["selection"] = "caller-fallback";
  let bestP95 = Number.POSITIVE_INFINITY;
  for (const benchmark of options.benchmarks ?? []) {
    if (
      !Number.isFinite(benchmark.p95UploadMs) ||
      benchmark.p95UploadMs < 0 ||
      !supportsStrategy(benchmark.strategy, options.capabilities)
    ) {
      continue;
    }
    const estimatedBytes = estimateBytes(benchmark.strategy, options.simulationSampleCount, options.renderVertexCount);
    const bestBytes = estimateBytes(strategy, options.simulationSampleCount, options.renderVertexCount);
    if (benchmark.p95UploadMs < bestP95 || (benchmark.p95UploadMs === bestP95 && estimatedBytes < bestBytes)) {
      strategy = benchmark.strategy;
      selection = "measured";
      bestP95 = benchmark.p95UploadMs;
    }
  }

  return Object.freeze({
    strategy,
    selection,
    estimatedUploadBytesPerFrame: estimateBytes(strategy, options.simulationSampleCount, options.renderVertexCount),
    maxUploadsPerRenderFrame: 1,
    querySource: "cpu-height-field",
    requiresGpuReadback: false
  });
}
