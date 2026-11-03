/**
 * Resolves the production URL emitted for the immutable Seed World R16 height-brush library.
 * Keep this browser-owned URL resolver out of classic Worker dependency graphs.
 */
export function seedWorldHeightBrushAssetUrl(): URL {
  return new URL("../../integrated-world/data/seed-world/public/height-brushes/terrain3d-height-brushes-v1.r16", import.meta.url);
}
