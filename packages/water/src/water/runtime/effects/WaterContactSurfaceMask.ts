import { Vector3 } from "@galacean/engine-math";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../query/WaterSurfaceProvider";

export const WATER_CONTACT_MASK_SIZE = 65;
const DISTANCE_RANGE = 32;

/** Signed distance from the emitter plane to published water, in meters along its normal.
 * RG stores a signed 16-bit distance; B is valid wet coverage. Linear filtering preserves
 * decoded distance. A stores a world-space feather ahead of intersecting or detached cells,
 * giving steep contacts a visible fade even when their vertical separation changes abruptly.
 */
export function createWaterContactSurfaceMask(
  provider: WaterSurfaceProvider,
  origin: Readonly<Vector3>,
  normal: Readonly<Vector3>,
  radius: number
): Uint8Array {
  const data = new Uint8Array(WATER_CONTACT_MASK_SIZE * WATER_CONTACT_MASK_SIZE * 4);
  const contactDistances = new Float32Array(WATER_CONTACT_MASK_SIZE * WATER_CONTACT_MASK_SIZE);
  const cellSize = (radius * 2) / (WATER_CONTACT_MASK_SIZE - 1);
  const position = new Vector3(),
    sample = createWaterSurfaceSample();
  for (let z = 0; z < WATER_CONTACT_MASK_SIZE; z++) {
    for (let x = 0; x < WATER_CONTACT_MASK_SIZE; x++) {
      const dx = ((x / (WATER_CONTACT_MASK_SIZE - 1)) * 2 - 1) * radius;
      const dz = ((z / (WATER_CONTACT_MASK_SIZE - 1)) * 2 - 1) * radius;
      position.set(origin.x + dx, origin.y, origin.z + dz);
      const valid = normal.y > 0.05 && provider.sampleSurface(position, sample) && sample.waterDepth > 0;
      // All whitewater vertices lie on this plane, offset 8 cm along the macro normal.
      const distance = valid
        ? normal.y * (origin.y - sample.surfacePosition.y) - normal.x * dx - normal.z * dz + 0.08
        : -DISTANCE_RANGE;
      const encoded = Math.round(
        ((Math.max(-DISTANCE_RANGE, Math.min(DISTANCE_RANGE, distance)) / DISTANCE_RANGE) * 0.5 + 0.5) * 65535
      );
      const offset = (z * WATER_CONTACT_MASK_SIZE + x) * 4;
      data[offset] = encoded >> 8;
      data[offset + 1] = encoded & 255;
      data[offset + 2] = valid ? 255 : 0;
      contactDistances[offset / 4] = valid && distance > 0 && distance < 0.8 ? Infinity : 0;
    }
  }
  // Two-pass chamfer distance: feather in world meters before the depth-test intersection,
  // rather than relying on an 8 cm height interval becoming visible on a steep waterfall.
  const size = WATER_CONTACT_MASK_SIZE;
  for (const direction of [1, -1]) {
    const start = direction === 1 ? 0 : size - 1;
    for (let z = start; z >= 0 && z < size; z += direction) {
      for (let x = start; x >= 0 && x < size; x += direction) {
        const i = z * size + x;
        const previousX = x - direction,
          previousZ = z - direction;
        if (previousX >= 0 && previousX < size)
          contactDistances[i] = Math.min(contactDistances[i], contactDistances[z * size + previousX] + cellSize);
        if (previousZ >= 0 && previousZ < size) {
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx >= 0 && x + dx < size)
              contactDistances[i] = Math.min(
                contactDistances[i],
                contactDistances[previousZ * size + x + dx] + cellSize * (dx === 0 ? 1 : Math.SQRT2)
              );
          }
        }
      }
    }
  }
  // Inset by 1.5 cells so bilinear filtering never restores opacity at a clipped contact.
  for (let i = 0; i < contactDistances.length; i++) {
    const t = Math.max(0, Math.min(1, (contactDistances[i] - cellSize * 1.5) / 1.2));
    data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return data;
}
