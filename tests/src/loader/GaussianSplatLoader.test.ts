import { AssetType, GaussianSplat } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EXPECTED_FIRST_POSITION,
  PLY_B64,
  SPLAT_B64,
  SPLAT_COUNT,
  SPZ_V2_B64,
  SPZ_V3_B64,
  SPZ_V4_B64,
  SPZ_V4_NO_SH_B64
} from "./gaussianSplatFixtures";

let engine: WebGLEngine;
let captured: ArrayBuffer | null;
let originSetData: (buffer: ArrayBuffer) => void;

function bytesFromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function urlFromBytes(bytes: Uint8Array, ext: string): string {
  return URL.createObjectURL(new Blob([bytes])) + "#." + ext;
}

/** Load a fixture and return the decoded 32-byte-per-splat buffer that the loader handed to GaussianSplat.setData. */
async function decode(b64: string, ext = "spz"): Promise<ArrayBuffer> {
  captured = null;
  await engine.resourceManager.load<GaussianSplat>({
    url: urlFromBytes(bytesFromBase64(b64), ext),
    type: AssetType.GaussianSplat
  });
  return captured!;
}

function load(bytes: Uint8Array, ext = "spz"): Promise<GaussianSplat> {
  return engine.resourceManager.load<GaussianSplat>({ url: urlFromBytes(bytes, ext), type: AssetType.GaussianSplat });
}

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  // Capture the decoded buffer and skip the real GPU upload so the test exercises only the parse/dequant path.
  originSetData = GaussianSplat.prototype.setData;
  GaussianSplat.prototype.setData = function (buffer: ArrayBuffer) {
    captured = buffer.slice(0);
  };
});

afterAll(() => {
  GaussianSplat.prototype.setData = originSetData;
  engine.destroy();
});

describe("GaussianSplatLoader", () => {
  it("decodes SPZ v4 (NGSP / ZSTD)", async () => {
    const buffer = await decode(SPZ_V4_B64);
    expect(buffer.byteLength).to.equal(32 * SPLAT_COUNT);
    const f32 = new Float32Array(buffer);
    expect(f32[0]).to.be.closeTo(EXPECTED_FIRST_POSITION[0], 1e-3);
    expect(f32[1]).to.be.closeTo(EXPECTED_FIRST_POSITION[1], 1e-3);
    expect(f32[2]).to.be.closeTo(EXPECTED_FIRST_POSITION[2], 1e-3);
  });

  it("decodes SPZ v3 and v4 of the same scene byte-identically", async () => {
    // v3 (gzip) and v4 (NGSP) carry identical quantized attributes — only the container differs — so the
    // proven gzip path is ground truth for the new ZSTD path.
    const v3 = new Uint8Array(await decode(SPZ_V3_B64));
    const v4 = new Uint8Array(await decode(SPZ_V4_B64));
    expect(v4).to.deep.equal(v3);
  });

  it("decodes SPZ v2 (legacy quaternion encoding)", async () => {
    const buffer = await decode(SPZ_V2_B64);
    expect(buffer.byteLength).to.equal(32 * SPLAT_COUNT);
    const f32 = new Float32Array(buffer);
    expect(f32[0]).to.be.closeTo(EXPECTED_FIRST_POSITION[0], 1e-3);
  });

  it("decodes SPZ v4 with no spherical-harmonics stream", async () => {
    const buffer = await decode(SPZ_V4_NO_SH_B64);
    expect(buffer.byteLength).to.equal(32 * SPLAT_COUNT);
  });

  it("passes through a raw .splat buffer", async () => {
    const buffer = await decode(SPLAT_B64, "splat");
    expect(buffer.byteLength).to.equal(32 * SPLAT_COUNT);
  });

  it("decodes a binary 3DGS .ply", async () => {
    const buffer = await decode(PLY_B64, "ply");
    expect(buffer.byteLength).to.equal(32 * SPLAT_COUNT);
    const f32 = new Float32Array(buffer);
    expect(f32[0]).to.be.closeTo(EXPECTED_FIRST_POSITION[0], 1e-3);
  });

  it("rejects an unsupported SPZ version", async () => {
    const bytes = bytesFromBase64(SPZ_V4_B64);
    bytes[4] = 5; // version 5
    await expect(load(bytes)).rejects.toThrow(/unsupported SPZ/);
  });

  it("rejects a corrupt SPZ v4 stream", async () => {
    const bytes = bytesFromBase64(SPZ_V4_B64).slice(0, -40); // truncate the last ZSTD stream
    await expect(load(bytes)).rejects.toThrow(/SPZ v4 stream/);
  });

  it("rejects invalid SPZ payload", async () => {
    const stream = new Blob([new Uint8Array(64)]).stream().pipeThrough(new CompressionStream("gzip"));
    const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());
    await expect(load(gzipped)).rejects.toThrow(/invalid SPZ/);
  });

  it("rejects a PLY missing end_header", async () => {
    const bytes = new TextEncoder().encode("ply\nformat binary_little_endian 1.0\nelement vertex 1\n");
    await expect(load(bytes, "ply")).rejects.toThrow(/invalid PLY/);
  });
});
