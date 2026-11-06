/** Gothic blueprint arithmetic recovered from 0x101113d8c, hole packing 0x101115bd4.
 * Collision bounds belong to the authored unit asset; they are not scene caches.
 */
import { add, sub, mul, f32 } from "./RecoveredRoofMath";
export interface GothicTransform {
  translation: number[];
  rotation: number[];
  scale: number[];
}
export interface GothicCollisionBounds {
  min: number[];
  max: number[];
}
export interface GothicIdentity {
  id: string;
  hostId: string;
  rank: 1 | 2 | 3;
  seed: number;
  colorId: number;
}
/** glam quaternion-vector multiply, preserving source operation order. */
export function gothicForward(q: number[]): number[] {
  const [x, y, z, w] = q;
  return [
    add(mul(mul(x, z), 2), mul(mul(w, y), 2)),
    sub(mul(mul(y, z), 2), mul(mul(w, x), 2)),
    sub(1, add(mul(mul(x, x), 2), mul(mul(y, y), 2)))
  ];
}
export function gothicBlueprint(
  identity: GothicIdentity,
  transform: GothicTransform,
  bounds: GothicCollisionBounds,
  renderSlot: number
) {
  if (![1, 2, 3].includes(identity.rank)) throw Error("Gothic rank must be 1, 2 or 3");
  if (!Number.isInteger(renderSlot) || renderSlot < 0 || renderSlot > 0xffffffff)
    throw Error("Invalid roof render slot");
  if (
    [...transform.translation, ...transform.rotation, ...transform.scale, ...bounds.min, ...bounds.max].some(
      (x) => !Number.isFinite(x)
    )
  )
    throw Error("Finite transform and collision bounds required");
  const extent = bounds.max.map((x, i) => sub(x, bounds.min[i]));
  extent[0] = f32([0.72, 1.2, 1.54][identity.rank - 1]);
  const forward = gothicForward(transform.rotation),
    midY = mul(add(bounds.min[1], bounds.max[1]), 0.5);
  const center = transform.translation.map((x, i) =>
    add(add(add(x, i === 1 ? midY : 0), mul(mul(forward[i], extent[2]), -0.5)), mul(forward[i], 0.05))
  );
  const hole = new ArrayBuffer(48),
    view = new DataView(hole);
  center.forEach((x, i) => view.setFloat32(i * 4, x, true));
  view.setUint32(12, renderSlot, true);
  extent.forEach((x, i) => view.setFloat32(16 + i * 4, x, true));
  view.setFloat32(32, forward[0], true);
  view.setFloat32(36, forward[2], true);
  view.setFloat32(40, 1.04, true);
  view.setFloat32(44, identity.rank === 3 ? 0.561 : 0.621, true);
  return {
    hole48: new Uint8Array(hole),
    center,
    extent,
    orientation: [forward[0], forward[2]],
    a: f32(1.04),
    b: f32(identity.rank === 3 ? 0.561 : 0.621)
  };
}

/** Full-roof Gothic frame from 0x101113d8c (ev_fa3ee7d94a797c44861a9a606e8a7591b4644a8a83fa18db2c398e7584370fb1).
 * The source replaces library width with rank widths, then stores [roof U, U+width].
 * This is the native roof chart, not the editor plan-view UV or wall arclength.
 * Native placement has unit scale; public resizing extends the interval with the
 * same X scale as the body while retaining the source mesh width for the shader.
 */
export function gothicRoofFrameAttributes(rank: 1 | 2 | 3, roofU: number, scaleX: number, halfTimber: boolean) {
  const meshSizeX = f32([0.72, 1.2, 1.54][rank - 1]);
  if (!Number.isFinite(meshSizeX) || !Number.isFinite(f32(roofU)) || !(scaleX > 0) || !Number.isFinite(f32(scaleX)))
    throw Error("Finite native roof coordinate and positive Gothic frame scale required");
  return {
    meshSizeX,
    wallRange: [f32(roofU), add(roofU, mul(meshSizeX, scaleX))] as [number, number],
    // Byte 0x104 follows WallStyle::is_halftimbered. The adjacent 0x105
    // byte is separate and is not the flag read by the stone-frame shader.
    woodenWall: halfTimber
  };
}
