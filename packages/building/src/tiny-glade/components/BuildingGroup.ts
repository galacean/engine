import { Matrix } from "@galacean/engine-math";
import type { Entity } from "@galacean/engine";
import { parseMasonryDocument, type MasonryDocument } from "../runtime/MasonryDocument";

/** Read the Scene hierarchy without cancelling two large world matrices. Parent
 * motion must not perturb a child's local compiler inputs through roundoff. */
export function buildingFrameMatrix(entity: Entity, frame: Entity): Matrix {
  const chain: Entity[] = [];
  let current: Entity | null = entity;
  while (current && current !== frame) {
    chain.push(current);
    current = current.parent;
  }
  if (!current) throw Error("Building compilation frame must be its Entity or an ancestor");
  const result = new Matrix();
  for (let i = chain.length - 1; i >= 0; i--) Matrix.multiply(result, chain[i].transform.localMatrix, result);
  return result;
}

export interface BuildingGroupInput {
  document: MasonryDocument;
  /** Body-local to the shared compiler frame, derived from Scene transforms. */
  transform: Matrix;
  poses: ReadonlyMap<string, readonly number[]>;
}

/** The terrain kernel samples in world XZ, while its generated geometry stays
 * in the group's frame. Retain that existing contract instead of resampling the
 * height field (which would change terrain and rock support intersections). */
export function groundedBuildingDocument(document: MasonryDocument, frame: Matrix): MasonryDocument {
  const m = frame.elements;
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  if (
    ![...m].every(Number.isFinite) ||
    ![1, 3, 4, 6, 7, 9, 11, 13].every((i) => close(m[i], 0)) ||
    !close(m[5], 1) ||
    !close(m[15], 1) ||
    !close(m[0], m[10]) ||
    !close(m[2], -m[8]) ||
    !close(m[0] * m[0] + m[2] * m[2], 1)
  )
    throw Error("Terrain-grounded building frames require horizontal translation and yaw at world Y zero");
  return { ...document, placement: { position: [m[12], 0, m[14]], rotationY: Math.atan2(m[8], m[0]) } };
}

/** Transient compiler input only. Connected wall/roof kernels must see all
 * members together; the Source Scene remains the sole editable object model. */
export function buildingGroupInput(inputs: readonly BuildingGroupInput[]) {
  if (!inputs.length) throw Error("A building group requires an active body");
  if (inputs.some((input) => input.document.construction.buildings.length !== 1))
    throw Error("Expected one component body per group input");
  const document: MasonryDocument = {
    version: 1,
    placement: { position: [0, 0, 0], rotationY: 0 },
    construction: { version: 1, environment: { type: "host_terrain" }, identity_order: [], buildings: [] },
    bindings: [],
    overrides: []
  };
  const poses = new Map<string, readonly number[]>();
  const ordered = [...inputs].sort((a, b) =>
    a.document.construction.buildings[0].id.localeCompare(b.document.construction.buildings[0].id)
  );
  for (const input of ordered) {
    const source = structuredClone(input.document),
      body = source.construction.buildings[0];
    const m = input.transform.elements;
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-5;
    if (
      ![...m].every(Number.isFinite) ||
      ![1, 3, 4, 6, 7, 9, 11, 13].every((i) => close(m[i], 0)) ||
      !close(m[5], 1) ||
      !close(m[15], 1) ||
      !close(m[0], m[10]) ||
      !close(m[2], -m[8]) ||
      !close(m[0] * m[0] + m[2] * m[2], 1)
    )
      throw Error(
        "Grouped building bodies require a horizontal rigid transform; edit component dimensions or transform the whole group"
      );
    const shape = body.rectangle ?? body.circle!;
    shape.center = [m[12], m[14]];
    const angle = Math.atan2(m[2], m[0]);
    if (body.rectangle) body.rectangle.rotation = angle;
    else body.circle!.phase = angle;
    document.construction.identity_order.push(body.id);
    document.construction.buildings.push(body);
    document.bindings.push(...source.bindings);
    document.overrides.push(...source.overrides);
    const inverse = new Matrix();
    Matrix.invert(input.transform, inverse);
    for (const [id, binding] of input.poses) {
      if (poses.has(id)) throw Error("Duplicate building component identity: " + id);
      const local = new Matrix(),
        result = new Matrix();
      local.copyFromArray(binding);
      Matrix.multiply(local, inverse, result);
      poses.set(id, Array.from(result.elements));
    }
  }
  return { document: parseMasonryDocument(document), poses };
}
