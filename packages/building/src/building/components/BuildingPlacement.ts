import { Component, Matrix, Vector3, type Entity } from "@galacean/engine";
import { BuildingPartComponent } from "../parts/architecture/BuildingPartComponent";
import { normalizeProfileFootprint, type ProfileFootprint } from "../runtime/ProfileParameters";

export interface BuildingLandQuery {
  sampleHeight(x: number, z: number): number | undefined;
  isWater(x: number, z: number): boolean;
}

/** Native transforms and component values are the only source of placement geometry. */
export function buildingPlacementFootprint(root: Entity) {
  if (root.destroyed || root.pendingDestroy) throw Error("Building placement requires a live Entity");
  const origin = root.transform.worldPosition.clone();
  const parentMatrix = root.parent?.transform.worldMatrix.clone() ?? new Matrix();
  const points: [number, number][] = [];
  let ancestor = root.parent;
  while (ancestor) {
    if (!ancestor.isActive) throw Error("No active finite building footprint to place");
    ancestor = ancestor.parent;
  }
  const visit = (entity: Entity) => {
    if (!entity.isActive || entity.destroyed || entity.pendingDestroy) return;
    for (const component of entity.getComponents(Component, [])) {
      if (!(component instanceof BuildingPartComponent) || !component.enabled) continue;
      const definition = component.definition;
      if (!definition || !["wallProfile", "wallStrip"].includes(definition.support.generator)) continue;
      for (const [x, z] of footprint(normalizeProfileFootprint(definition.support.params))) {
        const point = new Vector3(x, 0, z);
        Vector3.transformCoordinate(point, entity.transform.worldMatrix, point);
        points.push([point.x - origin.x, point.z - origin.z]);
      }
    }
    for (const child of entity.children) visit(child);
  };
  visit(root);
  if (!points.length || points.some((point) => !point.every(Number.isFinite)))
    throw Error("No active finite building footprint to place");
  return { points, origin, parentMatrix };
}
function footprint(shape: ProfileFootprint): [number, number][] {
  const points: [number, number][] = [];
  if (shape.circle) {
    const r = shape.circle.radius,
      n = Math.max(8, Math.ceil(2 * Math.PI * r)),
      m = Math.ceil(2 * r);
    for (let i = 0; i < n; i++) points.push([r * Math.cos((i * 2 * Math.PI) / n), r * Math.sin((i * 2 * Math.PI) / n)]);
    for (let j = 0; j <= m; j++)
      for (let i = 0; i <= m; i++) {
        const x = -r + (2 * r * i) / m,
          z = -r + (2 * r * j) / m;
        if (x * x + z * z <= r * r) points.push([x, z]);
      }
  } else {
    const [width, depth] = shape.rectangle!.size;
    const nx = Math.ceil(width),
      nz = Math.ceil(depth);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) points.push([width * (i / nx - 0.5), depth * (j / nz - 0.5)]);
  }
  const center = (shape.rectangle ?? shape.circle)!.center;
  const angle = shape.rectangle?.rotation ?? shape.circle!.phase,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return points.map(([x, z]) => [center[0] + c * x - s * z, center[1] + s * x + c * z]);
}

/** Same finite land-search policy as the original explicit placement command.
 * It proves sampled land contacts only, not obstacle clearance or global
 * feasibility. Native components always follow host terrain; their Y is not
 * raised to a sampled maximum. Only the selected group's translation changes. */
export function placeBuildingOnLand(
  root: Entity,
  anchors: readonly (readonly [number, number])[],
  query: BuildingLandQuery
): [number, number, number] {
  if (!anchors.length || anchors.some((point) => point.length !== 2 || !point.every(Number.isFinite)))
    throw Error("Placement anchors must be finite");
  const { points, origin, parentMatrix } = buildingPlacementFootprint(root);
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const step = Math.max(1, Math.max(maxX - minX, maxZ - minZ) / 2),
    candidates = anchors.map((point) => [...point]);
  for (let ring = 1; ring <= 8; ring++)
    for (const [x, z] of anchors)
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI) / 8;
        candidates.push([x + step * ring * Math.cos(angle), z + step * ring * Math.sin(angle)]);
      }
  for (const [x, z] of candidates) {
    if (
      !points.every(([u, v]) => {
        const height = query.sampleHeight(x + u, z + v);
        return height !== undefined && Number.isFinite(height) && !query.isWater(x + u, z + v);
      })
    )
      continue;
    const inverse = new Matrix();
    if (!parentMatrix.determinant()) throw Error("Building parent transform is singular");
    Matrix.invert(parentMatrix, inverse);
    const local = new Vector3(x, origin.y, z);
    Vector3.transformCoordinate(local, inverse, local);
    return [local.x, local.y, local.z];
  }
  throw Error("当前位置和出生点附近的有限搜索未找到完整陆地占地，请移动到更开阔的陆地后重试");
}
