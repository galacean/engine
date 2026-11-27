import { BufferMesh, MeshRenderer, type Engine } from "@galacean/engine";
import { afterEach, expect, it, vi } from "vitest";
import { HeadlessEngine } from "../../rhi-null/src/HeadlessEngine";
import { BuildingUnitWallUV } from "../src/building/runtime/BuildingUnitWallUV";
import type { BuildingWallBakeBinding, BuildingWallBakeTexture } from "../src/building/runtime/BuildingWallBakeBinding";

const tile = {
  du: 0.25,
  dv: 0.5,
  offsetU: 0.25,
  offsetV: 0.5,
  bounds: [0, 0, 1, 1] as [number, number, number, number],
  darkUV: [0, 0] as [number, number]
};
const binding: BuildingWallBakeBinding = {
  origin: [0, 0, 0],
  yaw: 0,
  texture: {
    blackUV: [0, 0],
    unbounded: false,
    charts: [
      { nx: 0, nz: 1, plane: 0, start: -4, end: 4, tile },
      { nx: 1, nz: 0, plane: 0, start: -4, end: 4, tile }
    ]
  } as BuildingWallBakeTexture
};
const centers = new Float32Array([2, 1, 0, 1, 0, 1, 2, 1, 3, 1, 0, 1]);

let engine: Engine;
afterEach(() => {
  if (engine) engine.destroy();
  vi.unstubAllGlobals();
});

it("uses only uniforms when all selected bricks share a wall projection", async () => {
  vi.stubGlobal("cancelAnimationFrame", () => {});
  engine = await HeadlessEngine.create();
  const mesh = new BufferMesh(engine);
  const wall = new BuildingUnitWallUV(engine, binding, centers, Uint32Array.of(0, 2));
  wall.attach(mesh, 0);
  const data = engine.sceneManager.activeScene.createRootEntity().addComponent(MeshRenderer).shaderData;
  wall.bind(data);
  expect(data.getVector4("renderer_WallUnitPlane").x).toBe(0.25);
  expect(mesh.vertexBufferBindings).toHaveLength(0);
  expect(wall.byteLength).toBe(0);
  expect(wall.update(0, Uint32Array.of(2, 0), 2)).toBe(0);
  mesh.destroy();
  wall.destroy();
});

it("keeps mixed wall projections aligned with compact visible IDs on each LOD", async () => {
  vi.stubGlobal("cancelAnimationFrame", () => {});
  engine = await HeadlessEngine.create();
  const meshes = [new BufferMesh(engine), new BufferMesh(engine)];
  const wall = new BuildingUnitWallUV(engine, binding, centers, Uint32Array.of(0, 1, 2));
  meshes.forEach((mesh, lod) => wall.attach(mesh, lod));
  expect(meshes[0].vertexElements.every((e) => e.instanceStepRate === 1)).toBe(true);
  const { buffer, stride } = meshes[0].vertexBufferBindings[0]!;
  expect(wall.update(0, Uint32Array.of(0, 1, 2), 3)).toBe(3 * stride);
  expect(wall.update(0, Uint32Array.of(2, 1), 2)).toBe(0);
  expect(wall.update(1, Uint32Array.of(1), 1)).toBe(stride);
  expect(wall.update(0, Uint32Array.of(1, 2), 2)).toBe(2 * stride);
  const values = new Float32Array((stride / 4) * 2);
  buffer.getData(values);
  expect(values[1]).toBe(-0.25);
  expect(values[stride / 4]).toBe(0.25);
  expect(wall.byteLength).toBe(2 * 3 * stride);
  meshes.forEach((mesh) => mesh.destroy());
  wall.destroy();
});
