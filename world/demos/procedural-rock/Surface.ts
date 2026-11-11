/** Final indexed surface in world-space metres. */
export interface RockSurface {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  envelopeBounds?: [number[], number[]];
  bounds: [number[], number[]];
}
