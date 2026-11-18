import { expect, it, vi } from "vitest";
import {
  WebGLEngine,
  Camera,
  Vector3,
  Vector4,
  PrimitiveMesh,
  UnlitMaterial,
  type BufferMesh,
  type MeshRenderer
} from "@galacean/engine";
import {
  SeedWorldForwardGrass,
  type ForwardGrassUpdateParams
} from "../../../packages/world-planning/src/runtime/SeedWorldForwardGrass";
import type { SeedWorldFields } from "../../../packages/world-planning/src/runtime/SeedWorldFields";

it("preserves visible grass across pitch, visibility and orthographic size changes on the GPU", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const engine = await WebGLEngine.create({ canvas });
  try {
    const root = engine.sceneManager.activeScene.createRootEntity();
    const entity = root.createChild(),
      camera = entity.addComponent(Camera);
    camera.fieldOfView = 60;
    // Pinning the current automatic aspect must survive subsequent viewport changes.
    const automaticAspect = camera.aspectRatio;
    camera.aspectRatio = automaticAspect;
    camera.viewport.z = 0.5;
    expect(camera.aspectRatio).toBe(automaticAspect);
    camera.resetAspectRatio();
    expect(camera.aspectRatio).toBe(automaticAspect / 2);
    camera.viewport.z = 1;
    camera.aspectRatio = 1;
    camera.farClipPlane = 200;
    entity.transform.setPosition(0, 20, 0);
    entity.transform.lookAt(new Vector3(0, 0, -20 / Math.sqrt(3)));
    const grass = new SeedWorldForwardGrass(
      engine,
      root,
      PrimitiveMesh.createCuboid(engine, 0.1, 0.4, 0.1),
      new UnlitMaterial(engine),
      () => {}
    );
    const renderers: MeshRenderer[] = [];
    grass.visitRenderers((r) => renderers.push(r));
    const params: ForwardGrassUpdateParams = {
      camera,
      active: true,
      lod1DistanceMetres: 20,
      lod2DistanceMetres: 35,
      maximumDistanceMetres: 50,
      minimumDensityFraction: 1,
      minScale: 1,
      maxScale: 1,
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
          surfaceHeights: new Float32Array(257 ** 2)
        } as unknown as SeedWorldFields,
        densityFields: [
          {
            assetProfileKey: "test",
            category: "grass",
            prototypeFamily: "grass",
            maximumDensityPerSquareMetre: 24,
            resolution: 2,
            samples: new Uint8Array([255, 255, 255, 255]),
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
    const patch = (x: number, z: number) => {
      let count = 0;
      for (const r of renderers) {
        if (!r.enabled) continue;
        const mesh = r.mesh as BufferMesh,
          data = new Float32Array(mesh.instanceCount * 13);
        mesh.vertexBufferBindings.at(-1)!.buffer.getData(data);
        for (let i = 0; i < mesh.instanceCount; i++) {
          if (data[i * 13 + 4] > 0 && Math.abs(data[i * 13] - x) < 0.5 && Math.abs(data[i * 13 + 2] - z) < 0.5) count++;
        }
      }
      return count;
    };
    const initialOutputs = renderers.map((r) => (r.mesh as BufferMesh).vertexBufferBindings.at(-1)!);
    grass.update(params);
    // A coarse tile can contain rejected groups. Only submitted cells require feedback storage.
    for (let i = 0; i < renderers.length; i++) {
      const mesh = renderers[i]!.mesh as BufferMesh;
      const initial = initialOutputs[i]!;
      if (mesh.instanceCount * initial.stride <= initial.buffer.byteLength) {
        expect(mesh.vertexBufferBindings.at(-1)!.buffer.instanceId).toBe(initial.buffer.instanceId);
      }
    }
    const dispatch = vi.spyOn(
      grass as unknown as { _dispatchAllRings(params: ForwardGrassUpdateParams): void },
      "_dispatchAllRings"
    );
    const readView = vi.spyOn(camera, "viewMatrix", "get");
    camera.aspectRatio = camera.aspectRatio;
    camera.orthographicSize += 1;
    entity.transform.setScale(2, 3, 4);
    grass.update(params);
    expect(dispatch).not.toHaveBeenCalled();
    readView.mockClear();
    entity.transform.setPosition(0.004, 20, 0);
    grass.update(params);
    expect(dispatch).not.toHaveBeenCalled();
    expect(readView).not.toHaveBeenCalled();
    readView.mockRestore();
    entity.transform.setPosition(0, 20, 0);
    const translatedView = camera.viewMatrix.clone();
    translatedView.elements[12] += 7;
    camera.viewMatrix = translatedView;
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(1);
    camera.viewMatrix = translatedView;
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(1);
    camera.resetViewMatrix();
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(2);
    entity.transform.setScale(1, 1, 1);
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(2);
    const orientation = entity.transform.rotationQuaternion.clone();
    entity.transform.setScale(0, 0, 0);
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(2);
    entity.transform.setRotation(0, 90, 0);
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(3);
    entity.transform.rotationQuaternion = orientation;
    entity.transform.setScale(1, 1, 1);
    grass.update(params);
    expect(dispatch).toHaveBeenCalledTimes(4);
    dispatch.mockRestore();
    expect(patch(9.5, -4.5)).toBeGreaterThan(0);
    let attempts = 0;
    let rejectRange = false;
    const rangeParams = {
      ...params,
      revealRangeSetter(renderer: MeshRenderer) {
        if (renderer !== renderers[0]) return;
        attempts++;
        if (rejectRange) throw new Error("injected reveal failure");
      }
    };
    grass.invalidateSimulation();
    grass.update(rangeParams);
    expect(attempts).toBe(1);
    const taller = { ...rangeParams, maxScale: 32 };
    rejectRange = true;
    expect(() => grass.update(taller)).toThrow("injected reveal failure");
    rejectRange = false;
    grass.update(taller);
    expect(attempts).toBe(3);
    grass.update(params);
    engine.resourceManager.gc();
    grass.invalidateSimulation();
    grass.update(params);
    expect(patch(9.5, -4.5)).toBeGreaterThan(0);
    // Reusing a pass must preserve both the length and order of its feedback ABI.
    const ring = (grass as any)._rings[0];
    // Simulate empty restored GPU storage with an unchanged camera and candidate list.
    const candidateBuffer = (grass as any)._candidateBindings[0].buffer;
    const groups = (grass as any)._rings.map((lod: typeof ring) =>
      lod.candidateGroups.slice(0, lod.candidateCount / 64)
    );
    candidateBuffer.setData(new Float32Array(candidateBuffer.byteLength / 4));
    candidateBuffer._isContentLost = true;
    (grass as any)._terrainTex._isContentLost = true;
    const upload = candidateBuffer.setData;
    candidateBuffer.setData = () => {
      throw new Error("injected upload failure");
    };
    expect(() => grass.update(params)).toThrow("injected upload failure");
    candidateBuffer.setData = upload;
    grass.update(params);
    for (let i = 0; i < groups.length; i++) {
      if (!groups[i].length) continue;
      const restored = new Float32Array(groups[i].length);
      candidateBuffer.getData(restored, (grass as any)._rings[i].candidateElements[0].offset);
      expect(restored).toEqual(groups[i]);
    }
    expect(candidateBuffer.isContentLost).toBe(false);
    expect((grass as any)._terrainTex.isContentLost).toBe(false);
    const pass = ring.simulator._shaderPass;
    const outputs = ring.simulator._feedbackVaryings.slice();
    const program = pass._getShaderProgram(engine, ring.shaderData._macroCollection, outputs);
    expect(pass._getShaderProgram(engine, ring.shaderData._macroCollection, outputs.slice())).toBe(program);
    for (const invalid of [outputs.slice(1), outputs.slice().reverse()]) {
      expect(() => pass._getShaderProgram(engine, ring.shaderData._macroCollection, invalid)).toThrow(
        "Transform feedback outputs cannot change"
      );
    }
    const before = renderers.map((r) => (r.mesh as BufferMesh).instanceCount);
    for (let i = 0; i < 3; i++) {
      grass.update({ ...params, active: false });
      expect(renderers.every((r) => !r.enabled)).toBe(true);
      grass.update(params);
      expect(renderers.every((r) => r.enabled)).toBe(true);
      expect(renderers.map((r) => (r.mesh as BufferMesh).instanceCount)).toEqual(before);
    }
    entity.transform.lookAt(new Vector3(0, 0, -20 / Math.tan((89 * Math.PI) / 180)));
    grass.update(params);
    for (const [x, z] of [
      [10, 0],
      [-10, 0],
      [0, 10],
      [0, -10]
    ])
      expect(patch(x, z)).toBeGreaterThan(0);
    camera.isOrthographic = true;
    camera.orthographicSize = 12;
    grass.update(params);
    expect(patch(9.5, -4.5)).toBeGreaterThan(0);
    camera.orthographicSize = 2;
    grass.update(params);
    expect(patch(9.5, -4.5)).toBe(0);
    camera.isOrthographic = false;
    const narrow = { ...params, maximumDistanceMetres: 10 };
    grass.update(narrow);
    grass.update({ ...narrow, active: false });
    grass.update(narrow);
    expect(renderers.map((r) => r.enabled)).toEqual([true, false, false]);
    expect(canvas.getContext("webgl2")!.getError()).toBe(0);
    const meshes = renderers.map((r) => r.mesh as BufferMesh);
    const previousOutputs = meshes.map((mesh) => mesh.vertexBufferBindings.at(-1)!.buffer);
    camera.isOrthographic = true;
    camera.orthographicSize = 72;
    grass.update({ ...params, lod1DistanceMetres: 45, lod2DistanceMetres: 55, maximumDistanceMetres: 65 });
    const replaced = previousOutputs.filter((buffer, i) => buffer !== meshes[i]!.vertexBufferBindings.at(-1)!.buffer);
    expect(replaced.length).toBeGreaterThan(0);
    expect(replaced.every((buffer) => buffer.destroyed)).toBe(true);
    const outputsAtDestroy = meshes.map((mesh) => mesh.vertexBufferBindings.at(-1)!.buffer);
    grass.destroy();
    expect(meshes.every((mesh) => mesh.destroyed)).toBe(true);
    expect(outputsAtDestroy.every((buffer) => buffer.destroyed)).toBe(true);
  } finally {
    engine.destroy();
  }
});
