/**
 * Target-backend capabilities required by a parsed shader program.
 *
 * Standard raster ShaderLab passes require `None` (compilable to both GLSL ES 3.00 and WGSL).
 * WebGPU-only shader capabilities (Compute, StorageBuffer, StorageTexture, Atomic) set their
 * corresponding bits so backends that lack hardware support reject compilation deterministically.
 * @internal
 */
export const enum ShaderCapability {
  None = 0,
  Compute = 1 << 0,
  StorageBuffer = 1 << 1,
  StorageTexture = 1 << 2,
  Atomic = 1 << 3,
  Subgroup = 1 << 4
}
