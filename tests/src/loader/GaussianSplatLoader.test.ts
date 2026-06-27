import { AssetType, GaussianSplat, GaussianSplatData } from "@galacean/engine-core";
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
let captured: GaussianSplatData | null;
let originSetData: (data: GaussianSplatData) => void;

function bytesFromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function urlFromBytes(bytes: Uint8Array, ext: string): string {
  return URL.createObjectURL(new Blob([bytes])) + "#." + ext;
}

/** Load a fixture and return the decoded splat data the loader handed to GaussianSplat.setData. */
async function decode(b64: string, ext = "spz"): Promise<GaussianSplatData> {
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
  // Capture the decoded data and skip the real GPU upload so the test exercises only the parse/dequant path.
  originSetData = GaussianSplat.prototype.setData;
  GaussianSplat.prototype.setData = function (data: GaussianSplatData) {
    captured = data;
  };
});

afterAll(() => {
  GaussianSplat.prototype.setData = originSetData;
  engine.destroy();
});

describe("GaussianSplatLoader", () => {
  it("decodes SPZ v4 (NGSP / ZSTD)", async () => {
    const data = await decode(SPZ_V4_B64);
    expect(data.count).to.equal(SPLAT_COUNT);
    expect(data.positions[0]).to.be.closeTo(EXPECTED_FIRST_POSITION[0], 1e-3);
    expect(data.positions[1]).to.be.closeTo(EXPECTED_FIRST_POSITION[1], 1e-3);
    expect(data.positions[2]).to.be.closeTo(EXPECTED_FIRST_POSITION[2], 1e-3);
  });

  it("decodes SPZ v3 and v4 of the same scene to identical data", async () => {
    // v3 (gzip) and v4 (NGSP) carry identical quantized attributes — only the container differs — so the
    // proven gzip path is ground truth for the new ZSTD path.
    const v3 = await decode(SPZ_V3_B64);
    const v4 = await decode(SPZ_V4_B64);
    expect(v4.positions).to.deep.equal(v3.positions);
    expect(v4.colors).to.deep.equal(v3.colors);
  });

  it("decodes SPZ v2 (legacy quaternion encoding)", async () => {
    const data = await decode(SPZ_V2_B64);
    expect(data.count).to.equal(SPLAT_COUNT);
    expect(data.positions[0]).to.be.closeTo(EXPECTED_FIRST_POSITION[0], 1e-3);
  });

  it("decodes SPZ v4 with no spherical-harmonics stream", async () => {
    const data = await decode(SPZ_V4_NO_SH_B64);
    expect(data.count).to.equal(SPLAT_COUNT);
  });

  it("passes through a raw .splat buffer", async () => {
    const data = await decode(SPLAT_B64, "splat");
    expect(data.count).to.equal(SPLAT_COUNT);
  });

  it("decodes a binary 3DGS .ply with spherical harmonics", async () => {
    const data = await decode(PLY_B64, "ply");
    expect(data.count).to.equal(SPLAT_COUNT);
    expect(data.positions[0]).to.be.closeTo(EXPECTED_FIRST_POSITION[0], 1e-3);
    expect(data.shDegree).to.equal(3);
    // The .ply carries the same scene's SH as the spz; the channel-major f_rest must transpose to the same
    // coefficient-major layout the decoder produces (a wrong transpose scrambles it well past quantization noise).
    const spz = await decode(SPZ_V4_B64);
    expect(data.sh.length).to.equal(spz.sh.length);
    for (let i = 0; i < data.sh.length; i += 31) {
      expect(data.sh[i]).to.be.closeTo(spz.sh[i], 0.1);
    }
  });

  it("rejects undecodable SPZ data", async () => {
    // A well-formed gzip wrapping non-SPZ content: the decoder yields no gaussians and the loader rejects.
    const stream = new Blob([new Uint8Array(64)]).stream().pipeThrough(new CompressionStream("gzip"));
    const gzipped = new Uint8Array(await new Response(stream).arrayBuffer());
    await expect(load(gzipped)).rejects.toThrow(/decode SPZ/);
  });

  it("rejects a PLY missing end_header", async () => {
    const bytes = new TextEncoder().encode("ply\nformat binary_little_endian 1.0\nelement vertex 1\n");
    await expect(load(bytes, "ply")).rejects.toThrow(/invalid PLY/);
  });
});
