import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Vector3 } from "@galacean/engine";
import { describe, expect, it } from "vitest";
import {
  buildGrassClumpLodIndexData,
  buildSimplifiedGrassLod1Indices,
  buildSimplifiedGrassLod2Indices
} from "../src/runtime/SeedWorldDetailInstancedMesh";
import { syncGrassDetailGeometryLod } from "../src/runtime/SeedWorldPopulationRuntime";

const directory = path.dirname(fileURLToPath(import.meta.url));
const atomsDirectory = path.resolve(directory, "../../terrain/src/data/seed-world/public/atoms");

function readGlbPrimitive(fileName: string): {
  readonly positions: readonly Vector3[];
  readonly indices: Uint16Array;
} {
  const bytes = readFileSync(path.join(atomsDirectory, fileName));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const primitive = gltf.meshes[0].primitives[0];
  const readAccessor = (accessorIndex: number) => {
    const accessor = gltf.accessors[accessorIndex];
    const bufferView = gltf.bufferViews[accessor.bufferView];
    const offset = binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return { accessor, bufferView, offset };
  };
  const posInfo = readAccessor(primitive.attributes.POSITION);
  const posStride = posInfo.bufferView.byteStride ?? 12;
  const positions = Array.from({ length: posInfo.accessor.count }, (_, index) => {
    const base = posInfo.offset + index * posStride;
    return new Vector3(view.getFloat32(base, true), view.getFloat32(base + 4, true), view.getFloat32(base + 8, true));
  });
  const idxInfo = readAccessor(primitive.indices);
  const idxStride = idxInfo.bufferView.byteStride ?? 2;
  const indices = new Uint16Array(idxInfo.accessor.count);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = view.getUint16(idxInfo.offset + i * idxStride, true);
  }
  return { positions, indices };
}

describe("SeedWorld grass clump mesh LOD", () => {
  it("builds belly-preserving 24 -> 12 -> 6 triangle slices for grass.glb while keeping LOD0 identical", () => {
    const { positions, indices } = readGlbPrimitive("grass.glb");
    const lodData = buildGrassClumpLodIndexData(positions, indices);
    expect(lodData).toBeDefined();
    expect(lodData!.lodSlices.map((slice) => slice.count / 3)).toEqual([24, 12, 6]);
    expect(Array.from(lodData!.lod0Indices)).toEqual(Array.from(indices));
    expect(Array.from(buildSimplifiedGrassLod1Indices(positions, indices)!)).toEqual(Array.from(lodData!.lod1Indices));
    expect(Array.from(buildSimplifiedGrassLod2Indices(positions, indices)!)).toEqual(Array.from(lodData!.lod2Indices));

    // Verify all LOD triangles are non-degenerate and retain the widest belly ring (y ~ 0.068).
    for (const slice of lodData!.lodSlices) {
      let hasBellyRing = false;
      for (let i = slice.start; i < slice.start + slice.count; i += 3) {
        const a = positions[lodData!.indices[i]!]!;
        const b = positions[lodData!.indices[i + 1]!]!;
        const c = positions[lodData!.indices[i + 2]!]!;
        if ((a.y > 0.04 && a.y < 0.09) || (b.y > 0.04 && b.y < 0.09) || (c.y > 0.04 && c.y < 0.09)) {
          hasBellyRing = true;
        }
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abz = b.z - a.z;
        const acx = c.x - a.x;
        const acy = c.y - a.y;
        const acz = c.z - a.z;
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        expect(Math.hypot(nx, ny, nz)).toBeGreaterThan(1e-5);
      }
      expect(hasBellyRing).toBe(true);
    }
  });

  it("decimates mixed 6v/8v ribbon tufts (grass-3.glb) and leaves flower meshes untouched", () => {
    const grass3 = readGlbPrimitive("grass-3.glb");
    const grass3Lod = buildGrassClumpLodIndexData(grass3.positions, grass3.indices);
    expect(grass3Lod).toBeDefined();
    expect(grass3Lod!.lodSlices.map((slice) => slice.count / 3)).toEqual([46, 23, 10]);

    const flowers = readGlbPrimitive("flowers-1.glb");
    expect(buildGrassClumpLodIndexData(flowers.positions, flowers.indices)).toBeUndefined();
  });

  it("preserves LOD0 near the camera and applies hysteresis + LOD tuning across distance rings", () => {
    const subMesh = { start: 0, count: 72 };
    const batch = {
      resources: {
        mesh: { subMeshes: [subMesh] },
        lod0Start: 0,
        lod0Count: 72,
        lod1Start: 72,
        lod1Count: 36,
        lod2Start: 108,
        lod2Count: 18
      },
      renderer: {
        shaderData: {
          setVector4() {}
        }
      },
      grassLodLevel: undefined as 0 | 1 | 2 | undefined,
      grassLodDebugColorized: undefined as boolean | undefined
    };
    const config = {
      colorizeLod: false,
      lod1DistanceMetres: 14,
      lod2DistanceMetres: 26,
      maximumDistanceMetres: 60,
      minimumDensityFraction: 0.25,
      distanceMode: "edge" as const
    };

    syncGrassDetailGeometryLod(batch as never, 13.9, config);
    expect(batch.grassLodLevel).toBe(0);
    expect(subMesh).toEqual({ start: 0, count: 72 });

    // Entering LOD1 from LOD0 requires crossing 14 + 0.75 = 14.75m.
    syncGrassDetailGeometryLod(batch as never, 14.3, config);
    expect(batch.grassLodLevel).toBe(0);
    syncGrassDetailGeometryLod(batch as never, 14.9, config);
    expect(batch.grassLodLevel).toBe(1);
    expect(subMesh).toEqual({ start: 72, count: 36 });

    // Hysteresis keeps LOD1 until moving closer than 14 - 0.75 = 13.25m.
    syncGrassDetailGeometryLod(batch as never, 13.5, config);
    expect(batch.grassLodLevel).toBe(1);
    syncGrassDetailGeometryLod(batch as never, 13.0, config);
    expect(batch.grassLodLevel).toBe(0);

    // Entering LOD2 and honoring global LOD disablement.
    syncGrassDetailGeometryLod(batch as never, 27.0, config);
    expect(batch.grassLodLevel).toBe(2);
    expect(subMesh).toEqual({ start: 108, count: 18 });

    syncGrassDetailGeometryLod(batch as never, 27.0, config, { enabled: false, distanceScale: 1 });
    expect(batch.grassLodLevel).toBe(0);
    expect(subMesh).toEqual({ start: 0, count: 72 });
  });
});
