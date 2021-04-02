/**
 * Mesh topology.
 */
export enum MeshTopology {
  /** Draws a single dot */
  Points = 0,
  /** Draws a line between a pair of vertices */
  Lines = 1,
  /** Draws a straight line to the next vertex, and connects the last vertex back to the first */
  LineLoop = 2,
  /** Draws a straight line to the next vertex. */
  LineStrip = 3,
  /** Draws a triangle for a group of three vertices */
  Triangles = 4,
  /** Draws a triangle strip */
  TriangleStrip = 5,
  /** Draws a triangle fan */
  TriangleFan = 6
}
