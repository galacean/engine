/** Converts density texels to stable instance roots within one render patch. */
export function forEachDetailRoot(
  density: Uint8Array,
  width: number,
  height: number,
  terrainSize: number,
  channel: number,
  maximumDensity: number,
  patchX: number,
  patchZ: number,
  patchSize: number,
  visit: (x: number, z: number, index: number) => void
): void {
  const stepX = terrainSize / Math.max(1, width - 1);
  const stepZ = terrainSize / Math.max(1, height - 1);
  const left = patchX * patchSize;
  const top = patchZ * patchSize;
  const right = Math.min(terrainSize, left + patchSize);
  const bottom = Math.min(terrainSize, top + patchSize);
  const firstColumn = width === 1 ? 0 : Math.max(0, Math.floor(left / stepX + 0.5));
  const firstRow = height === 1 ? 0 : Math.max(0, Math.floor(top / stepZ + 0.5));
  const lastColumn = Math.min(width - 1, Math.ceil(right / stepX - 0.5));
  const lastRow = Math.min(height - 1, Math.ceil(bottom / stepZ - 0.5));
  for (let row = firstRow; row <= lastRow; row++) {
    const z0 = Math.max(0, (row - 0.5) * stepZ);
    const depth = (height === 1 ? terrainSize : Math.min(terrainSize, (row + 0.5) * stepZ)) - z0;
    for (let column = firstColumn; column <= lastColumn; column++) {
      const texel = (row * width + column) * 4 + channel;
      if (!density[texel]) continue;
      const x0 = Math.max(0, (column - 0.5) * stepX);
      const span = (width === 1 ? terrainSize : Math.min(terrainSize, (column + 0.5) * stepX)) - x0;
      const count = (density[texel] / 255) * span * depth * maximumDensity;
      const phase = unitHash(texel);
      // Dither fractional counts so weak strokes and sparse vegetation still contribute.
      const instanceCount = Math.floor(count + phase);
      const zPhase = unitHash(texel ^ 0x68bc21eb);
      for (let ordinal = 0; ordinal < instanceCount; ordinal++) {
        // Keep the sequence stable as density changes, and spread roots within the texel.
        const x = x0 + span * ((phase + (ordinal + 1) * 0.7548776662466927) % 1);
        const z = z0 + depth * ((zPhase + (ordinal + 1) * 0.5698402909980532) % 1);
        if (x >= left && x < right && z >= top && z < bottom) visit(x, z, Math.imul(texel, 0x1f123bb5) + ordinal);
      }
    }
  }
}

function unitHash(index: number): number {
  let hash = Math.imul(index, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}
