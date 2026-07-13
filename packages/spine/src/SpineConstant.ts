/**
 * Vertex stride (float count per vertex) of the spine vertex layout owned by `SpineAnimationRenderer`.
 *
 * - `withoutTint`: [x, y, z, u, v, r, g, b, a] = 9 floats
 * - `withTint`:    [x, y, z, u, v, r, g, b, a, dr, dg, db] = 12 floats
 *
 * Shared between the renderer (which declares the vertex elements and allocates buffers) and the
 * version-specific generator in a spine core package (which fills them), so the two never drift.
 */
export const SpineVertexStride = {
  withoutTint: 9,
  withTint: 12
} as const;
