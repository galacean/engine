import { requireConstructionStoneMesh, type ConstructionStoneGeometry } from "./ConstructionGeometryAssets";
import { Matrix } from "@galacean/engine-math";
import type { AssemblyBinding } from "../resources/BuildingAssembly";
import type { DecorationStoneFrameInstance } from "./DecorationStoneFrameInstance";

export interface ConstructionDecorationFrame {
  id: string;
  ownerId: string;
  decorationId: string;
  mesh: string;
  template: string;
  instance: DecorationStoneFrameInstance;
}

/** Native BrickColor width/range are producer-owned, not inferred from mesh bounds. */
export function constructionDecorationFrame(input: {
  id: string;
  ownerId: string;
  decorationId: string;
  mesh: string;
  binding: AssemblyBinding;
  origin: readonly number[];
  axes: readonly (readonly number[])[];
  wallRange: readonly [number, number];
  meshSizeX: number;
  seed: number;
  wallSlot: number;
  woodenWall: boolean;
}): ConstructionDecorationFrame {
  if (!input.binding.stoneTemplate) throw Error("Frame Prefab has no stone alternative");
  let xform = [...input.axes.flat(), ...input.origin];
  if (input.binding.localMatrix) {
    const parent = new Matrix(),
      local = new Matrix();
    parent.copyFromArray([...input.axes[0], 0, ...input.axes[1], 0, ...input.axes[2], 0, ...input.origin, 1]);
    local.copyFromArray(input.binding.localMatrix);
    Matrix.multiply(parent, local, parent);
    const m = parent.elements;
    xform = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]];
  }
  return {
    id: input.id,
    ownerId: input.ownerId,
    decorationId: input.decorationId,
    mesh: input.mesh,
    template: input.binding.stoneTemplate,
    instance: {
      xform,
      wallRange: [...input.wallRange],
      seed: input.seed,
      wallSlot: input.wallSlot,
      woodenWall: input.woodenWall,
      meshSizeX: input.meshSizeX
    }
  };
}

/** Affine corners plus the native ±.03 XZ world noise; no per-frame work. */
export function decorationFrameBounds(
  geometry: ConstructionStoneGeometry | undefined,
  frame: ConstructionDecorationFrame
) {
  const source = requireConstructionStoneMesh(geometry, frame.template).bounds,
    m = frame.instance.xform;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let bits = 0; bits < 8; bits++) {
    const p = [0, 1, 2].map((i) => (bits & (1 << i) ? source.max[i] : source.min[i]));
    for (let axis = 0; axis < 3; axis++) {
      const v = m[9 + axis] + m[axis] * p[0] + m[3 + axis] * p[1] + m[6 + axis] * p[2];
      const margin = axis === 1 ? 0.0001 : 0.031;
      bounds.min[axis] = Math.min(bounds.min[axis], v - margin);
      bounds.max[axis] = Math.max(bounds.max[axis], v + margin);
    }
  }
  return bounds;
}

/** The structural owner sees the same unwarped source mesh under either material.
 * Native noise is a rendering detail, as with the ordinary decoration batch. */
export function decorationFrameGeometry(
  geometry: ConstructionStoneGeometry | undefined,
  frame: ConstructionDecorationFrame
) {
  const mesh = requireConstructionStoneMesh(geometry, frame.template),
    m = frame.instance.xform,
    positions: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i],
      y = mesh.positions[i + 1],
      z = mesh.positions[i + 2];
    for (let axis = 0; axis < 3; axis++) positions.push(m[9 + axis] + m[axis] * x + m[3 + axis] * y + m[6 + axis] * z);
  }
  return { owner: frame.ownerId, positions, indices: mesh.indices.slice() };
}
