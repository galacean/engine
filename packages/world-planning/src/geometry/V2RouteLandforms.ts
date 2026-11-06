import type { V2Heightfield, V2PlacedBox, V2Point3, V2Road, WorldRecipe } from "../spatial/V2Model.ts";
import { boxFootprint, distance, distanceToBox, sampleHeight, namedRandom } from "./V2Geometry";
import { V2SpatialIndex } from "./V2SpatialIndex";
import type { V2Meter } from "./V2Budget";

/** Build connected broad rock bodies from route spines, then reserve their actual walking surfaces. */
export function buildRouteLandforms(
  recipe: WorldRecipe,
  field: V2Heightfield,
  roads: V2Road[],
  boxes: V2PlacedBox[],
  meter: V2Meter
): void {
  if (!recipe.routes.some((route) => route.ridgeBody)) return;
  for (const road of roads) {
    const body = recipe.routes.find((r) => r.id === road.id)?.ridgeBody;
    if (!body) continue;
    const spacing = Math.max(12, body.width / 4),
      phase = namedRandom(recipe.seed, road.id) * Math.PI * 2;
    let travelled = 0,
      station = 0;
    for (let i = 1; i < road.centerline.length; i++) {
      const a = road.centerline[i - 1],
        b = road.centerline[i];
      travelled += distance(a, b);
      station += distance(a, b);
      if (travelled < spacing && i < road.centerline.length - 1) continue;
      const along = Math.max(1, travelled);
      travelled = 0;
      const width = body.width * (0.86 + 0.18 * Math.sin(station / 53 + phase) + 0.09 * Math.sin(station / 21 + phase));
      const sideCount = 3,
        sideSize = width / sideCount;
      const yaw = Math.atan2(b.z - a.z, b.x - a.x),
        nx = -Math.sin(yaw),
        nz = Math.cos(yaw);
      for (let j = 0; j < sideCount; j++) {
        meter.spend();
        const offset = ((j + 0.5) / sideCount - 0.5) * width,
          f = Math.abs(offset) / (width / 2);
        const x = b.x + nx * offset,
          z = b.z + nz * offset;
        const top = b.y * Math.max(0.04, 1 - body.flankDrop * Math.pow(f, 0.72)) - 0.12;
        const baseY = sampleHeight(field, x, z) - 0.4;
        if (top <= baseY + 0.2) continue;
        boxes.push({
          id: `ridge:${road.id}:${i}:${j}`,
          label: "山脊连续岩体",
          appearance: "rock",
          center: { x, z },
          yaw,
          sizeX: along * 1.15,
          sizeZ: sideSize * 1.03,
          sizeY: top - baseY,
          baseY,
          y: (top + baseY) / 2,
          collision: true,
          occlusion: true
        });
      }
    }
  }
  // Reserve a contact-height corridor instead of rejecting a whole scene or leaving a line through a cliff.
  const pathIndex = new V2SpatialIndex<{ point: V2Point3; radius: number }>();
  const authoredSupports = new Set(recipe.routes.flatMap((route) => route.supportBoxIds ?? []));
  for (const road of roads)
    if (road.kind !== "crossing")
      for (const point of road.centerline) {
        const radius = road.width / 2 + recipe.player.radius + 0.3;
        pathIndex.add(
          { point, radius },
          { minX: point.x - radius, maxX: point.x + radius, minZ: point.z - radius, maxZ: point.z + radius }
        );
      }
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (box.locked || authoredSupports.has(box.id) || box.appearance === "building" || box.appearance === "bridge")
      continue;
    const corners = boxFootprint(box);
    let top = box.baseY + box.sizeY;
    for (const sample of pathIndex.query({
      minX: Math.min(...corners.map((p) => p.x)),
      maxX: Math.max(...corners.map((p) => p.x)),
      minZ: Math.min(...corners.map((p) => p.z)),
      maxZ: Math.max(...corners.map((p) => p.z))
    })) {
      meter.spend();
      if (distanceToBox(box, sample.point.x, sample.point.z) <= sample.radius)
        top = Math.min(top, sample.point.y - 0.06);
    }
    if (top <= box.baseY + 0.05) boxes.splice(i, 1);
    else {
      box.sizeY = top - box.baseY;
      box.y = (box.baseY + top) / 2;
    }
  }
}
