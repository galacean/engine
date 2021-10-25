/**
 * PhysX runtime mode.
 */
export enum PhysXRuntimeMode {
  /** Use webAssembly mode first, if WebAssembly mode is not supported, roll back to JavaScript mode.  */
  Auto,
  /** WebAssembly mode. */
  WebAssembly,
  /** JavaScript mode. */
  JavaScript
}
