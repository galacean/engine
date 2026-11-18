/** RGBA8 holds an unsigned identity in the low bits and logarithmic view depth in the high bits.
 * At least 14 identity bits keep shader depth integers within exact float32 precision.
 * Packed batches count every pickable slot, not just renderers. Never truncate an identity. */
export function snapshotIdentityBits(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0 || count > 0xffffff)
    throw new Error("Snapshot exceeds the 24-bit identity range");
  return Math.max(14, Math.ceil(Math.log2(count + 1)));
}
export interface SnapshotSurfaceProjection {
  identityBits: number;
  near: number;
  far: number;
  inverseProjection: readonly number[];
  cameraWorld: readonly number[];
  viewport: readonly number[];
}
export function snapshotPixelWord(pixels: Uint8Array, offset: number): number {
  // Arithmetic avoids signed bitwise overflow when alpha's high bit is set.
  return pixels[offset]! + pixels[offset + 1]! * 256 + pixels[offset + 2]! * 65536 + pixels[offset + 3]! * 16777216;
}
export function snapshotPixelIdentity(pixels: Uint8Array, offset: number, bits: number): number {
  return snapshotPixelWord(pixels, offset) % 2 ** bits;
}
function transform(m: readonly number[], x: number, y: number, z: number): [number, number, number] {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w
  ];
}
/** Pixel-center reconstruction from the frozen camera; no dependency on the live scene. */
export function snapshotEstimatedPosition(
  pixels: Uint8Array,
  offset: number,
  x: number,
  y: number,
  width: number,
  height: number,
  projection: SnapshotSurfaceProjection
): [number, number, number] | undefined {
  const word = snapshotPixelWord(pixels, offset),
    identityScale = 2 ** projection.identityBits;
  if (word % identityScale === 0) return;
  const depthCode = Math.floor(word / identityScale),
    maxDepth = 2 ** (32 - projection.identityBits) - 1;
  const depth = projection.near * 2 ** ((depthCode / maxDepth) * Math.log2(projection.far / projection.near));
  const v = projection.viewport;
  const nx = (((x + 0.5) / width - v[0]!) / v[2]!) * 2 - 1;
  const ny = 1 - (((y + 0.5) / height - v[1]!) / v[3]!) * 2;
  const a = transform(projection.inverseProjection, nx, ny, -1);
  const b = transform(projection.inverseProjection, nx, ny, 1);
  const t = (-depth - a[2]) / (b[2] - a[2]);
  const point = transform(projection.cameraWorld, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -depth);
  return point.every(Number.isFinite) ? point : undefined;
}
