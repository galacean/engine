/** Gothic blueprint arithmetic recovered from 0x101113d8c, hole packing 0x101115bd4.
 * Collision bounds belong to the authored unit asset; they are not scene caches.
 */
import { add, mul, f32 } from "./RecoveredRoofMath";
export interface GothicCollisionBounds {
  min: number[];
  max: number[];
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
