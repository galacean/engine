import { describe, expect, it } from "vitest";
import {
  PoolSurfaceUploadStrategy,
  resolvePoolSurfaceUploadPolicy
} from "../../runtime/interaction/PoolSurfaceUploadPolicy";

describe("PoolSurfaceUploadPolicy", () => {
  it("selects the fastest measured supported strategy without changing CPU query ownership", () => {
    const policy = resolvePoolSurfaceUploadPolicy({
      simulationSampleCount: 6837,
      renderVertexCount: 26985,
      capabilities: { vertexTextureFetch: true, r8TextureUpload: true },
      fallbackStrategy: PoolSurfaceUploadStrategy.CpuInterpolated,
      benchmarks: [
        { strategy: PoolSurfaceUploadStrategy.CpuVertex, p95UploadMs: 0.8 },
        { strategy: PoolSurfaceUploadStrategy.CpuInterpolated, p95UploadMs: 1.6 },
        { strategy: PoolSurfaceUploadStrategy.TextureDisplacement, p95UploadMs: 0.2 }
      ]
    });

    expect(policy.strategy).toBe(PoolSurfaceUploadStrategy.TextureDisplacement);
    expect(policy.selection).toBe("measured");
    expect(policy.querySource).toBe("cpu-height-field");
    expect(policy.requiresGpuReadback).toBe(false);
    expect(policy.maxUploadsPerRenderFrame).toBe(1);
    expect(policy.estimatedUploadBytesPerFrame).toBe(6837 * 2);
  });

  it("rejects unsupported texture measurements and leaves the provisional fallback caller-owned", () => {
    const policy = resolvePoolSurfaceUploadPolicy({
      simulationSampleCount: 100,
      renderVertexCount: 400,
      capabilities: { vertexTextureFetch: false, r8TextureUpload: true },
      fallbackStrategy: PoolSurfaceUploadStrategy.CpuVertex,
      benchmarks: [{ strategy: PoolSurfaceUploadStrategy.TextureDisplacement, p95UploadMs: 0.01 }]
    });

    expect(policy).toMatchObject({
      strategy: PoolSurfaceUploadStrategy.CpuVertex,
      selection: "caller-fallback",
      querySource: "cpu-height-field",
      requiresGpuReadback: false
    });
  });
});
