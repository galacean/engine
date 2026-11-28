import { expect, it } from "vitest";
import { WebGLEngine, Camera, Vector3, Vector4, PrimitiveMesh, UnlitMaterial, type BufferMesh } from "@galacean/engine";
import {
  SeedWorldForwardGrass,
  type ForwardGrassUpdateParams
} from "../../../packages/world-planning/src/runtime/SeedWorldForwardGrass";
import type { SeedWorldFields } from "../../../packages/world-planning/src/runtime/SeedWorldFields";

it("matches an uncropped GPU lattice across slopes, sparse masks, pitch, yaw and orthographic cameras", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const engine = await WebGLEngine.create({ canvas });
  try {
    const root = engine.sceneManager.activeScene.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.fieldOfView = 60;
    camera.aspectRatio = 1.7;
    camera.farClipPlane = 150;
    const mesh = PrimitiveMesh.createCuboid(engine, 0.1, 0.4, 0.1),
      material = new UnlitMaterial(engine);
    const optimized = new SeedWorldForwardGrass(engine, root, mesh, material, () => {});
    const reference = new SeedWorldForwardGrass(engine, root, mesh, material, () => {});
    // Independent broad-phase reference: submit every tile in the distance square.
    // Actual GPU density/ring/frustum tests still determine the final positive-scale instances.
    (reference as any)._boundVisibleRings = function (bands: Float64Array, params: ForwardGrassUpdateParams) {
      const cx = this._cameraXZ[0],
        cz = this._cameraXZ[1];
      const extent = params.maximumDistanceMetres + 4;
      for (let r = 0; r < 3; r++) {
        const ring = this._rings[r];
        ring.tileCount = 0;
        this._visibleRingBounds.set([cx - extent, -100, cz - extent, cx + extent, 100, cz + extent], r * 6);
        for (let z = 0; z < 64; z++)
          for (let x = 0; x < 64; x++) {
            const wx = this._windowOriginX + x * 4,
              wz = this._windowOriginZ + z * 4;
            if (wx + 4 < cx - extent || wx > cx + extent || wz + 4 < cz - extent || wz > cz + extent) continue;
            ring.tileData[ring.tileCount++] = z * 64 + x;
          }
        ring.tilesDirty = true;
      }
    };
    (reference as any)._writeCandidateGroups = function (ring: any) {
      const width = 4 / ring.config.stepMetres;
      let count = 0;
      for (let i = 0; i < ring.tileCount; i++) {
        const tx = ring.tileData[i] & 63,
          tz = ring.tileData[i] >> 6;
        for (let z = tz * width; z < (tz + 1) * width; z += 8)
          for (let x = tx * width; x < (tx + 1) * width; x += 8) ring.candidateGroups[count++] = z * 1024 + x;
      }
      return count * 64;
    };
    const heights = new Float32Array(257 ** 2),
      samples = new Uint8Array(65 ** 2);
    for (let z = 0; z < 257; z++)
      for (let x = 0; x < 257; x++) heights[z * 257 + x] = Math.sin(x * 0.08) * 3 + Math.cos(z * 0.12) * 4;
    for (let z = 0; z < 65; z++) for (let x = 0; x < 65; x++) samples[z * 65 + x] = (x + z) % 5 < 2 ? 255 : 0;
    const params: ForwardGrassUpdateParams = {
      camera,
      active: true,
      lod1DistanceMetres: 13.5,
      lod2DistanceMetres: 26.2,
      maximumDistanceMetres: 37.5,
      minimumDensityFraction: 1,
      minScale: 0.6,
      maxScale: 3,
      useEcologicalHeight: false,
      colorizeLod: false,
      debugColors: { 0: new Vector4(), 1: new Vector4(), 2: new Vector4() },
      debugOffColor: new Vector4(),
      lodDebugColorProperty: "renderer_TestLod",
      revealRangeSetter: () => {},
      samplerContext: {
        fields: {
          sizeMetres: 256,
          worldOrigin: [-128, -128],
          heightResolution: 257,
          surfaceHeights: heights
        } as unknown as SeedWorldFields,
        densityFields: [
          {
            assetProfileKey: "test",
            prototypeFamily: "grass",
            category: "grass",
            maximumDensityPerSquareMetre: 24,
            resolution: 65,
            samples,
            hash: 1
          }
        ],
        speciesProfiles: [],
        resolveDensityMultiplier: () => 1,
        sampleTerrainNormal: (_f, _x, _z, out) => {
          out[0] = out[2] = 0;
          out[1] = 1;
        },
        sampleSurfaceWeights: (_f, _x, _z, out) => {
          out[0] = 1;
          out[1] = out[2] = 0;
        }
      }
    };
    const capture = (grass: SeedWorldForwardGrass) => {
      const result: Map<string, number[]>[] = [];
      grass.visitRenderers((renderer) => {
        const values = new Map<string, number[]>();
        result.push(values);
        if (!renderer.enabled) return;
        const mesh = renderer.mesh as BufferMesh,
          data = new Float32Array(mesh.instanceCount * 13);
        mesh.vertexBufferBindings.at(-1)!.buffer.getData(data);
        for (let i = 0; i < mesh.instanceCount; i++)
          if (data[i * 13 + 4] > 0) {
            const record = Array.from(data.subarray(i * 13, i * 13 + 13));
            const key = record[0] + "," + record[2];
            expect(values.has(key)).toBe(false);
            values.set(key, record);
          }
      });
      const gl = canvas.getContext("webgl2")!;
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return result;
    };
    for (const [pitch, yaw, ortho] of [
      [0, 0, 0],
      [60, 0, 0],
      [89, 47, 0],
      [30, 137, 0],
      [89, 47, 1],
      [60, 137, 1]
    ]) {
      camera.isOrthographic = !!ortho;
      camera.orthographicSize = 12.2;
      camera.entity.transform.setPosition(0.13, 20, 0.27);
      const p = (pitch * Math.PI) / 180,
        y = (yaw * Math.PI) / 180;
      camera.entity.transform.lookAt(
        new Vector3(0.13 + Math.sin(y) * Math.cos(p), 20 - Math.sin(p), 0.27 - Math.cos(y) * Math.cos(p))
      );
      optimized.update(params);
      reference.update(params);
      expect(capture(optimized)).toEqual(capture(reference));
      // Tiny yaw changes must reuse conservative candidates; larger yaw/roll must remain exact too.
      const cachedPlanes = Array.from((optimized as any)._candidatePlanes);
      for (const angle of [0.001, 0.2, 0.4, 1, 3, 20, 90]) {
        const turn = y + (angle * Math.PI) / 180;
        camera.entity.transform.lookAt(
          new Vector3(0.13 + Math.sin(turn) * Math.cos(p), 20 - Math.sin(p), 0.27 - Math.cos(turn) * Math.cos(p))
        );
        optimized.update(params);
        reference.invalidateSimulation();
        reference.update(params);
        expect(capture(optimized)).toEqual(capture(reference));
        if (angle === 0.001) expect(Array.from((optimized as any)._candidatePlanes)).toEqual(cachedPlanes);
      }
      camera.entity.transform.rotate(0, 0, 17);
      optimized.update(params);
      reference.invalidateSimulation();
      reference.update(params);
      expect(capture(optimized)).toEqual(capture(reference));
      // Stay within the retained candidate volume, cross its boundary, then change height and Z.
      for (const [dx, dy, dz] of [
        [0.3, 0, 0],
        [0.49, 0, 0],
        [0.51, 0, 0],
        [0.99, 0, 0],
        [1.01, 0, 0],
        [-0.2, 0.3, 0.2]
      ]) {
        camera.entity.transform.setPosition(0.13 + dx, 20 + dy, 0.27 + dz);
        optimized.update(params);
        reference.invalidateSimulation();
        reference.update(params);
        expect(capture(optimized)).toEqual(capture(reference));
      }
    }
    // An explicit view matrix changes the frustum without moving the camera entity.
    const inheritedView = capture(optimized);
    const manualView = camera.viewMatrix.clone();
    manualView.elements[12] += 30;
    camera.viewMatrix = manualView;
    optimized.update(params);
    reference.invalidateSimulation();
    reference.update(params);
    const manualResult = capture(optimized);
    const expectedManual = capture(reference);
    expect(manualResult.map((ring) => ring.size)).toEqual(expectedManual.map((ring) => ring.size));
    expect(manualResult).toEqual(expectedManual);
    expect(manualResult).not.toEqual(inheritedView);
    camera.resetViewMatrix();
    optimized.update(params);
    reference.invalidateSimulation();
    reference.update(params);
    expect(capture(optimized)).toEqual(capture(reference));
    let samplesRead = 0;
    const cachedParams = {
      ...params,
      samplerContext: {
        ...params.samplerContext,
        reuseWindowSamples: true,
        sampleSurfaceWeights(fields: SeedWorldFields, x: number, z: number, out: [number, number, number]) {
          samplesRead++;
          params.samplerContext.sampleSurfaceWeights(fields, x, z, out);
        }
      }
    };
    camera.entity.transform.setPosition(0.13, 20, 0.27);
    optimized.invalidateMask();
    reference.invalidateMask();
    optimized.update(cachedParams);
    reference.update(params);
    for (const [x, z, expectedSamples] of [
      [80, 0, 80 * 256],
      [0, 80, 256 ** 2 - 176 ** 2],
      [-80, 0, 256 ** 2 - 176 ** 2],
      [0, 0, 80 * 256],
      [0, -80, 80 * 256],
      [320, 0, 256 ** 2],
      [0, 0, 256 ** 2]
    ]) {
      camera.entity.transform.setPosition(x + 0.13, 20, z + 0.27);
      samplesRead = 0;
      optimized.update(cachedParams);
      reference.update(params);
      expect(samplesRead).toBe(expectedSamples);
      expect(equalBytes((optimized as any)._terrainData, (reference as any)._terrainData)).toBe(true);
      expect(equalBytes((optimized as any)._maskData, (reference as any)._maskData)).toBe(true);
      expect(capture(optimized)).toEqual(capture(reference));
    }
    heights.fill(2.125);
    samples.fill(71);
    optimized.invalidateMask();
    reference.invalidateMask();
    samplesRead = 0;
    optimized.update(cachedParams);
    reference.update(params);
    expect(samplesRead).toBe(256 ** 2);
    expect(equalBytes((optimized as any)._terrainData, (reference as any)._terrainData)).toBe(true);
    expect(equalBytes((optimized as any)._maskData, (reference as any)._maskData)).toBe(true);
    expect(capture(optimized)).toEqual(capture(reference));
    expect(canvas.getContext("webgl2")!.getError()).toBe(0);
    optimized.destroy();
    reference.destroy();
  } finally {
    engine.destroy();
  }
});

function equalBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
