import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH = "2a1d1e0591c0d2a1125332a4b4c08938d89a782a9ea6c46b11c3fd7d35b31580";

interface EnvironmentAssetManifestEntry {
  readonly id: string;
  readonly ownership: {
    readonly owner: string;
    readonly borrowers: readonly string[];
    readonly destroyer: string;
  };
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly trackedPath: string;
  readonly trackedSha256: string;
  readonly byteLength: number;
  readonly format: string;
  readonly dimensions?: readonly [number, number];
  readonly conversion?: string;
  readonly geometry?: {
    readonly vertices: number;
    readonly triangles: number;
    readonly meshes: number;
  };
}

interface EnvironmentAssetManifest {
  readonly sha256: string;
  readonly canonicalization: string;
  readonly sourceRoot: string;
  readonly assets: readonly EnvironmentAssetManifestEntry[];
  readonly ownership: {
    readonly owner: string;
    readonly borrowers: readonly string[];
    readonly destroyer: string;
  };
  readonly distribution: {
    readonly authorization: string;
    readonly independentDistributionAllowed: boolean;
    readonly sourceRepackagingAllowed: boolean;
  };
  readonly materialBinding: {
    readonly materials: readonly string[];
    readonly textureResources: number;
    readonly roughnessDeviation: string;
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readEnvironmentManifest(value: unknown): EnvironmentAssetManifest {
  const manifest = asRecord(value, "Grasslands asset manifest");
  return asRecord(
    manifest.environmentAssetSet,
    "Grasslands environment asset set"
  ) as unknown as EnvironmentAssetManifest;
}

function readPngDimensions(bytes: Buffer): readonly [number, number] {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] as const;
}

function readGlbJson(bytes: Buffer): Record<string, unknown> {
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  const jsonLength = bytes.readUInt32LE(12);
  return asRecord(
    JSON.parse(
      bytes
        .subarray(20, 20 + jsonLength)
        .toString("utf8")
        .trim()
    ),
    "GLB JSON"
  );
}

describe("GrasslandsEnvironmentAssets manifest", () => {
  it("tracks the exact minimal P0 derivative closure and canonical set hash", async () => {
    const manifestPath = fileURLToPath(new URL("../../demo/grasslands/assets/manifest.json", import.meta.url));
    const environment = readEnvironmentManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    const loaderSource = await readFile(
      fileURLToPath(new URL("../../demo/grasslands/GrasslandsEnvironmentAssets.ts", import.meta.url)),
      "utf8"
    );

    expect(environment.assets).toHaveLength(15);
    expect(loaderSource).toContain(GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH);
    expect(new Set(environment.assets.map(({ id }) => id)).size).toBe(15);
    expect(environment.assets.filter(({ format }) => format.startsWith("PNG"))).toHaveLength(10);
    expect(environment.assets.filter(({ format }) => format.startsWith("glTF 2.0 binary"))).toHaveLength(5);
    expect(environment.canonicalization).toBe(
      "SHA-256 of JSON.stringify([[id, trackedSha256], ...]) in the listed order"
    );
    const canonicalBytes = JSON.stringify(environment.assets.map(({ id, trackedSha256 }) => [id, trackedSha256]));
    const canonicalHash = createHash("sha256").update(canonicalBytes).digest("hex");
    expect(canonicalHash).toBe(GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH);
    expect(environment.sha256).toBe(GRASSLANDS_ENVIRONMENT_ASSET_SET_HASH);
    expect(environment.ownership).toMatchObject({
      owner: "GrasslandsEnvironmentAssets",
      borrowers: ["GrasslandsSceneController", "rock MeshRenderer instances"]
    });
    expect(environment.ownership.destroyer).toContain("GrasslandsEnvironmentAssets");
    expect(environment.distribution).toEqual({
      authorization: "user-confirmed paid project license",
      independentDistributionAllowed: false,
      sourceRepackagingAllowed: false
    });
    expect(environment.materialBinding.materials).toEqual([
      "MudStones",
      "Sand",
      "GrassMud",
      "LargeStone",
      "SmallStone"
    ]);
    expect(environment.materialBinding.textureResources).toBe(10);
    expect(environment.materialBinding.roughnessDeviation).toContain("alpha is preserved and audited");

    for (const asset of environment.assets) {
      expect(asset.ownership.owner, asset.id).toBe("GrasslandsEnvironmentAssets");
      expect(asset.ownership.borrowers.length, asset.id).toBeGreaterThan(0);
      expect(asset.ownership.destroyer, asset.id).toBe("GrasslandsEnvironmentAssets.destroyAfterSceneDetach");
      expect(asset.sourcePath).toMatch(/^(Textures|Models)\//);
      expect(asset.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.trackedPath).toMatch(/^demo\/grasslands\/assets\/environment\//);
      const trackedPath = fileURLToPath(new URL(`../../${asset.trackedPath}`, import.meta.url));
      const bytes = await readFile(trackedPath);
      expect(bytes.byteLength, asset.id).toBe(asset.byteLength);
      expect(createHash("sha256").update(bytes).digest("hex"), asset.id).toBe(asset.trackedSha256);
      if (asset.format.startsWith("PNG")) {
        expect(asset.dimensions, asset.id).toEqual([1024, 1024]);
        expect(readPngDimensions(bytes), asset.id).toEqual(asset.dimensions);
      }
    }
  });

  it("keeps all five rock files geometry-only with normals, UVs, and offline tangents", async () => {
    const manifestPath = fileURLToPath(new URL("../../demo/grasslands/assets/manifest.json", import.meta.url));
    const environment = readEnvironmentManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    const models = environment.assets.filter(({ format }) => format.startsWith("glTF 2.0 binary"));

    for (const model of models) {
      const trackedPath = fileURLToPath(new URL(`../../${model.trackedPath}`, import.meta.url));
      const glb = readGlbJson(await readFile(trackedPath));
      const meshes = glb.meshes;
      expect(Array.isArray(meshes) && meshes.length, model.id).toBe(1);
      const mesh = asRecord((meshes as unknown[])[0], `${model.id} mesh`);
      const primitives = mesh.primitives;
      expect(Array.isArray(primitives) && primitives.length, model.id).toBe(1);
      const primitive = asRecord((primitives as unknown[])[0], `${model.id} primitive`);
      const attributes = asRecord(primitive.attributes, `${model.id} attributes`);
      expect(Object.keys(attributes).sort(), model.id).toEqual(["NORMAL", "POSITION", "TANGENT", "TEXCOORD_0"]);
      expect(glb.materials, model.id).toBeUndefined();
      expect(glb.textures, model.id).toBeUndefined();
      expect(glb.images, model.id).toBeUndefined();
      expect(model.conversion, model.id).toContain("FBX2glTF 0.13.1");
      expect(model.geometry, model.id).toMatchObject({ meshes: 1 });
      expect(model.geometry?.vertices, model.id).toBeGreaterThan(0);
      expect(model.geometry?.triangles, model.id).toBeGreaterThan(0);
    }
  });

  it("keeps the 600-frame harness fail-closed on buffer uploads as well as resource creation", async () => {
    const smokeSource = await readFile(
      fileURLToPath(new URL("../../e2e/grasslands-water-smoke.mjs", import.meta.url)),
      "utf8"
    );

    expect(smokeSource).toContain('for (const method of ["bufferData", "bufferSubData"])');
    expect(smokeSource).toContain("meshResourceActivityVector(webGlBefore)");
    expect(smokeSource).toContain("meshResourceActivityVector(webGlAfter)");
    expect(smokeSource).toContain("created GPU resources or uploaded mesh buffers across 600 live frames");
  });
});
