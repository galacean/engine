/**
 * PhysX runtime mode.
 */
export enum PhysXRuntimeMode {
  /** Use WebAssembly SIMD mode first, then WebAssembly as fallback. */
  Auto,
  /** WebAssembly mode. */
  WebAssembly,
  /** WebAssembly SIMD mode. */
  WebAssemblySIMD
}
