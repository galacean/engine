/**
 * Vertex stride (float count per vertex) of the spine vertex layout owned by `SpineAnimationRenderer`.
 *
 * - `withoutTint`: [x, y, z, r, g, b, a, u, v] = 9 floats
 * - `withTint`:    [x, y, z, r, g, b, a, u, v, dr, dg, db] = 12 floats
 *
 * The renderer supplies the matching stride to backend generators through the geometry contract.
 */
export const SpineVertexStride = {
  withoutTint: 9,
  withTint: 12
} as const;
